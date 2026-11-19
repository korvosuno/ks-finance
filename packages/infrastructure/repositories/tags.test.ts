import 'fake-indexeddb/auto'
import { createBookkeepingService } from '@ks-finance/application/bookkeeping'
import { createFinanceService } from '@ks-finance/application/finance'
import { expect, test } from 'vitest'
import { FinanceDatabase } from '../database'
import { createDexieBookStore } from './bookkeeping-store'
import { createDexieFinanceStore } from './finance-store'
import { createTagService } from './tags'

test('isolates tag categories and saves all three kinds of links without cascading entity deletion', async () => {
  const database = new FinanceDatabase(crypto.randomUUID())
  try {
    const finance = createFinanceService(createDexieFinanceStore(database))
    const book = createBookkeepingService(createDexieBookStore(database))
    const service = createTagService(database)
    await finance.saveProfile('用户')
    const workspaceInput = {
      name: '家庭',
      timezone: 'Asia/Shanghai',
      type: 'household',
    }
    expect(() =>
      finance.createWorkspace({
        ...workspaceInput,
        timezone: 'invalid',
        newTagNames: ['未保存'],
      }),
    ).toThrow()
    expect(await database.tags.count()).toBe(0)
    const workspace = await finance.createWorkspace({
      ...workspaceInput,
      newTagNames: ['家庭', '其他', '家庭'],
    })
    const tag = async (kind: string) =>
      (await service.load()).tags.find(
        (item) => item.kind === kind && item.name === '家庭',
      )!.id
    await finance.editWorkspace(workspace.id, {
      ...workspaceInput,
      name: '家庭空间',
      newTagNames: ['不应保存'],
    })
    expect(await database.tags.count()).toBe(0)
    expect(await database.tag_links.count()).toBe(0)
    const ledgerInput = {
      name: '日常',
      type: 'personal',
      timezone: 'Asia/Shanghai',
      base_currency: 'CNY',
    }
    const ledger = await finance.createLedger(workspace.id, {
      ...ledgerInput,
      newTagNames: ['家庭'],
    })
    await finance.editLedger(workspace.id, ledger.id, {
      ...ledgerInput,
      name: '新账本',
      tagIds: [await tag('ledger')],
    })
    const accountInput = {
      code: '1000',
      name: '现金',
      account_class: 'ASSET',
      currency: 'CNY',
      is_archived: false,
    }
    await book.saveAccount(ledger.id, {
      ...accountInput,
      newTagNames: ['家庭'],
    })
    const [account] = (await book.load(ledger.id)).accounts
    await book.saveAccount(
      ledger.id,
      { ...accountInput, name: '备用现金', tagIds: [await tag('account')] },
      account.id,
    )
    await book.saveDraft(ledger.id, {
      type: 'expense',
      description: '消费',
      occurred_at: '2026-11-13T01:00:00Z',
      accounting_date: '2026-11-13',
      postings: [{ account_id: account.id, amount: '10' }],
      newTagNames: ['家庭'],
    })
    const [draft] = (await book.load(ledger.id)).transactions
    await book.finishDraft(ledger.id, draft.id, draft.revision, 'post')
    const posted = await database.financial_transactions.get(draft.id)
    await book.editTransactionTags(ledger.id, draft.id, [])
    await book.editTransactionTags(ledger.id, draft.id, [
      await tag('transaction'),
    ])
    expect(await database.financial_transactions.get(draft.id)).toEqual(posted)

    const ledgerTag = await tag('ledger')
    await service.delete(ledgerTag)
    expect(
      await database.tag_links.where('tag_id').equals(ledgerTag).count(),
    ).toBe(0)
    expect(await database.ledgers.get(ledger.id)).toBeDefined()
    expect(await database.workspaces.get(workspace.id)).toMatchObject({
      name: '家庭空间',
    })
    expect((await service.load()).links).toEqual(
      expect.arrayContaining([
        {
          kind: 'account',
          tag_id: await tag('account'),
          target_id: account.id,
        },
        {
          kind: 'transaction',
          tag_id: await tag('transaction'),
          target_id: draft.id,
        },
      ]),
    )
  } finally {
    await database.delete()
  }
})
