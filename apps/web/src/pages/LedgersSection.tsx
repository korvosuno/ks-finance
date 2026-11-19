import { RequiredLabel } from '../components/RequiredLabel'
import { RecordField } from '../components/RecordField'
import { FormDialog } from '../components/FormDialog'
import { useState } from 'react'
import { TagFields, TagNames } from '../components/TagFields'
import { Link } from 'react-router'
import { useFinance } from '../app/App'
import { FinanceForm } from '../components/FinanceForm'
import { HoldConfirmButton } from '../components/HoldConfirmButton'

const ledgerTypes = { personal: '个人', shared: '共享' }

export function LedgersSection() {
  const {
    finance,
    snapshot: { activeWorkspace: workspace, ledgers },
    saving,
    save,
  } = useFinance()
  const [editId, setEditId] = useState<string | null>()
  const editing = ledgers.find(
    (ledger) => ledger.id === editId && ledger.canEdit,
  )

  if (!workspace) {
    return (
      <section aria-labelledby='ledgers-heading'>
        <h3 id='ledgers-heading'>账本</h3>
        <p>请先创建工作空间。</p>
        <Link to='/manage/settings'>前往工作空间</Link>
      </section>
    )
  }

  return (
    <section aria-labelledby='ledgers-heading' key={workspace.id}>
      <header className='section-heading'>
        <h3 id='ledgers-heading'>账本</h3>
        {workspace.canCreateLedger && (
          <button
            type='button'
            className='primary-action'
            disabled={saving}
            onClick={() => setEditId(null)}
          >
            创建账本
          </button>
        )}
      </header>
      {ledgers.length === 0 && <p>此工作空间还没有账本。</p>}
      <ul className='record-list'>
        {ledgers.map((ledger) => (
          <li key={ledger.id}>
            <Link
              className='record-title'
              to={`/manage/basics/ledgers/${workspace.id}/${ledger.id}`}
            >
              {ledger.name}
            </Link>
            <dl className='record-fields'>
              <RecordField label='账本类型'>
                {ledgerTypes[ledger.type]}
              </RecordField>
              <RecordField label='基准币种'>{ledger.base_currency}</RecordField>
              <RecordField label='账本时区'>{ledger.timezone}</RecordField>
              {ledger.status === 'archived' && (
                <RecordField label='状态'>已归档</RecordField>
              )}
              <TagNames kind='ledger' targetId={ledger.id} />
            </dl>
            {ledger.canEdit && (
              <div className='record-actions'>
                <HoldConfirmButton
                  action='删除账本'
                  disabled={saving}
                  onConfirm={() =>
                    save(() => finance.deleteLedger(workspace.id, ledger.id))
                  }
                />
                <button type='button' onClick={() => setEditId(ledger.id)}>
                  编辑账本
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {(editing || (editId === null && workspace.canCreateLedger)) && (
        <FormDialog
          key={`${workspace.id}:${editId}`}
          title={editing ? '编辑账本' : '创建账本'}
          busy={saving}
          onClose={() => setEditId(undefined)}
        >
          <FinanceForm
            sections={<TagFields kind='ledger' targetId={editing?.id} />}
            disabled={saving}
            key={editing?.id}
            label='保存账本'
            onSave={(fields) =>
              save(async () => {
                const input = {
                  ...Object.fromEntries(fields),
                  tagIds: fields.getAll('tagId'),
                  newTagNames: fields.getAll('newTagName'),
                }
                if (editing)
                  await finance.editLedger(workspace.id, editing.id, input)
                else await finance.createLedger(workspace.id, input)
                setEditId(undefined)
              })
            }
          >
            <label>
              <RequiredLabel>账本名称</RequiredLabel>
              <input
                name='name'
                defaultValue={editing?.name}
                required
                maxLength={100}
              />
            </label>
            <label>
              <RequiredLabel>账本类型</RequiredLabel>
              <select name='type' defaultValue={editing?.type} required>
                <option value='personal'>个人</option>
                <option value='shared'>共享</option>
              </select>
            </label>
            <label>
              <RequiredLabel>基准币种</RequiredLabel>
              <input
                name='base_currency'
                defaultValue={editing?.base_currency ?? 'CNY'}
                readOnly={!!editing}
                required
                maxLength={3}
                pattern='[A-Za-z]{3}'
              />
            </label>
            <label>
              <RequiredLabel>账本时区</RequiredLabel>
              <input
                name='timezone'
                defaultValue={editing?.timezone ?? workspace.timezone}
                required
              />
            </label>
          </FinanceForm>
        </FormDialog>
      )}
    </section>
  )
}
