import { createTagService } from '@ks-finance/infrastructure/tags'
import { createBookkeepingService } from '@ks-finance/application/bookkeeping'
import { createDeviceService } from '@ks-finance/application/device'
import { createDexieBookStore } from '@ks-finance/infrastructure/bookkeeping-store'
import { createDexieDeviceStore } from '@ks-finance/infrastructure/device-store'
import { createFinanceService } from '@ks-finance/application/finance'
import { FinanceDatabase } from '@ks-finance/infrastructure/database'
import { createDexieFinanceStore } from '@ks-finance/infrastructure/finance-store'
import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Outlet, useOutletContext } from 'react-router'

const database = new FinanceDatabase()
const finance = createFinanceService(createDexieFinanceStore(database))
const bookkeeping = createBookkeepingService(createDexieBookStore(database))
const devices = createDeviceService(createDexieDeviceStore(database))

const tagService = createTagService(database)

async function load() {
  const [financeSnapshot, deviceSnapshot, tagSnapshot] = await Promise.all([
    finance.load(),
    devices.load(),
    tagService.load(),
  ])
  const registered = deviceSnapshot.devices.some(
    (device) =>
      device.id === deviceSnapshot.currentId &&
      device.user_id === financeSnapshot.profile?.id,
  )
  const { profile, workspaces, ledgers } = financeSnapshot
  const activeWorkspace =
    workspaces.find(({ id }) => id === profile?.active_workspace_id) ??
    workspaces[0]
  return {
    ...financeSnapshot,
    ...deviceSnapshot,
    ...tagSnapshot,
    activeWorkspace,
    automaticLedgerIds: ledgers
      .filter(({ canEdit }) => canEdit)
      .map(({ id }) => id),
    ledgers: ledgers.filter(
      ({ workspace_id }) => workspace_id === activeWorkspace?.id,
    ),
    registered,
  }
}

let startup: Promise<boolean> | undefined

async function checkAutomaticTransactions(cutoff: Date) {
  const { registered, profile, automaticLedgerIds } = await load()
  if (!registered || !profile) return false
  try {
    await bookkeeping.runDueAutomaticRules(
      automaticLedgerIds,
      profile.id,
      cutoff,
    )
    return false
  } catch {
    return true
  }
}

interface FinanceContext {
  finance: typeof finance
  bookkeeping: typeof bookkeeping
  devices: typeof devices
  tagService: typeof tagService
  snapshot: Awaited<ReturnType<typeof load>>
  saving: boolean
  save: (operation: () => Promise<unknown>) => Promise<void>
}

export function useFinance() {
  return useOutletContext<FinanceContext>()
}

export function Entry() {
  const { snapshot } = useFinance()
  return <Navigate to={snapshot.registered ? '/manage' : '/setup'} replace />
}

const managementLinks = [
  {
    to: 'transactions',
    label: '交易',
    icon: 'M4 8h16m-4-4 4 4-4 4m4 4H4m4-4-4 4 4 4',
  },
  {
    to: 'basics',
    label: '基础',
    icon: 'M6 3h13v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 15a2 2 0 0 1 2-2h13M8 7h7m-7 4h7',
  },
  {
    to: 'settings',
    label: '设置',
    icon: 'M4 6h3m4 0h9M4 12h9m4 0h3M4 18h3m4 0h9M7 4v4m6 2v4m-6 2v4',
  },
]

export function ManagementLayout() {
  const context = useFinance()
  if (!context.snapshot.registered) return <Navigate to='/setup' replace />

  return (
    <div className='app-layout'>
      <aside className='sidebar'>
        <nav className='management-menu' aria-label='管理菜单'>
          {managementLinks.map(({ to, label, icon }) => (
            <NavLink key={to} to={to}>
              <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.6'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
              >
                <path d={icon} />
              </svg>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className='page-content'>
        <Outlet key={context.snapshot.activeWorkspace?.id} context={context} />
      </div>
    </div>
  )
}

export function App() {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof load>>>()
  const [databaseUnavailable, setDatabaseUnavailable] = useState(false)
  const [automaticCheckFailed, setAutomaticCheckFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    startup ??= checkAutomaticTransactions(new Date())
    void startup.then(
      (failed) => {
        if (!active) return
        setAutomaticCheckFailed(failed)
        const subscription = FinanceDatabase.liveQuery(load).subscribe({
          next: setSnapshot,
          error: () => setDatabaseUnavailable(true),
        })
        unsubscribe = () => subscription.unsubscribe()
        void devices.seen().catch(() => {
          if (active) setDatabaseUnavailable(true)
        })
      },
      () => {
        if (active) setDatabaseUnavailable(true)
      },
    )
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  async function save(operation: () => Promise<unknown>) {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await operation()
      try {
        setSnapshot(await load())
      } catch {
        setDatabaseUnavailable(true)
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <main>
      <header className='masthead'>
        <h1>Ks Finance</h1>
      </header>
      {automaticCheckFailed && (
        <p className='error' role='alert'>
          部分自动交易计划无法检查，下次打开应用时会重试。
        </p>
      )}
      {databaseUnavailable ? (
        <p className='error' role='alert'>
          无法读取本地账务数据库。请检查浏览器的存储设置，然后重新加载。
        </p>
      ) : snapshot ? (
        <Outlet
          context={
            {
              finance,
              bookkeeping,
              devices,
              tagService,
              snapshot,
              saving,
              save,
            } satisfies FinanceContext
          }
        />
      ) : (
        <p role='status'>正在读取本地数据…</p>
      )}
    </main>
  )
}
