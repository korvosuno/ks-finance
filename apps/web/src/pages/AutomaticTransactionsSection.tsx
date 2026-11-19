import { FinanceDatabase } from '@ks-finance/infrastructure/database'
import type { AutomaticTransactionRule } from '@ks-finance/domain/transaction'
import { useEffect, useState } from 'react'
import { useFinance } from '../app/App'
import { DialogForm, FormDialog } from '../components/FormDialog'
import { RecordField } from '../components/RecordField'
import { RequiredLabel } from '../components/RequiredLabel'
import {
  TransactionForm,
  frequencyNames,
} from '../components/TransactionsPanel'
import type { Book } from './BookPage'

const statusNames = { active: '待执行', completed: '已完成', stopped: '已停止' }

export function AutomaticTransactionsSection() {
  const { bookkeeping, snapshot, saving, save } = useFinance()
  const [books, setBooks] = useState<Book[]>()
  const [selection, setSelection] = useState<{
    ledgerId: string
    rule?: AutomaticTransactionRule
  }>()
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const { ledgers } = snapshot

  useEffect(() => {
    const subscription = FinanceDatabase.liveQuery(() =>
      Promise.all(ledgers.map(({ id }) => bookkeeping.load(id))),
    ).subscribe({
      next: (data) => {
        setBooks(
          data.map((book) => ({
            ...book,
            accounts: book.accounts.filter(({ is_system }) => !is_system),
          })),
        )
        setError(false)
      },
      error: () => setError(true),
    })
    return () => subscription.unsubscribe()
  }, [bookkeeping, ledgers, retry])

  const visibleBooks =
    books?.filter(({ ledger }) => ledgers.some(({ id }) => id === ledger.id)) ??
    []
  const eligible = visibleBooks.filter(
    ({ accounts, canConfigure }) =>
      canConfigure && accounts.some(({ is_archived }) => !is_archived),
  )
  const selectedBook = visibleBooks.find(
    ({ ledger, canConfigure }) =>
      canConfigure && ledger.id === selection?.ledgerId,
  )
  const hasRules = visibleBooks.some(
    ({ automaticRules }) => automaticRules.length > 0,
  )

  return (
    <section aria-labelledby='automatic-transactions-heading'>
      <header className='section-heading'>
        <h3 id='automatic-transactions-heading'>自动交易</h3>
        {eligible.length > 0 && (
          <button
            type='button'
            className='primary-action'
            disabled={saving}
            onClick={() =>
              setSelection({
                ledgerId: eligible.length === 1 ? eligible[0].ledger.id : '',
              })
            }
          >
            新建自动交易
          </button>
        )}
      </header>
      {error ? (
        <>
          <p role='alert'>无法读取自动交易计划。</p>
          <button type='button' onClick={() => setRetry((value) => value + 1)}>
            重试
          </button>
        </>
      ) : !books ? (
        <p role='status'>正在读取自动交易计划…</p>
      ) : (
        !hasRules && <p>此工作空间还没有自动交易计划。</p>
      )}
      {hasRules && (
        <ul className='record-list'>
          {visibleBooks.flatMap((book) =>
            book.automaticRules.map((rule) => {
              const { ledger, canConfigure } = book
              const currencies = new Map(
                book.accounts.map(({ id, currency }) => [id, currency]),
              )
              return (
                <li key={rule.id}>
                  <strong className='record-title'>
                    {rule.template.description}
                  </strong>
                  <dl className='record-fields'>
                    <RecordField label='账本'>{ledger.name}</RecordField>
                    <RecordField label='固定金额'>
                      {rule.template.postings
                        .map((posting) =>
                          [posting.amount, currencies.get(posting.account_id)]
                            .filter(Boolean)
                            .join(' '),
                        )
                        .join(' / ')}
                    </RecordField>
                    <RecordField label='频率'>
                      {rule.frequency === 'once'
                        ? frequencyNames.once
                        : `每 ${rule.interval} ${frequencyNames[rule.frequency]}`}
                    </RecordField>
                    {rule.status === 'active' && (
                      <RecordField label='下一到期日'>
                        {rule.next_date}
                      </RecordField>
                    )}
                    <RecordField label='状态'>
                      {rule.error ? '入账失败' : statusNames[rule.status]}
                    </RecordField>
                  </dl>
                  {rule.error && <p className='error'>{rule.error}</p>}
                  {canConfigure && rule.status === 'active' && (
                    <div className='record-actions'>
                      <button
                        type='button'
                        disabled={saving}
                        onClick={() =>
                          setSelection({ ledgerId: ledger.id, rule })
                        }
                      >
                        编辑计划
                      </button>
                      <DialogForm
                        title='停止计划'
                        label='确认停止'
                        disabled={saving}
                        onSave={() =>
                          save(() =>
                            bookkeeping.stopAutomaticRule(
                              ledger.id,
                              rule.id,
                              rule.revision,
                            ),
                          )
                        }
                      >
                        <p>
                          停止「{rule.template.description}
                          」后，待入账日期将不再生成交易。已入账的交易会保留。
                        </p>
                      </DialogForm>
                    </div>
                  )}
                </li>
              )
            }),
          )}
        </ul>
      )}
      {selection && (
        <FormDialog
          title={selection.rule ? '编辑自动交易' : '新建自动交易'}
          busy={saving}
          onClose={() => setSelection(undefined)}
        >
          <div className='finance-form form-content'>
            {!selection.rule && (
              <div className='form-card form-fields'>
                <label>
                  <RequiredLabel>账本</RequiredLabel>
                  <select
                    value={selection.ledgerId}
                    disabled={saving}
                    onChange={(event) =>
                      setSelection({ ledgerId: event.target.value })
                    }
                  >
                    <option value=''>请选择账本</option>
                    {eligible.map(({ ledger }) => (
                      <option key={ledger.id} value={ledger.id}>
                        {ledger.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className='form-hint'>
                  下次打开应用时，会补记已到期的交易。
                </p>
              </div>
            )}
            {selectedBook ? (
              <TransactionForm
                key={selectedBook.ledger.id}
                book={selectedBook}
                schedule={{
                  rule: selection.rule,
                  onSaved: () => setSelection(undefined),
                }}
              />
            ) : (
              <div className='form-actions'>
                <button type='button' onClick={() => setSelection(undefined)}>
                  关闭
                </button>
              </div>
            )}
          </div>
        </FormDialog>
      )}
    </section>
  )
}
