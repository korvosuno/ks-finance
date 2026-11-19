import { RequiredLabel } from '../components/RequiredLabel'
import { Navigate } from 'react-router'
import { useFinance } from '../app/App'
import { FinanceForm } from '../components/FinanceForm'

export function SetupPage() {
  const {
    devices,
    snapshot: { profile, registered },
    saving,
    save,
  } = useFinance()

  if (registered) return <Navigate to='/manage' replace />
  return (
    <section className='panel setup-panel' aria-labelledby='setup-heading'>
      <h2 id='setup-heading'>用户与设备登记</h2>
      <FinanceForm
        disabled={saving}
        label='完成登记'
        onSave={(fields) =>
          save(() =>
            devices.setup({
              displayName: fields.get('display_name'),
              deviceName: fields.get('device_name'),
            }),
          )
        }
      >
        <label>
          <RequiredLabel>显示名称</RequiredLabel>
          <input
            name='display_name'
            defaultValue={profile?.display_name}
            required
            maxLength={100}
          />
        </label>
        <label>
          <RequiredLabel>设备名称</RequiredLabel>
          <input name='device_name' required maxLength={100} />
        </label>
      </FinanceForm>
    </section>
  )
}
