import { Link, useNavigate, useSearchParams } from 'react-router'
import { RequiredLabel } from './RequiredLabel'
import { RecordField } from './RecordField'
import { DialogForm, FormDialog } from './FormDialog'
import { TagFields, TagNames } from './TagFields'
import { lazy, Suspense, useState } from 'react'
import {
  automaticFrequencies,
  automaticTransactionTypes,
  fromMinor,
  ledgerDate,
  transactionTypes,
} from '@ks-finance/domain/transaction'
import type {
  AutomaticTransactionRule,
  AutomaticTransactionTemplate,
  FinancialTransaction,
  Posting,
} from '@ks-finance/domain/transaction'
import { useFinance } from '../app/App'
import type { Book } from '../pages/BookPage'
import { FinanceForm } from './FinanceForm'

const WeeklyTransactionsChart = lazy(() => import('./WeeklyTransactionsChart'))

const typeNames = {
  income: '收入',
  expense: '支出',
  transfer: '转账',
  adjustment: '调整',
  opening_balance: '初始入账',
}
export const frequencyNames = {
  once: '一次性',
  daily: '日',
  weekly: '周',
  monthly: '月',
  yearly: '年',
}
const statusNames = {
  draft: '草稿',
  posted: '已过账',
  voided: '已作废',
  reversed: '已冲销',
}
const sideNames = { DEBIT: '借方', CREDIT: '贷方' }

export function TransactionsPanel({ books }: { books: Book[] }) {
  const { saving, snapshot } = useFinance()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const [filters, setFilters] = useSearchParams()
  const [selectedLedger, setSelectedLedger] = useState('')
  const [filterLedger, setFilterLedger] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const eligible = books.filter(
    (book) =>
      book.canWrite && book.accounts.some(({ is_archived }) => !is_archived),
  )
  const creationBook = eligible.find(
    ({ ledger }) => ledger.id === selectedLedger,
  )
  const ledgerNames = new Map(
    books.map(({ ledger }) => {
      const workspace = snapshot.workspaces.find(
        ({ id }) => id === ledger.workspace_id,
      )
      return [
        ledger.id,
        workspace ? `${workspace.name} · ${ledger.name}` : ledger.name,
      ]
    }),
  )
  const allTransactions = books.flatMap(({ transactions }) => transactions)
  const allAccounts = books.flatMap(({ accounts }) => accounts)
  const allPostings = books.flatMap(({ postings }) => postings)
  const ledgerId = filters.get('ledger')
  const filterCount = [
    'ledger',
    'account',
    'q',
    'start',
    'end',
    'type',
    'status',
  ].filter((name) => filters.get(name)).length
  const reversedIds = new Set(
    allTransactions.map(({ reverse_of_id }) => reverse_of_id),
  )
  const accounts = new Map(allAccounts.map((account) => [account.id, account]))
  const postingsByTransaction = new Map<string, Posting[]>()
  for (const posting of allPostings) {
    const entries = postingsByTransaction.get(posting.transaction_id) ?? []
    entries.push(posting)
    postingsByTransaction.set(posting.transaction_id, entries)
  }

  const start = filters.get('start')
  const end = filters.get('end')
  const type = filters.get('type')
  const status = filters.get('status')
  const accountId = filters.get('account')
  const keyword = filters.get('q')?.trim().toLocaleLowerCase()
  const transactions = allTransactions
    .filter((transaction) => {
      if (ledgerId && transaction.ledger_id !== ledgerId) return false
      if (start && transaction.accounting_date < start) return false
      if (end && transaction.accounting_date > end) return false
      if (type && transaction.type !== type) return false
      const displayStatus = reversedIds.has(transaction.id)
        ? 'reversed'
        : transaction.status
      if (status && displayStatus !== status) return false

      const postings = postingsByTransaction.get(transaction.id) ?? []
      if (
        accountId &&
        !postings.some(({ account_id }) => account_id === accountId)
      )
        return false
      if (!keyword) return true

      return [
        transaction.description,
        transaction.payee,
        ...postings.flatMap(({ account_id, memo }) => {
          const account = accounts.get(account_id)
          return [account?.name, account?.code, memo]
        }),
      ].some((value) => value?.toLocaleLowerCase().includes(keyword))
    })
    .sort(
      (a, b) =>
        b.accounting_date.localeCompare(a.accounting_date) ||
        b.created_at.localeCompare(a.created_at),
    )

  return (
    <>
      <Suspense fallback={<p role='status'>正在加载交易趋势…</p>}>
        <WeeklyTransactionsChart transactions={allTransactions} />
      </Suspense>
      <header className='section-heading transaction-actions'>
        <button
          type='button'
          onClick={() => {
            setFilterLedger(ledgerId ?? '')
            setFilterAccount(accountId ?? '')
            setFiltering(true)
          }}
        >
          筛选{filterCount > 0 && `（${filterCount}）`}
        </button>
        {eligible.length > 0 && (
          <button
            className='primary-action'
            type='button'
            disabled={saving}
            onClick={() => {
              setSelectedLedger(
                eligible.length === 1 ? eligible[0].ledger.id : '',
              )
              setCreating(true)
            }}
          >
            新建交易
          </button>
        )}
      </header>
      {filtering && (
        <FormDialog
          title='筛选交易'
          busy={false}
          onClose={() => setFiltering(false)}
        >
          <form
            className='transaction-filters'
            aria-label='筛选交易'
            onSubmit={(event) => {
              event.preventDefault()
              const next = new URLSearchParams()
              for (const [name, value] of new FormData(event.currentTarget)) {
                if (typeof value === 'string' && value.trim())
                  next.set(name, value.trim())
              }
              setFilters(next)
              setFiltering(false)
            }}
            onReset={() => {
              setFilters({})
              setFiltering(false)
            }}
          >
            <label>
              关键字
              <input
                name='q'
                type='search'
                defaultValue={filters.get('q') ?? ''}
                placeholder='描述、交易对方、账户或备注'
              />
            </label>
            <label>
              起始记账日期
              <input name='start' type='date' defaultValue={start ?? ''} />
            </label>
            <label>
              结束记账日期
              <input name='end' type='date' defaultValue={end ?? ''} />
            </label>
            <label>
              类型
              <select name='type' defaultValue={type ?? ''}>
                <option value=''>全部类型</option>
                {transactionTypes.map((option) => (
                  <option key={option} value={option}>
                    {typeNames[option]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              状态
              <select name='status' defaultValue={status ?? ''}>
                <option value=''>全部状态</option>
                {Object.entries(statusNames).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              账本
              <select
                name='ledger'
                value={filterLedger}
                onChange={(event) => {
                  const next = event.target.value
                  setFilterLedger(next)
                  if (next && accounts.get(filterAccount)?.ledger_id !== next)
                    setFilterAccount('')
                }}
              >
                <option value=''>全部账本</option>
                {books.map(({ ledger }) => (
                  <option key={ledger.id} value={ledger.id}>
                    {ledgerNames.get(ledger.id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              账户
              <select
                name='account'
                value={filterAccount}
                onChange={(event) => setFilterAccount(event.target.value)}
              >
                <option value=''>全部账户</option>
                {allAccounts
                  .filter(
                    ({ ledger_id }) =>
                      !filterLedger || ledger_id === filterLedger,
                  )
                  .map(({ id, code, name, ledger_id }) => (
                    <option key={id} value={id}>
                      {!filterLedger && `${ledgerNames.get(ledger_id)} · `}
                      {code ? `${code} · ${name}` : name}
                    </option>
                  ))}
              </select>
            </label>
            <div className='transaction-filter-actions'>
              <button type='submit' className='primary-action'>
                应用筛选
              </button>
              <button type='button' onClick={() => setFiltering(false)}>
                取消
              </button>
              <button type='reset'>重置</button>
            </div>
          </form>
        </FormDialog>
      )}
      {transactions.length === 0 && (
        <p role='status'>
          {allTransactions.length ? '没有匹配的交易。' : '还没有交易。'}
        </p>
      )}
      {transactions.length > 0 && (
        <ul className='transaction-list' aria-label='交易列表'>
          {transactions.map((transaction) => {
            const postings = postingsByTransaction.get(transaction.id) ?? []
            return (
              <li key={transaction.id}>
                <Link
                  to={{
                    pathname: transactionPath(
                      transaction.ledger_id,
                      transaction.id,
                    ),
                    search: filters.toString(),
                  }}
                  title={transaction.description}
                  className='transaction-link'
                >
                  <strong>{transaction.description}</strong>
                  <span>
                    {ledgerNames.get(transaction.ledger_id)} ·{' '}
                    {transaction.accounting_date} ·{' '}
                    {
                      statusNames[
                        reversedIds.has(transaction.id)
                          ? 'reversed'
                          : transaction.status
                      ]
                    }
                  </span>
                  {(['DEBIT', 'CREDIT'] as const).flatMap((side) =>
                    postings
                      .filter((posting) => posting.side === side)
                      .map((posting) => (
                        <span key={posting.id} className='transaction-posting'>
                          <span>{accounts.get(posting.account_id)?.name}</span>
                          <span
                            className={`transaction-amount ${side === 'DEBIT' ? 'transaction-amount-positive' : 'transaction-amount-negative'}`}
                          >
                            {side === 'DEBIT' ? '+' : '-'}
                            {fromMinor(
                              posting.amount_minor,
                              posting.currency,
                            )}{' '}
                            {posting.currency}
                          </span>
                        </span>
                      )),
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {eligible.length === 0 && <p>请先在可写账本中创建一个有效账户。</p>}
      {creating && (
        <FormDialog
          title='新建交易'
          busy={saving}
          onClose={() => setCreating(false)}
        >
          <div className='finance-form form-content'>
            <div className='form-card form-fields'>
              <label>
                <RequiredLabel>账本</RequiredLabel>
                <select
                  value={creationBook?.ledger.id ?? ''}
                  disabled={saving}
                  onChange={(event) => setSelectedLedger(event.target.value)}
                >
                  <option value='' disabled>
                    请选择账本
                  </option>
                  {eligible.map(({ ledger }) => (
                    <option key={ledger.id} value={ledger.id}>
                      {ledgerNames.get(ledger.id)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {creationBook && (
              <TransactionForm
                book={creationBook}
                postings={[]}
                onSaved={(id) => {
                  setCreating(false)
                  navigate({
                    pathname: transactionPath(creationBook.ledger.id, id),
                    search: filters.toString(),
                  })
                }}
              />
            )}
            {!creationBook && (
              <button type='button' onClick={() => setCreating(false)}>
                关闭
              </button>
            )}
          </div>
        </FormDialog>
      )}
    </>
  )
}

function transactionPath(ledgerId: string, id: string) {
  return `/manage/transactions/${encodeURIComponent(ledgerId)}/${encodeURIComponent(id)}`
}

export function TransactionDetails({
  book,
  transaction,
}: {
  book: Book
  transaction: FinancialTransaction
}) {
  const { bookkeeping, saving, save, snapshot } = useFinance()
  const [editing, setEditing] = useState(false)
  const workspace = snapshot.workspaces.find(
    ({ id }) => id === book.ledger.workspace_id,
  )
  const postings = book.postings.filter(
    ({ transaction_id }) => transaction_id === transaction.id,
  )
  const reversed = book.transactions.some(
    ({ reverse_of_id }) => reverse_of_id === transaction.id,
  )
  const accountNames = new Map(book.accounts.map(({ id, name }) => [id, name]))

  return (
    <article className='transaction-detail'>
      <h3 className='record-title'>{transaction.description}</h3>
      <dl className='record-fields'>
        <RecordField label='账本'>
          {workspace
            ? `${workspace.name} · ${book.ledger.name}`
            : book.ledger.name}
        </RecordField>
        <RecordField label='记账日期'>
          {transaction.accounting_date}
        </RecordField>
        <RecordField label='发生时间（UTC）'>
          {new Date(transaction.occurred_at)
            .toISOString()
            .replace('T', ' ')
            .replace('Z', '')}
        </RecordField>
        <RecordField label='交易类型'>
          {typeNames[transaction.type]}
        </RecordField>
        <RecordField label='状态'>
          {statusNames[reversed ? 'reversed' : transaction.status]}
        </RecordField>
        {transaction.payee && (
          <RecordField label='交易对方'>{transaction.payee}</RecordField>
        )}
        <TagNames kind='transaction' targetId={transaction.id} />
      </dl>
      <section aria-label='分录'>
        <h4>分录</h4>
        <ul className='posting-list'>
          {postings.map((posting) => (
            <li key={posting.id}>
              <dl className='record-fields'>
                <RecordField label='账户'>
                  {accountNames.get(posting.account_id)}
                </RecordField>
                <RecordField label='借贷方向'>
                  {sideNames[posting.side]}
                </RecordField>
                <RecordField label='金额'>
                  {fromMinor(posting.amount_minor, posting.currency)}{' '}
                  {posting.currency}
                </RecordField>
                {posting.currency !== book.ledger.base_currency && (
                  <RecordField label='基准金额'>
                    {fromMinor(
                      posting.functional_amount_minor,
                      book.ledger.base_currency,
                    )}{' '}
                    {book.ledger.base_currency}
                  </RecordField>
                )}
                {posting.memo && (
                  <RecordField label='备注'>{posting.memo}</RecordField>
                )}
              </dl>
            </li>
          ))}
        </ul>
      </section>
      {book.canWrite && transaction.status !== 'voided' && (
        <div className='record-actions'>
          {transaction.status === 'posted' && (
            <DialogForm
              title='编辑标签'
              sections={
                <TagFields kind='transaction' targetId={transaction.id} />
              }
              label='保存交易标签'
              disabled={saving}
              onSave={(fields) =>
                save(() =>
                  bookkeeping.editTransactionTags(
                    book.ledger.id,
                    transaction.id,
                    fields.getAll('tagId'),
                    fields.getAll('newTagName'),
                  ),
                )
              }
            />
          )}
          {transaction.status === 'draft' && (
            <>
              <button type='button' onClick={() => setEditing(true)}>
                编辑草稿
              </button>
              <FinanceForm
                label='过账'
                disabled={saving}
                onSave={() =>
                  save(() =>
                    bookkeeping.finishDraft(
                      book.ledger.id,
                      transaction.id,
                      transaction.revision,
                      'post',
                    ),
                  )
                }
              >
                {null}
              </FinanceForm>
              <FinanceForm
                label='作废草稿'
                disabled={saving}
                onSave={async () => {
                  if (window.confirm(`作废「${transaction.description}」？`)) {
                    await save(() =>
                      bookkeeping.finishDraft(
                        book.ledger.id,
                        transaction.id,
                        transaction.revision,
                        'void',
                      ),
                    )
                  }
                }}
              >
                {null}
              </FinanceForm>
            </>
          )}
          {transaction.status === 'posted' &&
            !transaction.reverse_of_id &&
            !reversed && (
              <FinanceForm
                label='冲销'
                disabled={saving}
                onSave={async () => {
                  if (
                    window.confirm(
                      `为「${transaction.description}」生成一笔冲销交易？`,
                    )
                  ) {
                    await save(() =>
                      bookkeeping.reverse(book.ledger.id, transaction.id),
                    )
                  }
                }}
              >
                {null}
              </FinanceForm>
            )}
        </div>
      )}

      {book.canWrite && transaction.status === 'draft' && editing && (
        <FormDialog
          title='编辑草稿'
          busy={saving}
          onClose={() => setEditing(false)}
        >
          <TransactionForm
            book={book}
            editing={transaction}
            postings={postings}
            onSaved={() => setEditing(false)}
          />
        </FormDialog>
      )}
    </article>
  )
}

export function TransactionForm({
  book,
  editing,
  postings = [],
  schedule,
  onSaved,
}: { book: Book } & (
  | {
      schedule: { rule?: AutomaticTransactionRule; onSaved: () => void }
      editing?: never
      postings?: never
      onSaved?: never
    }
  | {
      schedule?: never
      editing?: FinancialTransaction
      postings?: Posting[]
      onSaved: (id: string) => void
    }
)) {
  const { bookkeeping, saving, save } = useFinance()
  const template = schedule?.rule?.template
  const [frequency, setFrequency] =
    useState<(typeof automaticFrequencies)[number]>('once')
  const [type, setType] = useState<FinancialTransaction['type']>(
    editing?.type ?? template?.type ?? 'expense',
  )
  const [rows, setRows] = useState<
    { id: string; posting?: AutomaticTransactionTemplate['postings'][number] }[]
  >(() => {
    const defaults =
      template?.postings ??
      postings.map((posting) => ({
        account_id: posting.account_id,
        side: posting.side,
        amount: fromMinor(
          editing?.type === 'opening_balance' && posting.side === 'CREDIT'
            ? `-${posting.amount_minor}`
            : posting.amount_minor,
          posting.currency,
        ),
        functional_amount: fromMinor(
          posting.functional_amount_minor,
          book.ledger.base_currency,
        ),
        memo: posting.memo,
      }))
    return Array.from({ length: Math.max(defaults.length, 1) }, (_, index) => ({
      id: crypto.randomUUID(),
      posting: defaults[index],
    }))
  })
  const [now] = useState(() => new Date())
  const { ledger } = book
  const opening = type === 'opening_balance'
  const minimumRows = type === 'transfer' || type === 'adjustment' ? 2 : 1
  const [formLedgerId, setFormLedgerId] = useState(ledger.id)
  if (formLedgerId !== ledger.id) {
    setFormLedgerId(ledger.id)
    setRows(
      Array.from({ length: minimumRows }, () => ({ id: crypto.randomUUID() })),
    )
  }
  const automatic = opening || rows.length === 1
  const activeAccounts = book.accounts.filter((account) => !account.is_archived)
  const otherTransactions = new Set(
    book.transactions
      .filter(
        (transaction) =>
          transaction.id !== editing?.id && transaction.status !== 'voided',
      )
      .map(({ id }) => id),
  )
  const usedAccounts = new Set(
    book.postings
      .filter((posting) => otherTransactions.has(posting.transaction_id))
      .map(({ account_id }) => account_id),
  )
  const openingAccounts = activeAccounts.filter(
    (account) => !usedAccounts.has(account.id),
  )
  const allowedAccounts = opening
    ? openingAccounts
    : automatic
      ? activeAccounts.filter(
          (account) =>
            account.account_class === 'ASSET' ||
            account.account_class === 'LIABILITY',
        )
      : activeAccounts

  return (
    <FinanceForm
      sections={
        <>
          {!schedule && <TagFields kind='transaction' targetId={editing?.id} />}
          <div className='posting-rows'>
            {opening && (
              <p>正数借记，负数贷记。仅可选择没有其他未作废交易的账户。</p>
            )}
            {rows.map(({ id, posting }, index) => (
              <PostingFields
                key={id}
                id={id}
                index={index}
                posting={posting}
                book={book}
                allowedAccounts={allowedAccounts}
                automatic={automatic}
                remove={
                  rows.length > minimumRows
                    ? () =>
                        setRows((current) =>
                          current.filter((row) => row.id !== id),
                        )
                    : undefined
                }
              />
            ))}
            {!opening && activeAccounts.length > 1 && (
              <button
                type='button'
                onClick={() => {
                  const row = { id: crypto.randomUUID(), posting: undefined }
                  setRows((current) => [...current, row])
                }}
              >
                添加分录
              </button>
            )}
          </div>
        </>
      }
      label={schedule ? '保存计划' : editing ? '保存草稿' : '入账'}
      secondaryLabel={editing || schedule ? undefined : '保存草稿'}
      disabled={saving}
      onSave={(fields) =>
        save(async () => {
          const input = {
            ...Object.fromEntries(fields),
            postings: rows.map(({ id }) => ({
              account_id: fields.get(`account-${id}`),
              side: fields.get(`side-${id}`) ?? undefined,
              amount: fields.get(`amount-${id}`),
              functional_amount: fields.get(`functional-${id}`) ?? '',
              memo: fields.get(`memo-${id}`) ?? undefined,
            })),
          }
          if (schedule) {
            const rule = schedule.rule
            await bookkeeping.saveAutomaticRule(
              ledger.id,
              input,
              {
                start_date: fields.get('start_date'),
                frequency,
                interval: fields.get('interval') ?? 1,
              },
              rule && { id: rule.id, revision: rule.revision },
            )
            schedule.onSaved()
            return
          }
          const transactionInput = {
            ...input,
            tagIds: fields.getAll('tagId'),
            newTagNames: fields.getAll('newTagName'),
            occurred_at: new Date(
              `${fields.get('occurred_at')}Z`,
            ).toISOString(),
          }
          const id =
            editing || fields.get('intent') === 'draft'
              ? await bookkeeping.saveDraft(
                  ledger.id,
                  transactionInput,
                  editing && { id: editing.id, revision: editing.revision },
                )
              : await bookkeeping.createPosted(ledger.id, transactionInput)
          onSaved(id)
        })
      }
    >
      <label>
        <RequiredLabel>交易描述</RequiredLabel>
        <input
          name='description'
          defaultValue={editing?.description ?? template?.description}
          required
        />
      </label>
      <label>
        交易对方
        <input name='payee' defaultValue={editing?.payee ?? template?.payee} />
      </label>
      <label>
        <RequiredLabel>交易类型</RequiredLabel>
        <select
          name='type'
          required
          value={type}
          onChange={(event) => {
            const next = event.target.value as FinancialTransaction['type']
            setType(next)
            if (next === 'opening_balance')
              setRows((current) => current.slice(0, 1))
            if (
              (next === 'transfer' || next === 'adjustment') &&
              rows.length < 2
            ) {
              const row = { id: crypto.randomUUID() }
              setRows((current) => [...current, row])
            }
          }}
        >
          {(schedule ? automaticTransactionTypes : transactionTypes).map(
            (option) => (
              <option
                key={option}
                value={option}
                disabled={
                  option !== type &&
                  ((option === 'opening_balance' &&
                    openingAccounts.length === 0) ||
                    ((option === 'transfer' || option === 'adjustment') &&
                      activeAccounts.length < 2))
                }
              >
                {typeNames[option]}
              </option>
            ),
          )}
        </select>
      </label>
      {schedule ? (
        schedule.rule ? (
          <p>
            本次修改应用于所有待入账日期。下一到期日为 {schedule.rule.next_date}
            。
          </p>
        ) : (
          <>
            <label>
              <RequiredLabel>首次到期日（{ledger.timezone}）</RequiredLabel>
              <input
                type='date'
                name='start_date'
                defaultValue={ledgerDate(now, ledger.timezone)}
                required
              />
            </label>
            <label>
              <RequiredLabel>频率</RequiredLabel>
              <select
                value={frequency}
                onChange={(event) =>
                  setFrequency(event.target.value as typeof frequency)
                }
              >
                {automaticFrequencies.map((value) => (
                  <option key={value} value={value}>
                    {value === 'once'
                      ? frequencyNames[value]
                      : `按${frequencyNames[value]}`}
                  </option>
                ))}
              </select>
            </label>
            {frequency !== 'once' && (
              <label>
                <RequiredLabel>
                  间隔（{frequencyNames[frequency]}）
                </RequiredLabel>
                <input
                  type='number'
                  name='interval'
                  defaultValue={1}
                  min={1}
                  required
                />
              </label>
            )}
          </>
        )
      ) : (
        <>
          <label>
            <RequiredLabel>发生时间（UTC）</RequiredLabel>
            <input
              type='datetime-local'
              step='0.001'
              name='occurred_at'
              defaultValue={new Date(editing?.occurred_at ?? now)
                .toISOString()
                .slice(0, -1)}
              required
            />
          </label>
          <label>
            <RequiredLabel>记账日期（{ledger.timezone}）</RequiredLabel>
            <input
              type='date'
              name='accounting_date'
              key={ledger.id}
              defaultValue={
                editing?.accounting_date ?? ledgerDate(now, ledger.timezone)
              }
              required
            />
          </label>
        </>
      )}
    </FinanceForm>
  )
}

function PostingFields({
  id,
  index,
  posting,
  book,
  allowedAccounts,
  automatic,
  remove,
}: {
  id: string
  index: number
  posting?: AutomaticTransactionTemplate['postings'][number]
  book: Book
  allowedAccounts: Book['accounts']
  automatic: boolean
  remove?: () => void
}) {
  const [accountId, setAccountId] = useState(posting?.account_id ?? '')
  const account = book.accounts.find(({ id }) => id === accountId)
  const currency = book.ledger.base_currency
  return (
    <div className='posting-entry'>
      <fieldset className='form-card posting-fields'>
        <legend>分录 {index + 1}</legend>
        <label>
          <RequiredLabel>分录账户</RequiredLabel>
          <select
            name={`account-${id}`}
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            required
          >
            <option value=''>请选择账户</option>
            {account &&
              !allowedAccounts.some((item) => item.id === account.id) && (
                <option value={account.id} disabled>
                  {account.name} · 当前不可用
                </option>
              )}
            {allowedAccounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code && `${item.code} · `}
                {item.name} · {item.currency}
              </option>
            ))}
          </select>
        </label>
        {!automatic && (
          <label>
            <RequiredLabel>借贷方向</RequiredLabel>
            <select
              name={`side-${id}`}
              required
              defaultValue={posting?.side ?? (index === 0 ? 'DEBIT' : 'CREDIT')}
            >
              <option value='DEBIT'>借方</option>
              <option value='CREDIT'>贷方</option>
            </select>
          </label>
        )}
        <label>
          <RequiredLabel>
            金额{account && `（${account.currency}）`}
          </RequiredLabel>
          <input
            name={`amount-${id}`}
            inputMode='decimal'
            defaultValue={posting?.amount}
            required
          />
        </label>
        {account && account.currency !== currency && (
          <label>
            <RequiredLabel>基准金额（{currency}）</RequiredLabel>
            <input
              name={`functional-${id}`}
              inputMode='decimal'
              defaultValue={posting?.functional_amount}
              required
            />
          </label>
        )}
        <label>
          备注
          <input name={`memo-${id}`} defaultValue={posting?.memo} />
        </label>
      </fieldset>
      {remove && (
        <button type='button' onClick={remove}>
          移除分录
        </button>
      )}
    </div>
  )
}
