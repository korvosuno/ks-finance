import { RequiredLabel } from './RequiredLabel'
import { RecordField } from './RecordField'
import { FormDialog } from './FormDialog'
import { useState } from 'react'
import type { Book } from '../pages/BookPage'
import { useFinance } from '../app/App'
import { FinanceForm } from './FinanceForm'

export function GroupsPanel({ book }: { book: Book }) {
  const { bookkeeping, saving, save } = useFinance()
  const [editId, setEditId] = useState<string | null>()
  const { ledger, groups, accounts, groupMembers } = book
  const editing = groups.find(({ id }) => id === editId)

  return (
    <>
      <header className='section-heading'>
        <h3>账户集合</h3>
        {book.canConfigure && (
          <button
            type='button'
            className='primary-action'
            disabled={saving}
            onClick={() => setEditId(null)}
          >
            创建集合
          </button>
        )}
      </header>
      {groups.length === 0 && <p>此账本还没有账户集合。</p>}
      <ul className='record-list'>
        {groups.map((group) => (
          <li key={group.id}>
            <strong className='record-title'>{group.name}</strong>
            <dl className='record-fields'>
              {group.description && (
                <RecordField label='说明'>{group.description}</RecordField>
              )}
              <RecordField label='包含账户'>
                {accounts
                  .filter(({ id }) =>
                    groupMembers.some(
                      (member) =>
                        member.group_id === group.id &&
                        member.account_id === id,
                    ),
                  )
                  .map(({ name }) => name)
                  .join('、') || '暂无账户'}
              </RecordField>
            </dl>
            {book.canConfigure && (
              <div className='record-actions'>
                <button type='button' onClick={() => setEditId(group.id)}>
                  编辑集合
                </button>
                <FinanceForm
                  label='删除集合'
                  disabled={saving}
                  onSave={async () => {
                    if (window.confirm(`删除集合「${group.name}」？`)) {
                      await save(async () => {
                        await bookkeeping.deleteGroup(ledger.id, group.id)
                        if (editId === group.id) setEditId(undefined)
                      })
                    }
                  }}
                >
                  {null}
                </FinanceForm>
              </div>
            )}
          </li>
        ))}
      </ul>
      {book.canConfigure && (
        <>
          {(editing || editId === null) && (
            <FormDialog
              key={editId}
              title={editing ? '编辑集合' : '创建集合'}
              busy={saving}
              onClose={() => setEditId(undefined)}
            >
              <FinanceForm
                key={editId}
                disabled={saving}
                label='保存集合'

                onSave={(fields) =>
                  save(async () => {
                    await bookkeeping.saveGroup(
                      ledger.id,
                      {
                        name: fields.get('name'),
                        description: fields.get('description'),
                        accountIds: fields.getAll('account'),
                      },
                      editing?.id,
                    )
                    setEditId(undefined)
                  })
                }
              >
                <label>
                  <RequiredLabel>集合名称</RequiredLabel>
                  <input name='name' defaultValue={editing?.name} required />
                </label>
                <label>
                  说明
                  <input
                    name='description'
                    defaultValue={editing?.description}
                  />
                </label>
                {accounts.length > 0 && (
                  <fieldset className='group-members'>
                    <legend>包含账户</legend>
                    {accounts.map((account) => (
                      <label key={account.id} className='check-option'>
                        <input
                          type='checkbox'
                          name='account'
                          value={account.id}
                          defaultChecked={groupMembers.some(
                            (member) =>
                              member.group_id === editId &&
                              member.account_id === account.id,
                          )}
                        />
                        {account.name}
                      </label>
                    ))}
                  </fieldset>
                )}
              </FinanceForm>
            </FormDialog>
          )}
        </>
      )}
    </>
  )
}
