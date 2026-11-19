import { RequiredLabel } from './RequiredLabel'
import { HoldConfirmButton } from './HoldConfirmButton'
import { RecordField } from './RecordField'
import { FormDialog } from './FormDialog'
import { TagFields, TagNames } from './TagFields'
import { useState } from 'react'
import { accountClasses } from '@ks-finance/domain/account'
import { fromMinor } from '@ks-finance/domain/transaction'
import type { Book } from '../pages/BookPage'
import { useFinance } from '../app/App'
import { FinanceForm } from './FinanceForm'

const classNames = {
  ASSET: '资产',
  LIABILITY: '负债',
  EQUITY: '权益',
  INCOME: '收入',
  EXPENSE: '支出',
}

export function AccountsPanel({ book }: { book: Book }) {
  const { bookkeeping, saving, save } = useFinance()
  const [editId, setEditId] = useState<string | null>()
  const { ledger, accounts, balances } = book
  const editing = accounts.find(({ id }) => id === editId)

  return (
    <>
      <header className='section-heading'>
        <h3>账户</h3>
        {book.canConfigure && (
          <button
            type='button'
            className='primary-action'
            disabled={saving}
            onClick={() => setEditId(null)}
          >
            创建账户
          </button>
        )}
      </header>
      {accounts.length === 0 && <p>此账本还没有账户。</p>}
      <ul className='record-list'>
        {accounts.map((account) => {
          const parent = accounts.find(({ id }) => id === account.parent_id)
          return (
            <li key={account.id}>
              <strong className='record-title'>
                {account.code && `${account.code} · `}
                {account.name}
              </strong>
              <dl className='record-fields'>
                <RecordField label='账户类别'>
                  {classNames[account.account_class]}
                </RecordField>
                {account.subtype && (
                  <RecordField label='账户子类'>{account.subtype}</RecordField>
                )}
                {account.is_archived && (
                  <RecordField label='状态'>已停用</RecordField>
                )}
                {parent && (
                  <RecordField label='上级账户'>{parent.name}</RecordField>
                )}
                <RecordField label='余额'>
                  <strong className='account-balance'>
                    {fromMinor(
                      (balances[account.id] ?? 0n).toString(),
                      account.currency,
                    )}{' '}
                    {account.currency}
                  </strong>
                </RecordField>
                <TagNames kind='account' targetId={account.id} />
              </dl>
              {book.canConfigure && (
                <div className='record-actions'>
                  <HoldConfirmButton
                    action='删除账户'
                    disabled={saving}
                    onConfirm={() =>
                      save(() =>
                        bookkeeping.deleteAccount(ledger.id, account.id),
                      )
                    }
                  />
                  <button type='button' onClick={() => setEditId(account.id)}>
                    编辑账户
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {book.canConfigure && (
        <>
          {(editing || editId === null) && (
            <FormDialog
              key={editId}
              title={editing ? '编辑账户' : '创建账户'}
              busy={saving}
              onClose={() => setEditId(undefined)}
            >
              <FinanceForm
                sections={<TagFields kind='account' targetId={editing?.id} />}
                key={editId}
                disabled={saving}
                label='保存账户'

                onSave={(fields) =>
                  save(async () => {
                    await bookkeeping.saveAccount(
                      ledger.id,
                      {
                        ...Object.fromEntries(fields),
                        account_class:
                          editing?.account_class ?? fields.get('account_class'),
                        currency: editing?.currency ?? fields.get('currency'),
                        tagIds: fields.getAll('tagId'),
                        newTagNames: fields.getAll('newTagName'),
                        is_archived: fields.has('is_archived'),
                      },
                      editing?.id,
                    )
                    setEditId(undefined)
                  })
                }
              >
                <label>
                  科目代码
                  <input name='code' defaultValue={editing?.code} />
                </label>
                <label>
                  <RequiredLabel>账户名称</RequiredLabel>
                  <input name='name' defaultValue={editing?.name} required />
                </label>
                <label>
                  <RequiredLabel>账户类别</RequiredLabel>
                  <select
                    name='account_class'
                    required
                    defaultValue={editing?.account_class}
                    disabled={!!editing}
                  >
                    {accountClasses.map((item) => (
                      <option key={item} value={item}>
                        {classNames[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <RequiredLabel>账户币种</RequiredLabel>
                  <input
                    name='currency'
                    defaultValue={editing?.currency ?? ledger.base_currency}
                    readOnly={!!editing}
                    required
                    maxLength={3}
                  />
                </label>
                <label>
                  账户子类
                  <input
                    name='subtype'
                    defaultValue={editing?.subtype}
                    placeholder='如 BANK'
                  />
                </label>
                <label>
                  上级账户
                  <select
                    name='parent_id'
                    defaultValue={editing?.parent_id ?? ''}
                  >
                    <option value=''>无</option>
                    {accounts
                      .filter(({ id }) => id !== editId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {classNames[item.account_class]}
                        </option>
                      ))}
                  </select>
                </label>
                {editing && (
                  <label>
                    停用账户
                    <input
                      type='checkbox'
                      name='is_archived'
                      defaultChecked={editing.is_archived}
                    />
                  </label>
                )}
              </FinanceForm>
            </FormDialog>
          )}
        </>
      )}
    </>
  )
}
