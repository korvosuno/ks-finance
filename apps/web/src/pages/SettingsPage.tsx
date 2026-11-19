import { RequiredLabel } from '../components/RequiredLabel'
import { RecordField } from '../components/RecordField'
import { DialogForm } from '../components/FormDialog'
import { HoldConfirmButton } from '../components/HoldConfirmButton'
import { Navigate } from 'react-router'
import { useFinance } from '../app/App'
import { WorkspacesSection } from './WorkspacesSection'
import { FinanceForm } from '../components/FinanceForm'

export function SettingsPage() {
  const {
    devices,
    snapshot: { profile },
    saving,
    save,
  } = useFinance()

  if (!profile) return <Navigate to='/setup' replace />
  return (
    <section
      className='panel sectioned-panel'
      aria-labelledby='settings-heading'
    >
      <h2 id='settings-heading'>设置</h2>
      <WorkspacesSection />
      <section aria-labelledby='profile-heading'>
        <h3 id='profile-heading'>用户</h3>
        <section
          className='profile-card profile-settings'
          aria-labelledby='profile-settings-heading'
        >
          <h4 id='profile-settings-heading'>编辑信息</h4>
          <FinanceForm
            key={profile.display_name}
            disabled={saving}
            label='保存'
            onSave={(fields) =>
              save(() =>
                devices.renameUser(profile.id, fields.get('display_name')),
              )
            }
          >
            <label>
              <RequiredLabel>显示名称</RequiredLabel>
              <input
                name='display_name'
                defaultValue={profile.display_name}
                required
                maxLength={100}
              />
            </label>
          </FinanceForm>
        </section>
        <section
          className='profile-card profile-unregister'
          aria-labelledby='unregister-heading'
        >
          <h4 id='unregister-heading'>注销用户</h4>
          <p>
            注销会删除当前用户资料和设备私钥。历史账务会保留，新用户无法访问原账本。
          </p>
          <div className='warning-actions'>
            <HoldConfirmButton
              action='注销用户'
              disabled={saving}
              onConfirm={() => save(() => devices.unregister(profile.id))}
            />
          </div>
        </section>
      </section>
      <DevicesSection />
    </section>
  )
}

function DevicesSection() {
  const { devices, snapshot, saving, save } = useFinance()

  return (
    <section aria-labelledby='devices-heading'>
      <h3 id='devices-heading'>设备</h3>
      <ul className='record-list'>
        {snapshot.devices.map((device) => (
          <li key={device.id}>
            <strong>
              {device.name}
              {device.id === snapshot.currentId && ' · 当前设备'}
            </strong>
            <dl className='record-fields'>
              <RecordField label='状态'>
                {device.revoked_at ? '已撤销' : '有效'}
              </RecordField>
              <RecordField label='最近活动'>
                <time dateTime={device.last_seen_at}>
                  {new Date(device.last_seen_at).toLocaleString('zh-CN')}
                </time>
              </RecordField>
              <RecordField label='设备 ID'>{device.id}</RecordField>
            </dl>
            {!device.revoked_at && (
              <div className='record-actions'>
                <DialogForm
                  title='编辑设备'
                  key={device.name}
                  label='保存名称'
                  disabled={saving}
                  onSave={(fields) =>
                    save(() => devices.rename(device.id, fields.get('name')))
                  }
                >
                  <label>
                    <RequiredLabel>设备名称</RequiredLabel>
                    <input
                      name='name'
                      defaultValue={device.name}
                      required
                      maxLength={100}
                    />
                  </label>
                </DialogForm>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
