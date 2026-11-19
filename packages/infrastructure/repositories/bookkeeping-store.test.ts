import 'fake-indexeddb/auto'
import { createBookkeepingService } from '@ks-finance/application/bookkeeping'
import { createDeviceService } from '@ks-finance/application/device'
import { createFinanceService } from '@ks-finance/application/finance'
import { expect, test, vi } from 'vitest'
import { FinanceDatabase } from '../database'
import { createDexieBookStore } from './bookkeeping-store'
import { createDexieDeviceStore } from './device-store'
import { createDexieFinanceStore } from './finance-store'

async function setup(database: FinanceDatabase) {
  const finance = createFinanceService(createDexieFinanceStore(database))
  await finance.saveProfile('本地用户')
  const workspace = await finance.createWorkspace({
    name: '家庭',
    type: 'household',
    timezone: 'Asia/Shanghai',
  })
  const ledger = await finance.createLedger(workspace.id, {
    name: '日常',
    type: 'personal',
    timezone: workspace.timezone,
    base_currency: 'CNY',
  })
  const bookkeeping = createBookkeepingService(createDexieBookStore(database))
  return { workspace, ledger, bookkeeping }
}

test('registers distinct non-extractable device keys and revokes the local identity', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const { ledger } = await setup(database)
    const service = createDeviceService(createDexieDeviceStore(database))
    await service.setup({ displayName: '本地用户', deviceName: '笔记本' })
    const { currentId, devices } = await service.load()
    const [device] = devices
    expect(device.id).toBe(currentId)
    expect(device.user_id).toBe(ledger.owner_user_id)
    const keys = await database.device_keys.get(device.user_id)
    expect(keys?.encryption_private_key.extractable).toBe(false)
    expect(keys?.signing_private_key.extractable).toBe(false)
    expect(JSON.parse(device.encryption_public_key).x).not.toBe(
      JSON.parse(device.signing_public_key).x,
    )
    await expect(
      service.setup({ displayName: '本地用户', deviceName: '重复登记' }),
    ).rejects.toThrow('已经登记')
    database.close()
    await database.open()
    await service.rename(device.id, '备用笔记本')
    await service.unregister(device.user_id)
    expect(await service.load()).toEqual({ currentId: undefined, devices: [] })
    expect(await database.devices.get(device.id)).toMatchObject({
      name: '备用笔记本',
      revoked_at: expect.any(String),
    })
    expect(await database.user_profiles.get(device.user_id)).toBeUndefined()
    expect(await database.device_keys.count()).toBe(0)
    expect(await database.ledgers.get(ledger.id)).toEqual(ledger)
  } finally {
    await database.delete()
  }
})

test('creates accounts without a code and clears an existing code', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const { ledger, bookkeeping } = await setup(database)
    const account = {
      name: '现金',
      account_class: 'ASSET',
      currency: 'CNY',
      is_archived: false,
    }
    await bookkeeping.saveAccount(ledger.id, account)
    await bookkeeping.saveAccount(ledger.id, {
      ...account,
      name: '备用现金',
      code: '1000',
    })
    const { accounts } = await bookkeeping.load(ledger.id)
    const reserve = accounts.find(({ code }) => code === '1000')!
    await bookkeeping.saveAccount(
      ledger.id,
      { ...account, name: reserve.name, code: ' ' },
      reserve.id,
    )

    const updated = await bookkeeping.load(ledger.id)
    expect(updated.accounts.map(({ code }) => code)).toEqual(['', ''])
  } finally {
    await database.delete()
  }
})

test('deletes unused accounts and their links while preserving the account hierarchy', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const { ledger, bookkeeping } = await setup(database)
    const account = {
      code: '1000',
      name: '现金',
      account_class: 'ASSET',
      currency: 'CNY',
      is_archived: false,
    }
    await bookkeeping.saveAccount(ledger.id, account)
    const [parent] = (await bookkeeping.load(ledger.id)).accounts
    await bookkeeping.saveAccount(ledger.id, {
      ...account,
      code: '1001',
      name: '备用现金',
      parent_id: parent.id,
      newTagNames: ['备用'],
    })
    const child = (await bookkeeping.load(ledger.id)).accounts.find(
      ({ parent_id }) => parent_id === parent.id,
    )!
    await bookkeeping.saveGroup(ledger.id, {
      name: '备用金',
      accountIds: [child.id],
    })

    await expect(
      bookkeeping.deleteAccount(ledger.id, parent.id),
    ).rejects.toThrow('下级账户')
    await bookkeeping.deleteAccount(ledger.id, child.id)
    const book = await bookkeeping.load(ledger.id)
    expect(book.accounts).toEqual([parent])
    expect(book.groups).toHaveLength(1)
    expect(book.groupMembers).toEqual([])
    expect(await database.tag_links.count()).toBe(0)
    expect(await database.tags.count()).toBe(1)
  } finally {
    await database.delete()
  }
})

test('posts a balanced split transaction, isolates ledger access and reverses it exactly once', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const { ledger, bookkeeping } = await setup(database)
    const service = createDeviceService(createDexieDeviceStore(database))
    await service.setup({ displayName: '本地用户', deviceName: '笔记本' })
    const account = {
      code: '1000',
      name: '现金',
      account_class: 'ASSET',
      currency: 'USD',
      is_archived: false,
    }
    await bookkeeping.saveAccount(ledger.id, account)
    await expect(bookkeeping.saveAccount(ledger.id, account)).rejects.toThrow(
      '科目代码',
    )
    await bookkeeping.saveAccount(ledger.id, {
      ...account,
      code: '5000',
      name: '餐饮',
      account_class: 'EXPENSE',
      currency: 'CNY',
    })
    await bookkeeping.saveAccount(ledger.id, {
      ...account,
      code: '5001',
      name: '交通',
      account_class: 'EXPENSE',
      currency: 'CNY',
    })
    const { accounts } = await bookkeeping.load(ledger.id)
    const cash = accounts.find(({ code }) => code === '1000')!
    const food = accounts.find(({ code }) => code === '5000')!
    const travel = accounts.find(({ code }) => code === '5001')!
    await bookkeeping.saveGroup(ledger.id, {
      name: '日常开支',
      accountIds: [food.id, travel.id],
    })
    await bookkeeping.saveGroup(ledger.id, {
      name: '餐饮统计',
      accountIds: [food.id],
    })
    expect((await bookkeeping.load(ledger.id)).groupMembers).toHaveLength(3)

    const draft = {
      type: 'expense',
      description: '午饭和出行',
      occurred_at: '2026-11-12T04:00:00Z',
      accounting_date: '2026-11-12',
      postings: [
        { account_id: food.id, side: 'DEBIT', amount: '20.10' },
        { account_id: travel.id, side: 'DEBIT', amount: '5.20' },
        {
          account_id: cash.id,
          side: 'CREDIT',
          amount: '3.5',
          functional_amount: '25.29',
        },
      ],
    }
    await bookkeeping.saveDraft(ledger.id, draft)
    const [saved] = (await bookkeeping.load(ledger.id)).transactions
    expect((await bookkeeping.load(ledger.id)).balances).toEqual({})
    await expect(
      bookkeeping.finishDraft(ledger.id, saved.id, 1, 'post'),
    ).rejects.toThrow('必须相等')
    expect(await database.local_changes.count()).toBe(1)

    draft.postings[2].functional_amount = '25.30'
    await bookkeeping.saveDraft(ledger.id, draft, { id: saved.id, revision: 1 })
    await expect(
      bookkeeping.finishDraft(ledger.id, saved.id, 1, 'post'),
    ).rejects.toThrow('草稿已变更')
    const beforePost = await bookkeeping.load(ledger.id)
    const change = await database.local_changes.toCollection().first()
    const randomUUID = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(change!.id as ReturnType<typeof crypto.randomUUID>)
    try {
      await expect(
        bookkeeping.finishDraft(ledger.id, saved.id, 2, 'post'),
      ).rejects.toMatchObject({ name: 'ConstraintError' })
    } finally {
      randomUUID.mockRestore()
    }
    expect(await bookkeeping.load(ledger.id)).toEqual(beforePost)
    expect(await database.local_changes.count()).toBe(2)
    await bookkeeping.finishDraft(ledger.id, saved.id, 2, 'post')
    const book = await bookkeeping.load(ledger.id)
    await expect(bookkeeping.deleteAccount(ledger.id, cash.id)).rejects.toThrow(
      '已有交易分录',
    )
    expect(book.balances).toEqual({
      [cash.id]: -350n,
      [food.id]: 2010n,
      [travel.id]: 520n,
    })
    expect(await database.local_changes.count()).toBe(3)
    const posted = await database.local_changes
      .filter((item) => item.action === 'post')
      .first()
    expect(posted?.device_id).toBe((await service.load()).currentId)
    expect(
      posted?.postings.find(({ account_id }) => account_id === cash.id)
        ?.functional_amount_minor,
    ).toBe('2530')
    await expect(
      bookkeeping.saveDraft(ledger.id, draft, { id: saved.id, revision: 3 }),
    ).rejects.toThrow('草稿已变更')

    const outcomes = await Promise.allSettled([
      bookkeeping.reverse(ledger.id, saved.id),
      bookkeeping.reverse(ledger.id, saved.id),
    ])
    expect(outcomes.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ])
    expect((await bookkeeping.load(ledger.id)).balances).toEqual({
      [cash.id]: 0n,
      [food.id]: 0n,
      [travel.id]: 0n,
    })
    await database.ledger_members.update([ledger.id, ledger.owner_user_id], {
      role: 'Viewer',
    })
    await expect(bookkeeping.saveDraft(ledger.id, draft)).rejects.toThrow(
      '没有执行此操作',
    )
    await expect(bookkeeping.load(ledger.id)).resolves.toMatchObject({
      canWrite: false,
    })
    await database.ledger_members.update([ledger.id, ledger.owner_user_id], {
      revoked_at: new Date().toISOString(),
    })
    await expect(bookkeeping.load(ledger.id)).rejects.toThrow('没有访问权限')
  } finally {
    await database.delete()
  }
})

test('auto-balances external transactions and restricts signed opening balances to unused accounts', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const { ledger, bookkeeping } = await setup(database)
    await bookkeeping.saveAccount(ledger.id, {
      code: '1000',
      name: '存款',
      account_class: 'ASSET',
      currency: 'CNY',
      is_archived: false,
    })
    const [deposit] = (await bookkeeping.load(ledger.id)).accounts
    const base = {
      occurred_at: '2026-11-12T04:00:00Z',
      accounting_date: '2026-11-12',
    }
    const opening = (
      accountId: string,
      amount: string,
      functional_amount?: string,
    ) => ({
      ...base,
      type: 'opening_balance',
      description: '期初余额',
      postings: [{ account_id: accountId, amount, functional_amount }],
    })
    const expense = {
      ...base,
      type: 'expense',
      description: '超市',
      payee: '商户',
      postings: [{ account_id: deposit.id, amount: '3.40' }],
    }

    const concurrent = await Promise.allSettled([
      bookkeeping.saveDraft(ledger.id, opening(deposit.id, '+100')),
      bookkeeping.saveDraft(ledger.id, opening(deposit.id, '+100')),
    ])
    expect(
      concurrent.map(({ status }) => status).sort(),
      concurrent
        .filter((result) => result.status === 'rejected')
        .map((result) => String(result.reason))
        .join('\n'),
    ).toEqual(['fulfilled', 'rejected'])
    const [first] = (await bookkeeping.load(ledger.id)).transactions
    await bookkeeping.saveDraft(ledger.id, opening(deposit.id, '+100'), {
      id: first.id,
      revision: 1,
    })

    await bookkeeping.saveDraft(ledger.id, expense)
    const draftExpense = (await bookkeeping.load(ledger.id)).transactions.find(
      ({ type }) => type === 'expense',
    )!
    await expect(
      bookkeeping.finishDraft(ledger.id, first.id, 2, 'post'),
    ).rejects.toThrow('已有其他未作废交易')
    await bookkeeping.finishDraft(ledger.id, draftExpense.id, 1, 'void')
    await bookkeeping.finishDraft(ledger.id, first.id, 2, 'post')
    expect((await bookkeeping.load(ledger.id)).balances[deposit.id]).toBe(
      10000n,
    )

    await bookkeeping.saveDraft(ledger.id, expense)
    const book = await bookkeeping.load(ledger.id)
    const next = book.transactions.find(
      ({ type, status }) => type === 'expense' && status === 'draft',
    )!
    const system = book.accounts.filter(
      ({ is_system, subtype }) => is_system && subtype === 'EXTERNAL_EXPENSE',
    )
    expect(system).toHaveLength(1)
    expect(
      book.postings.filter(({ transaction_id }) => transaction_id === next.id),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account_id: deposit.id,
          side: 'CREDIT',
          amount_minor: '340',
        }),
        expect.objectContaining({
          account_id: system[0].id,
          side: 'DEBIT',
          amount_minor: '340',
        }),
      ]),
    )
    await bookkeeping.finishDraft(ledger.id, next.id, 1, 'post')
    expect((await bookkeeping.load(ledger.id)).balances[deposit.id]).toBe(9660n)
    await expect(
      bookkeeping.saveDraft(ledger.id, opening(deposit.id, '10')),
    ).rejects.toThrow('已有其他未作废交易')

    await bookkeeping.saveAccount(ledger.id, {
      code: '2000',
      name: '信用卡',
      account_class: 'LIABILITY',
      currency: 'USD',
      is_archived: false,
    })
    const liability = (await bookkeeping.load(ledger.id)).accounts.find(
      ({ code }) => code === '2000',
    )!
    await bookkeeping.saveDraft(
      ledger.id,
      opening(liability.id, '-5.25', '36.00'),
    )
    const updated = await bookkeeping.load(ledger.id)
    const negative = updated.transactions.find(
      ({ type, status }) => type === 'opening_balance' && status === 'draft',
    )!
    expect(
      updated.postings.filter(
        ({ transaction_id }) => transaction_id === negative.id,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account_id: liability.id,
          side: 'CREDIT',
          amount_minor: '525',
          functional_amount_minor: '3600',
        }),
        expect.objectContaining({
          side: 'DEBIT',
          amount_minor: '525',
          functional_amount_minor: '3600',
        }),
      ]),
    )
    await bookkeeping.finishDraft(ledger.id, negative.id, 1, 'post')
    expect((await bookkeeping.load(ledger.id)).balances[liability.id]).toBe(
      525n,
    )
  } finally {
    await database.delete()
  }
})

test('requires complete enrollment and keeps the same user when replacing missing device keys', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const service = createDeviceService(createDexieDeviceStore(database))
    await expect(
      service.setup({ displayName: '本地用户', deviceName: ' ' }),
    ).rejects.toThrow()
    expect(await database.user_profiles.count()).toBe(0)

    const input = { displayName: '本地用户', deviceName: '笔记本' }
    const attempts = await Promise.allSettled([
      service.setup(input),
      service.setup(input),
    ])
    expect(attempts.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ])
    const [profile] = await database.user_profiles.toArray()
    expect(await database.devices.count()).toBe(1)
    const keys = (await database.device_keys.get(profile.id))!
    await database.device_keys.put({
      ...keys,
      signing_private_key: undefined as unknown as CryptoKey,
    })
    expect((await service.load()).currentId).toBeUndefined()

    await service.setup(input)
    expect(await database.user_profiles.toArray()).toEqual([profile])
    expect(
      (await database.devices.get(keys.device_id))?.revoked_at,
    ).toBeDefined()
    expect((await service.load()).currentId).not.toBe(keys.device_id)
    expect((await service.load()).currentId).toBeDefined()
  } finally {
    await database.delete()
  }
})

test('creates a posted transaction atomically with its tags and change records', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const { ledger, bookkeeping } = await setup(database)
    await createDeviceService(createDexieDeviceStore(database)).setup({
      displayName: '本地用户',
      deviceName: '笔记本',
    })
    await bookkeeping.saveAccount(ledger.id, {
      name: '现金',
      account_class: 'ASSET',
      currency: 'CNY',
      is_archived: false,
    })
    const [cash] = (await bookkeeping.load(ledger.id)).accounts
    const input = {
      type: 'expense',
      description: '午餐',
      occurred_at: '2026-11-18T04:00:00Z',
      accounting_date: '2026-11-18',
      newTagNames: ['午餐'],
      postings: [{ account_id: cash.id, amount: '12.50' }],
    }

    await expect(
      bookkeeping.createPosted(ledger.id, {
        ...input,
        type: 'adjustment',
        postings: [
          { account_id: cash.id, side: 'DEBIT', amount: '12.50' },
          { account_id: cash.id, side: 'CREDIT', amount: '10' },
        ],
      }),
    ).rejects.toThrow('必须相等')

    // Force a real IndexedDB key collision on the post change.
    type Change = Parameters<typeof database.local_changes.add>[0]
    let draftChangeId: Change['id']
    const addChange = database.local_changes.add.bind(database.local_changes)
    const add = vi
      .spyOn(database.local_changes, 'add')
      .mockImplementationOnce((change) => {
        draftChangeId = change.id
        return addChange(change)
      })
      .mockImplementationOnce((change) =>
        addChange({ ...change, id: draftChangeId }),
      )
    try {
      await expect(
        bookkeeping.createPosted(ledger.id, input),
      ).rejects.toMatchObject({ name: 'ConstraintError' })
    } finally {
      add.mockRestore()
    }
    expect(await database.accounts.count()).toBe(1)
    expect(await database.financial_transactions.count()).toBe(0)
    expect(await database.postings.count()).toBe(0)
    expect(await database.tags.count()).toBe(0)
    expect(await database.tag_links.count()).toBe(0)
    expect(await database.local_changes.count()).toBe(0)

    const id = await bookkeeping.createPosted(ledger.id, input)
    const book = await bookkeeping.load(ledger.id)
    expect(book.transactions).toMatchObject([{ id, status: 'posted' }])
    expect(book.balances[cash.id]).toBe(-1250n)
    expect(book.postings).toHaveLength(2)
    expect(await database.tag_links.count()).toBe(1)
    expect(
      (await database.local_changes.toArray())
        .map(({ action }) => action)
        .sort(),
    ).toEqual(['post', 'save'])
  } finally {
    await database.delete()
  }
})

async function automaticFixture(database: FinanceDatabase) {
  const { ledger, bookkeeping } = await setup(database)
  const account = {
    name: '银行',
    account_class: 'ASSET',
    currency: 'CNY',
    is_archived: false,
  }
  await bookkeeping.saveAccount(ledger.id, account)
  const [bank] = (await bookkeeping.load(ledger.id)).accounts
  const expense = {
    type: 'expense',
    description: '房租',
    postings: [{ account_id: bank.id, amount: '10' }],
  }
  return {
    ledger,
    bookkeeping,
    bank,
    account,
    expense,
    run: (iso: string, ledgerIds = [ledger.id]) =>
      bookkeeping.runDueAutomaticRules(
        ledgerIds,
        ledger.owner_user_id,
        new Date(iso),
      ),
  }
}

test('uses the ledger date and original monthly anchor, even with concurrent opens and reversals', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  const second = new FinanceDatabase(database.name)
  try {
    const { ledger, bookkeeping, expense, bank, run } =
      await automaticFixture(database)
    await bookkeeping.saveAutomaticRule(ledger.id, expense, {
      start_date: '2028-01-31',
      frequency: 'monthly',
      interval: 1,
    })
    expect(await database.financial_transactions.count()).toBe(0)
    expect(await database.accounts.count()).toBe(1)
    await run('2028-01-30T15:59:59Z')
    expect(await database.automatic_transaction_occurrences.count()).toBe(0)

    const cutoff = '2028-03-30T16:00:00Z'
    await Promise.all([
      run(cutoff),
      createBookkeepingService(
        createDexieBookStore(second),
      ).runDueAutomaticRules(
        [ledger.id],
        ledger.owner_user_id,
        new Date(cutoff),
      ),
    ])
    const book = await bookkeeping.load(ledger.id)
    expect(
      book.transactions.map(({ accounting_date }) => accounting_date).sort(),
    ).toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
    expect(book.transactions.every(({ status }) => status === 'posted')).toBe(
      true,
    )
    expect(await database.automatic_transaction_occurrences.count()).toBe(3)
    expect(await database.local_changes.count()).toBe(6)
    expect(book.balances[bank.id]).toBe(-3000n)
    expect(book.automaticRules[0].next_date).toBe('2028-04-30')

    await bookkeeping.reverse(ledger.id, book.transactions[0].id)
    await run(cutoff)
    expect(await database.financial_transactions.count()).toBe(4)
    expect(await database.automatic_transaction_occurrences.count()).toBe(3)
    expect((await bookkeeping.load(ledger.id)).balances[bank.id]).toBe(-2000n)
  } finally {
    second.close()
    await database.delete()
  }
})

test('preserves the leap-day anchor and supports multi-week intervals', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const { ledger, bookkeeping, expense, run } =
      await automaticFixture(database)
    await bookkeeping.saveAutomaticRule(ledger.id, expense, {
      start_date: '2024-02-29',
      frequency: 'yearly',
      interval: 2,
    })
    await bookkeeping.saveAutomaticRule(
      ledger.id,
      { ...expense, description: '双周' },
      {
        start_date: '2028-02-15',
        frequency: 'weekly',
        interval: 2,
      },
    )
    await run('2028-02-29T00:00:00Z')
    const { transactions } = await bookkeeping.load(ledger.id)
    const dates = (description: string) =>
      transactions
        .filter((transaction) => transaction.description === description)
        .map(({ accounting_date }) => accounting_date)
        .sort()
    expect(dates('房租')).toEqual(['2024-02-29', '2026-02-28', '2028-02-29'])
    expect(dates('双周')).toEqual(['2028-02-15', '2028-02-29'])
  } finally {
    await database.delete()
  }
})

test('rolls back a failed occurrence, continues other plans, and retries before advancing', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const { ledger, bookkeeping, expense, run } =
      await automaticFixture(database)
    const schedule = {
      start_date: '2028-01-01',
      frequency: 'daily',
      interval: 1,
    }
    await bookkeeping.saveAutomaticRule(ledger.id, expense, schedule)
    const [rule] = (await bookkeeping.load(ledger.id)).automaticRules
    await bookkeeping.saveAutomaticRule(
      ledger.id,
      { ...expense, type: 'income', description: '收入' },
      {
        ...schedule,
        frequency: 'once',
      },
    )
    const failRent = (_key: unknown, { rule_id }: { rule_id: string }) => {
      if (rule_id === rule.id) throw new Error('模拟写入失败')
    }
    database.automatic_transaction_occurrences.hook('creating', failRent)
    await run('2028-01-02T00:00:00Z')
    expect(await database.financial_transactions.count()).toBe(1)
    expect(await database.postings.count()).toBe(2)
    expect(await database.local_changes.count()).toBe(2)
    expect(
      await database.accounts.where('ledger_id').equals(ledger.id).count(),
    ).toBe(2)
    expect(
      await database.automatic_transaction_rules.get(rule.id),
    ).toMatchObject({
      error: '模拟写入失败',
      next_date: '2028-01-01',
      occurrence: 0,
    })

    database.automatic_transaction_occurrences
      .hook('creating')
      .unsubscribe(failRent)
    await run('2028-01-02T00:00:00Z')
    expect(await database.financial_transactions.count()).toBe(3)
    expect(await database.automatic_transaction_occurrences.count()).toBe(3)
    expect(
      await database.automatic_transaction_rules.get(rule.id),
    ).toMatchObject({
      error: undefined,
      next_date: '2028-01-03',
      occurrence: 2,
    })
  } finally {
    await database.delete()
  }
})

test('checks each workspace and skips read-only or archived ledgers', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const { ledger, bookkeeping, expense, account, run } =
      await automaticFixture(database)
    const finance = createFinanceService(createDexieFinanceStore(database))
    const secondWorkspace = await finance.createWorkspace({
      name: '个人',
      type: 'personal',
      timezone: 'Asia/Shanghai',
    })
    const other = await finance.createLedger(secondWorkspace.id, {
      name: '个人账本',
      type: 'personal',
      timezone: 'Asia/Shanghai',
      base_currency: 'CNY',
    })
    await bookkeeping.saveAccount(other.id, account)
    const [otherBank] = (await bookkeeping.load(other.id)).accounts
    const once = { start_date: '2028-01-01', frequency: 'once', interval: 1 }
    const otherExpense = {
      ...expense,
      postings: [{ account_id: otherBank.id, amount: '10' }],
    }
    await bookkeeping.saveAutomaticRule(ledger.id, expense, once)
    await bookkeeping.saveAutomaticRule(other.id, otherExpense, once)
    const membership: [string, string] = [ledger.id, ledger.owner_user_id]
    await database.ledger_members.update(membership, { role: 'Viewer' })
    await database.ledgers.update(other.id, { status: 'archived' })
    const allLedgerIds = (await finance.load()).ledgers.map(({ id }) => id)
    await run('2028-01-01T00:00:00Z', allLedgerIds)
    expect(await database.financial_transactions.count()).toBe(0)
    expect((await bookkeeping.load(ledger.id)).automaticRules).toHaveLength(1)
    await expect(
      bookkeeping.saveAutomaticRule(ledger.id, expense, once),
    ).rejects.toThrow('权限')
    await database.ledger_members.update(membership, { role: 'Admin' })
    await database.ledgers.update(other.id, { status: 'active' })
    await run('2028-01-01T00:00:00Z', allLedgerIds)
    expect((await bookkeeping.load(ledger.id)).transactions).toHaveLength(1)
    expect((await bookkeeping.load(other.id)).transactions).toHaveLength(1)
  } finally {
    await database.delete()
  }
})
