import { RequiredLabel } from '../components/RequiredLabel'
import { RecordField } from '../components/RecordField'
import { FormDialog } from '../components/FormDialog'
import { useState } from 'react'
import { useFinance } from '../app/App'
import { FinanceForm } from '../components/FinanceForm'
import { HoldConfirmButton } from '../components/HoldConfirmButton'

const workspaceTypes = { personal: '个人', household: '家庭' }
const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

export function WorkspacesSection() {
  const {
    finance,
    snapshot: { workspaces, activeWorkspace },
    saving,
    save,
  } = useFinance()
  const [editId, setEditId] = useState<string | null>()
  const [activationError, setActivationError] = useState<string>()
  const editing = workspaces.find(
    ({ id, canCreateLedger }) => id === editId && canCreateLedger,
  )
  return (
    <section aria-labelledby='workspaces-heading'>
      <header className='section-heading'>
        <h3 id='workspaces-heading'>工作空间</h3>
        <button
          type='button'
          className='primary-action'
          disabled={saving}
          onClick={() => setEditId(null)}
        >
          创建工作空间
        </button>
      </header>
      {activationError && (
        <p className='error' role='alert'>
          {activationError}
        </p>
      )}
      {workspaces.length === 0 && <p>还没有工作空间。</p>}
      {workspaces.length > 0 && (
        <ul className='record-list'>
          {workspaces.map((item) => (
            <li key={item.id}>
              <strong>
                {item.name}
                {item.id === activeWorkspace?.id && ' · 当前工作空间'}
              </strong>
              <dl className='record-fields'>
                <RecordField label='空间类型'>
                  {workspaceTypes[item.type]}
                </RecordField>
                <RecordField label='空间时区'>{item.timezone}</RecordField>
              </dl>
              <div className='record-actions'>
                {item.id !== activeWorkspace?.id && (
                  <button
                    type='button'
                    disabled={saving}
                    onClick={async () => {
                      setActivationError(undefined)
                      try {
                        await save(() => finance.activateWorkspace(item.id))
                      } catch (error) {
                        setActivationError(
                          error instanceof Error
                            ? error.message
                            : '无法激活工作空间，请重试。',
                        )
                      }
                    }}
                  >
                    激活工作空间
                  </button>
                )}
                {item.canCreateLedger && (
                  <>
                    <HoldConfirmButton
                      action='删除工作空间'
                      disabled={saving}
                      onConfirm={() =>
                        save(() => finance.deleteWorkspace(item.id))
                      }
                    />
                    <button type='button' onClick={() => setEditId(item.id)}>
                      编辑工作空间
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {(editing || editId === null) && (
        <FormDialog
          key={editId}
          title={editing ? '编辑工作空间' : '创建工作空间'}
          busy={saving}
          onClose={() => setEditId(undefined)}
        >
          <FinanceForm
            key={editing?.id}
            disabled={saving}
            label='保存工作空间'
            onSave={(fields) =>
              save(async () => {
                const input = Object.fromEntries(fields)
                if (editing) await finance.editWorkspace(editing.id, input)
                else await finance.createWorkspace(input)
                setEditId(undefined)
              })
            }
          >
            <label>
              <RequiredLabel>空间名称</RequiredLabel>
              <input
                name='name'
                defaultValue={editing?.name}
                required
                maxLength={100}
              />
            </label>
            <label>
              <RequiredLabel>空间类型</RequiredLabel>
              <select name='type' defaultValue={editing?.type} required>
                <option value='personal'>个人</option>
                <option value='household'>家庭</option>
              </select>
            </label>
            <label>
              <RequiredLabel>空间时区</RequiredLabel>
              <input
                name='timezone'
                defaultValue={editing?.timezone ?? localTimezone}
                required
              />
            </label>
          </FinanceForm>
        </FormDialog>
      )}
    </section>
  )
}
