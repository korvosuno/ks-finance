import { tagIdsInput, tagNamesInput } from './tags'
import { accountClasses } from '@ks-finance/domain/account'
import type { Account, AccountGroup, Side } from '@ks-finance/domain/account'
import {
  assertBalanced,
  automaticFrequencies,
  automaticTransactionTypes,
  ledgerDate,
  nextAutomaticDate,
  toMinor,
  transactionTypes,
} from '@ks-finance/domain/transaction'
import type {
  AutomaticTransactionRule,
  FinancialTransaction,
  LocalTransactionChange,
  Posting,
} from '@ks-finance/domain/transaction'
import type { BookRepository, BookStore } from './bookkeeping-store'
import { z } from 'zod'

const requiredText = z
  .string()
  .trim()
  .min(1, '请填写必填项。')
  .max(200, '内容最多 200 字。')
const optionalText = z.string().trim().max(500).optional()
const currencies = new Set(Intl.supportedValuesOf('currency'))
const accountInput = z.object({
  code: z.string().trim().max(200, '内容最多 200 字。').default(''),
  name: requiredText,
  account_class: z.enum(accountClasses),
  subtype: optionalText,
  parent_id: z.string().optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => currencies.has(value), '请输入有效的币种代码。'),
  is_archived: z.boolean(),
  tagIds: tagIdsInput,
  newTagNames: tagNamesInput,
})
const groupInput = z.object({
  name: requiredText,
  description: optionalText,
  accountIds: z.array(z.string()),
})
const transactionInput = z.object({
  type: z.enum(transactionTypes),
  tagIds: tagIdsInput,
  newTagNames: tagNamesInput,
  description: requiredText,
  payee: optionalText,
  occurred_at: z.iso.datetime({ offset: true }),
  accounting_date: z.iso.date(),
  postings: z
    .array(
      z.object({
        account_id: z.string().min(1, '请选择分录账户。'),
        side: z.enum(['DEBIT', 'CREDIT']).optional(),
        amount: requiredText,
        functional_amount: optionalText,
        memo: optionalText,
      }),
    )
    .min(1, '至少填写一笔分录。'),
})

const automaticTemplateInput = transactionInput
  .pick({ description: true, payee: true, postings: true })
  .extend({ type: z.enum(automaticTransactionTypes) })
const scheduleInput = z.object({
  start_date: z.iso.date(),
  frequency: z.enum(automaticFrequencies),
  interval: z.coerce.number().int().min(1),
})
type BookAccess = NonNullable<Awaited<ReturnType<BookRepository['access']>>>

function canManageAutomatic(
  access: BookAccess | undefined,
): access is BookAccess {
  return (
    !!access &&
    access.ledger.status === 'active' &&
    (access.member.role === 'Owner' || access.member.role === 'Admin')
  )
}

const counterpartAccounts = {
  income: {
    account_class: 'INCOME',
    subtype: 'EXTERNAL_INCOME',
    name: '对外收入',
    normal_balance: 'CREDIT',
  },
  expense: {
    account_class: 'EXPENSE',
    subtype: 'EXTERNAL_EXPENSE',
    name: '对外支出',
    normal_balance: 'DEBIT',
  },
  opening_balance: {
    account_class: 'EQUITY',
    subtype: 'OPENING_BALANCE',
    name: '期初权益',
    normal_balance: 'CREDIT',
  },
} as const

const openingConflict = '该账户已有其他未作废交易，无法初始入账。'

function createCounterpart(
  accounts: Account[],
  type: keyof typeof counterpartAccounts,
  entry: Posting,
) {
  const fields = counterpartAccounts[type]
  const existing = accounts.find(
    (account) =>
      account.is_system &&
      account.subtype === fields.subtype &&
      account.currency === entry.currency,
  )
  const id = existing?.id ?? crypto.randomUUID()
  const code = `SYSTEM-${fields.subtype}-${entry.currency}`
  const account: Account | undefined = existing
    ? undefined
    : {
        ...fields,
        id,
        ledger_id: entry.ledger_id,
        currency: entry.currency,
        code: accounts.some((account) => account.code === code)
          ? `${code}-${id}`
          : code,
        is_system: true,
        is_archived: false,
      }
  const side: Side = entry.side === 'DEBIT' ? 'CREDIT' : 'DEBIT'
  return {
    account,
    posting: {
      ...entry,
      id: crypto.randomUUID(),
      account_id: id,
      side,
      memo: undefined,
    },
  }
}

type DraftAction = 'post' | 'void'

export function createBookkeepingService(store: BookStore) {
  function write<T>(
    ledgerId: string,
    permission: 'configuration' | 'transactions',
    run: (
      repository: BookRepository,
      access: NonNullable<Awaited<ReturnType<BookRepository['access']>>>,
    ) => Promise<T>,
  ) {
    return store.write(async (repository) => {
      const access = await repository.access(ledgerId)
      if (
        !access ||
        access.ledger.status !== 'active' ||
        access.member.role === 'Viewer' ||
        (permission === 'configuration' && access.member.role === 'Member')
      ) {
        throw new Error('你没有执行此操作的账本权限。')
      }
      return run(repository, access)
    })
  }

  function saveTransaction(
    ledgerId: string,
    input: unknown,
    edit?: { id: string; revision: number },
    post = false,
  ) {
    const fields = transactionInput.parse(input)
    return write(ledgerId, 'transactions', (repository, access) =>
      persistTransaction(repository, access, fields, edit, post),
    )
  }

  async function runAutomaticRule(id: string, cutoff: Date, userId: string) {
    while (true) {
      let attempt: AutomaticTransactionRule | undefined
      try {
        const advanced = await store.write(async (repository) => {
          const rule = await repository.automaticRule(id)
          if (!rule || rule.status !== 'active') return false
          const access = await repository.access(rule.ledger_id)
          if (
            !canManageAutomatic(access) ||
            access.member.user_id !== userId ||
            rule.next_date > ledgerDate(cutoff, access.ledger.timezone)
          )
            return false

          attempt = rule
          const transactionId = await persistTransaction(
            repository,
            access,
            {
              ...rule.template,
              accounting_date: rule.next_date,
              occurred_at: new Date().toISOString(),
            },
            undefined,
            true,
          )
          await repository.addAutomaticOccurrence({
            rule_id: rule.id,
            ledger_id: rule.ledger_id,
            scheduled_date: rule.next_date,
            transaction_id: transactionId,
          })
          const next = nextAutomaticDate(rule)
          await repository.putAutomaticRule({
            ...rule,
            next_date: next ?? rule.next_date,
            occurrence: rule.occurrence + 1,
            status: next ? 'active' : 'completed',
            revision: rule.revision + 1,
            error: undefined,
          })
          return !!next
        })
        if (!advanced) return
      } catch (cause) {
        const failed = attempt
        if (!failed) throw cause
        const error =
          cause instanceof Error && cause.name === 'Error'
            ? cause.message
            : '自动入账失败，下次打开应用时重试。'
        await store.write(async (repository) => {
          const rule = await repository.automaticRule(id)
          const access = await repository.access(failed.ledger_id)
          if (
            rule?.revision === failed.revision &&
            canManageAutomatic(access) &&
            access.member.user_id === userId
          )
            await repository.putAutomaticRule({ ...rule, error })
        })
        return
      }
    }
  }

  return {
    load: (ledgerId: string) =>
      store.read(async (repository) => {
        const access = await repository.access(ledgerId)
        if (!access) throw new Error('该账本不存在或你没有访问权限。')
        const records = await repository.records(ledgerId)
        const posted = new Set(
          records.transactions
            .filter(({ status }) => status === 'posted')
            .map(({ id }) => id),
        )
        const accounts = new Map(
          records.accounts.map((account) => [account.id, account]),
        )
        const balances: Record<string, bigint> = {}
        for (const posting of records.postings) {
          const account = accounts.get(posting.account_id)
          if (account && posted.has(posting.transaction_id)) {
            const sign = account.normal_balance === posting.side ? 1n : -1n
            balances[account.id] =
              (balances[account.id] ?? 0n) + sign * BigInt(posting.amount_minor)
          }
        }
        const canWrite =
          access.ledger.status === 'active' && access.member.role !== 'Viewer'
        return {
          ...records,
          automaticRules: await repository.automaticRules(ledgerId),
          ledger: access.ledger,
          balances,
          canWrite,
          canConfigure: canWrite && access.member.role !== 'Member',
        }
      }),

    saveAccount: (ledgerId: string, input: unknown, id?: string) => {
      const { tagIds, newTagNames, ...fields } = accountInput.parse(input)
      return write(
        ledgerId,
        'configuration',
        async (repository, { member }) => {
          const accounts = await repository.accountList(ledgerId)
          const previous = accounts.find((account) => account.id === id)
          if (id && !previous) throw new Error('找不到要编辑的账户。')
          if (previous?.is_system) throw new Error('系统账户不可编辑。')
          if (
            previous &&
            (previous.currency !== fields.currency ||
              previous.account_class !== fields.account_class)
          ) {
            throw new Error('已创建账户的类别和币种不可修改。')
          }
          if (
            fields.code &&
            accounts.some(
              (account) => account.id !== id && account.code === fields.code,
            )
          ) {
            throw new Error('该账本已使用此科目代码。')
          }
          const byId = new Map(accounts.map((account) => [account.id, account]))
          const visited = new Set(id ? [id] : [])
          let parentId = fields.parent_id
          while (parentId) {
            const parent = byId.get(parentId)
            if (
              !parent ||
              parent.is_system ||
              parent.account_class !== fields.account_class ||
              visited.has(parentId)
            ) {
              throw new Error('请选择同类的有效上级账户，账户层级不能循环。')
            }
            visited.add(parentId)
            parentId = parent.parent_id
          }
          const account: Account = {
            ...fields,
            subtype: fields.subtype ?? '',
            parent_id: fields.parent_id || undefined,
            id: id ?? crypto.randomUUID(),
            ledger_id: ledgerId,
            is_system: false,
            normal_balance:
              previous?.normal_balance ??
              (['ASSET', 'EXPENSE'].includes(fields.account_class)
                ? 'DEBIT'
                : 'CREDIT'),
          }
          await repository.putAccount(account)
          if (tagIds || newTagNames)
            await repository.assignTags(
              member.user_id,
              'account',
              account.id,
              tagIds ?? [],
              newTagNames,
            )
        },
      )
    },

    deleteAccount: (ledgerId: string, id: string) =>
      write(ledgerId, 'configuration', async (repository) => {
        const accounts = await repository.accountList(ledgerId)
        const account = accounts.find((account) => account.id === id)
        if (!account) throw new Error('找不到要删除的账户。')
        if (account.is_system) throw new Error('系统账户不可删除。')
        if (accounts.some(({ parent_id }) => parent_id === id))
          throw new Error('请先调整下级账户的归属。')
        if (await repository.hasAccountPostings(id))
          throw new Error('此账户已有交易分录，可在编辑账户中停用。')
        await repository.deleteAccount(id)
      }),

    saveGroup: (ledgerId: string, input: unknown, id?: string) => {
      const fields = groupInput.parse(input)
      return write(ledgerId, 'configuration', async (repository) => {
        const accounts = await repository.accountList(ledgerId)
        const previous = id ? await repository.group(ledgerId, id) : undefined
        if (id && !previous) throw new Error('找不到要编辑的账户集合。')
        const accountIds = [...new Set(fields.accountIds)]
        const allowed = new Set(
          accounts
            .filter((account) => !account.is_system)
            .map((account) => account.id),
        )
        if (!accountIds.every((accountId) => allowed.has(accountId)))
          throw new Error('集合只能包含当前账本中由用户管理的账户。')
        const group: AccountGroup = {
          id: id ?? crypto.randomUUID(),
          ledger_id: ledgerId,
          name: fields.name,
          description: fields.description ?? '',
          created_at: previous?.created_at ?? new Date().toISOString(),
        }
        await repository.putGroup(group, accountIds)
      })
    },

    deleteGroup: (ledgerId: string, id: string) =>
      write(ledgerId, 'configuration', async (repository) => {
        if (!(await repository.group(ledgerId, id)))
          throw new Error('找不到要删除的账户集合。')
        await repository.deleteGroup(id)
      }),

    saveAutomaticRule: (
      ledgerId: string,
      input: unknown,
      schedule?: unknown,
      edit?: { id: string; revision: number },
    ) => {
      const template = automaticTemplateInput.parse(input)
      return write(ledgerId, 'configuration', async (repository, access) => {
        const previous = edit && (await repository.automaticRule(edit.id))
        if (
          edit &&
          (!previous ||
            previous.ledger_id !== ledgerId ||
            previous.status !== 'active' ||
            previous.revision !== edit.revision)
        )
          throw new Error('计划已变更，请刷新后重试。')

        let rule: AutomaticTransactionRule
        if (previous) {
          rule = {
            ...previous,
            template,
            revision: previous.revision + 1,
            error: undefined,
          }
        } else {
          const timing = scheduleInput.parse(schedule)
          rule = {
            ...timing,
            interval: timing.frequency === 'once' ? 1 : timing.interval,
            id: crypto.randomUUID(),
            ledger_id: ledgerId,
            next_date: timing.start_date,
            occurrence: 0,
            status: 'active',
            revision: 1,
            template,
          }
        }
        const { transaction, postings, accounts, counterpartAccount } =
          await prepareTransaction(repository, access, {
            ...template,
            occurred_at: new Date().toISOString(),
            accounting_date: rule.next_date,
          })
        await validatePostings(
          repository,
          access,
          transaction,
          postings,
          counterpartAccount ? [...accounts, counterpartAccount] : accounts,
        )
        await repository.putAutomaticRule(rule)
      })
    },

    stopAutomaticRule: (ledgerId: string, id: string, revision: number) =>
      write(ledgerId, 'configuration', async (repository) => {
        const rule = await repository.automaticRule(id)
        if (
          !rule ||
          rule.ledger_id !== ledgerId ||
          rule.status !== 'active' ||
          rule.revision !== revision
        )
          throw new Error('计划已变更，请刷新后重试。')
        await repository.putAutomaticRule({
          ...rule,
          status: 'stopped',
          revision: revision + 1,
          error: undefined,
        })
      }),

    runDueAutomaticRules: async (
      ledgerIds: string[],
      userId: string,
      cutoff: Date,
    ) => {
      let failed = false
      for (const ledgerId of new Set(ledgerIds)) {
        try {
          const rules = await store.read(async (repository) => {
            const access = await repository.access(ledgerId)
            if (!canManageAutomatic(access) || access.member.user_id !== userId)
              return []
            const today = ledgerDate(cutoff, access.ledger.timezone)
            return (await repository.automaticRules(ledgerId))
              .filter(
                (rule) => rule.status === 'active' && rule.next_date <= today,
              )
              .sort((a, b) => a.next_date.localeCompare(b.next_date))
          })
          for (const rule of rules) {
            try {
              await runAutomaticRule(rule.id, cutoff, userId)
            } catch {
              failed = true
            }
          }
        } catch {
          failed = true
        }
      }
      if (failed) throw new Error('部分自动交易计划无法检查。')
    },

    saveDraft: (
      ledgerId: string,
      input: unknown,
      edit?: { id: string; revision: number },
    ) => saveTransaction(ledgerId, input, edit),
    createPosted: (ledgerId: string, input: unknown) =>
      saveTransaction(ledgerId, input, undefined, true),

    editTransactionTags: (
      ledgerId: string,
      id: string,
      input: unknown,
      names?: unknown,
    ) => {
      const tagIds = tagIdsInput.parse(input)
      const newTagNames = tagNamesInput.parse(names)
      return write(ledgerId, 'transactions', async (repository, { member }) => {
        if (!(await repository.transaction(ledgerId, id)))
          throw new Error('找不到交易。')
        await repository.assignTags(
          member.user_id,
          'transaction',
          id,
          tagIds ?? [],
          newTagNames,
        )
      })
    },

    finishDraft: (
      ledgerId: string,
      id: string,
      revision: number,
      action: DraftAction,
    ) =>
      write(ledgerId, 'transactions', (repository, access) =>
        finishDraft(repository, access, id, revision, action),
      ),

    reverse: (ledgerId: string, id: string) =>
      write(
        ledgerId,
        'transactions',
        async (repository, { ledger, member }) => {
          const original = await repository.transaction(ledgerId, id)
          if (
            !original ||
            original.status !== 'posted' ||
            original.reverse_of_id ||
            (await repository.hasReversal(ledgerId, id))
          ) {
            throw new Error('该交易无法冲销。')
          }
          const now = new Date()
          const timestamp = now.toISOString()
          const transaction: FinancialTransaction = {
            ...original,
            id: crypto.randomUUID(),
            type: 'adjustment',
            description: `冲销：${original.description}`,
            reverse_of_id: id,
            occurred_at: timestamp,
            accounting_date: ledgerDate(now, ledger.timezone),
            created_by: member.user_id,
            created_at: timestamp,
            updated_at: timestamp,
            revision: 1,
          }
          const entries: Posting[] = (
            await repository.entries(ledgerId, id)
          ).map((posting) => ({
            ...posting,
            id: crypto.randomUUID(),
            transaction_id: transaction.id,
            side: posting.side === 'DEBIT' ? 'CREDIT' : 'DEBIT',
          }))
          assertBalanced(entries, ledger.base_currency)
          await saveChange(
            repository,
            member.user_id,
            'reverse',
            transaction,
            entries,
          )
        },
      ),
  }
}

async function prepareTransaction(
  repository: BookRepository,
  access: BookAccess,
  fields: z.infer<typeof transactionInput>,
  previous?: FinancialTransaction,
) {
  const { ledger, member } = access
  const ledgerId = ledger.id
  const accounts = await repository.accountList(ledgerId)
  const now = new Date().toISOString()
  const transaction: FinancialTransaction = {
    id: previous?.id ?? crypto.randomUUID(),
    ledger_id: ledgerId,
    type: fields.type,
    status: 'draft',
    description: fields.description,
    payee: fields.payee || undefined,
    occurred_at: fields.occurred_at,
    accounting_date: fields.accounting_date,
    created_by: previous?.created_by ?? member.user_id,
    created_at: previous?.created_at ?? now,
    updated_at: now,
    revision: (previous?.revision ?? 0) + 1,
  }
  const type = fields.type
  const opening = type === 'opening_balance'
  const single = fields.postings.length === 1
  if (opening && !single) throw new Error('初始入账只能选择一个账户。')
  let counterpartAccount: Account | undefined
  if (single && (type === 'transfer' || type === 'adjustment')) {
    throw new Error('转账和手工调整至少需要两笔分录。')
  }
  const byId = new Map(accounts.map((account) => [account.id, account]))
  const postings: Posting[] = fields.postings.map((posting) => {
    const account = byId.get(posting.account_id)
    if (!account || account.is_archived || account.is_system) {
      throw new Error('请选择当前账本中有效的非系统账户。')
    }
    if (
      single &&
      !opening &&
      account.account_class !== 'ASSET' &&
      account.account_class !== 'LIABILITY'
    ) {
      throw new Error('对外收入或支出请选择一个资产或负债账户。')
    }
    const side = opening
      ? posting.amount.startsWith('-')
        ? 'CREDIT'
        : 'DEBIT'
      : single
        ? type === 'expense'
          ? 'CREDIT'
          : 'DEBIT'
        : posting.side
    if (!side) throw new Error('请选择每笔分录的借贷方向。')
    const amount = toMinor(
      opening ? posting.amount.replace(/^[+-]/, '') : posting.amount,
      account.currency,
    )
    return {
      id: crypto.randomUUID(),
      ledger_id: ledgerId,
      transaction_id: transaction.id,
      account_id: account.id,
      side,
      currency: account.currency,
      amount_minor: amount,
      memo: posting.memo || undefined,
      functional_amount_minor:
        account.currency === ledger.base_currency
          ? amount
          : toMinor(posting.functional_amount ?? '', ledger.base_currency),
    }
  })
  if (single && (type === 'income' || type === 'expense' || opening)) {
    const entry = postings[0]
    if (
      opening &&
      (await repository.hasOtherAccountTransactions(
        ledgerId,
        entry.account_id,
        transaction.id,
      ))
    ) {
      throw new Error(openingConflict)
    }
    const counterpart = createCounterpart(accounts, type, entry)
    counterpartAccount = counterpart.account
    postings.push(counterpart.posting)
  }
  return { transaction, postings, accounts, counterpartAccount }
}

async function persistTransaction(
  repository: BookRepository,
  access: BookAccess,
  fields: z.infer<typeof transactionInput>,
  edit?: { id: string; revision: number },
  post = false,
) {
  const { ledger, member } = access
  const previous = edit && (await repository.transaction(ledger.id, edit.id))
  if (
    edit &&
    (!previous ||
      previous.status !== 'draft' ||
      previous.revision !== edit.revision)
  )
    throw new Error('草稿已变更，请刷新后重试。')
  const { transaction, postings, counterpartAccount } =
    await prepareTransaction(repository, access, fields, previous)
  if (counterpartAccount) await repository.putAccount(counterpartAccount)
  if (fields.tagIds || fields.newTagNames)
    await repository.assignTags(
      member.user_id,
      'transaction',
      transaction.id,
      fields.tagIds ?? [],
      fields.newTagNames,
    )
  await saveChange(repository, member.user_id, 'save', transaction, postings)
  if (post)
    await finishDraft(
      repository,
      access,
      transaction.id,
      transaction.revision,
      'post',
    )
  return transaction.id
}

async function finishDraft(
  repository: BookRepository,
  {
    ledger,
    member,
  }: NonNullable<Awaited<ReturnType<BookRepository['access']>>>,
  id: string,
  revision: number,
  action: DraftAction,
) {
  const ledgerId = ledger.id
  const draft = await repository.transaction(ledgerId, id)
  if (!draft || draft.status !== 'draft' || draft.revision !== revision) {
    throw new Error('草稿已变更，请刷新后重试。')
  }
  const entries = await repository.entries(ledgerId, id)
  if (action === 'post')
    await validatePostings(
      repository,
      { ledger, member },
      draft,
      entries,
      await repository.accountList(ledgerId),
    )
  await saveChange(
    repository,
    member.user_id,
    action,
    {
      ...draft,
      status: action === 'post' ? 'posted' : 'voided',
      revision: revision + 1,
      updated_at: new Date().toISOString(),
    },
    entries,
  )
}

async function validatePostings(
  repository: BookRepository,
  { ledger }: BookAccess,
  draft: FinancialTransaction,
  entries: Posting[],
  accounts: Account[],
) {
  const { id } = draft
  const ledgerId = ledger.id
  const byId = new Map(
    accounts
      .filter((account) => !account.is_archived)
      .map((account) => [account.id, account]),
  )
  if (
    entries.some(
      (entry) => byId.get(entry.account_id)?.currency !== entry.currency,
    )
  ) {
    throw new Error('分录包含无效或已停用的账户。')
  }
  if (draft.type === 'opening_balance') {
    const userEntries = entries.filter(
      (entry) => !byId.get(entry.account_id)?.is_system,
    )
    const counterpart = entries.find(
      (entry) => byId.get(entry.account_id)?.is_system,
    )
    if (
      entries.length !== 2 ||
      userEntries.length !== 1 ||
      byId.get(counterpart?.account_id ?? '')?.subtype !== 'OPENING_BALANCE'
    ) {
      throw new Error('初始入账分录无效。')
    }
    if (
      await repository.hasOtherAccountTransactions(
        ledgerId,
        userEntries[0].account_id,
        id,
      )
    ) {
      throw new Error(openingConflict)
    }
  }
  assertBalanced(entries, ledger.base_currency)
  if (
    draft.type === 'income' &&
    !entries.some(
      (entry) =>
        entry.side === 'CREDIT' &&
        byId.get(entry.account_id)?.account_class === 'INCOME',
    )
  ) {
    throw new Error('收入交易至少需要一笔收入账户贷方分录。')
  }
  if (
    draft.type === 'expense' &&
    !entries.some(
      (entry) =>
        entry.side === 'DEBIT' &&
        byId.get(entry.account_id)?.account_class === 'EXPENSE',
    )
  ) {
    throw new Error('支出交易至少需要一笔支出账户借方分录。')
  }
  if (
    draft.type === 'transfer' &&
    entries.some(
      (entry) =>
        !['ASSET', 'LIABILITY'].includes(
          byId.get(entry.account_id)?.account_class ?? '',
        ),
    )
  ) {
    throw new Error('转账只能使用资产或负债账户。')
  }
}

async function saveChange(
  repository: BookRepository,
  userId: string,
  action: LocalTransactionChange['action'],
  transaction: FinancialTransaction,
  postings: Posting[],
) {
  await repository.putTransaction({
    id: crypto.randomUUID(),
    ledger_id: transaction.ledger_id,
    device_id: await repository.currentDeviceId(userId),
    action,
    created_at: transaction.updated_at,
    transaction,
    postings,
  })
}
