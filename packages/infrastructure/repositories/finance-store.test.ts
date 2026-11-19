import 'fake-indexeddb/auto'
import { createFinanceService } from '@ks-finance/application/finance'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { FinanceDatabase } from '../database'
import { createDexieFinanceStore } from './finance-store'

const workspaceInput = {
  name: '家庭',
  type: 'household',
  timezone: 'Asia/Shanghai',
}
const ledgerInput = {
  name: '日常',
  type: 'shared',
  base_currency: 'cny',
  timezone: 'Asia/Shanghai',
}

let database: FinanceDatabase
let finance: ReturnType<typeof createFinanceService>

beforeEach(() => {
  database = new FinanceDatabase(crypto.randomUUID())
  finance = createFinanceService(createDexieFinanceStore(database))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

test('concurrent profile saves keep one identity and member writes are atomic', async () => {
  await Promise.all([finance.saveProfile('小林'), finance.saveProfile('小陈')])
  const [profile] = await database.user_profiles.toArray()
  expect(await database.user_profiles.count()).toBe(1)
  await finance.saveProfile('小周')
  expect((await finance.load()).profile).toMatchObject({
    id: profile.id,
    display_name: '小周',
  })

  const workspace = await finance.createWorkspace(workspaceInput)
  expect(
    await database.workspace_members.get([workspace.id, profile.id]),
  ).toMatchObject({
    role: 'Owner',
    status: 'active',
  })

  const ledgerId = 'd772ea63-53ec-4618-b215-318437859642'
  await database.ledger_members.add({
    ledger_id: ledgerId,
    user_id: profile.id,
    role: 'Owner',
    permissions: {},
    joined_at: workspace.created_at,
  })
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(ledgerId)

  await expect(
    finance.createLedger(workspace.id, ledgerInput),
  ).rejects.toMatchObject({
    name: 'ConstraintError',
  })
  expect(await database.ledgers.count()).toBe(0)
})

test('ledger visibility requires active workspace membership and independent ledger access', async () => {
  await finance.saveProfile('小林')
  const [profile] = await database.user_profiles.toArray()
  const workspace = await finance.createWorkspace(workspaceInput)
  const ledger = await finance.createLedger(workspace.id, ledgerInput)

  expect((await finance.load()).ledgers).toEqual([
    expect.objectContaining({ base_currency: 'CNY' }),
  ])
  await database.ledger_members.update([ledger.id, profile.id], {
    revoked_at: ledger.created_at,
  })
  expect((await finance.load()).ledgers).toEqual([])

  await database.workspace_members.update([workspace.id, profile.id], {
    role: 'Member',
  })
  await expect(finance.createLedger(workspace.id, ledgerInput)).rejects.toThrow(
    '没有在此工作空间',
  )
  expect((await finance.load()).workspaces).toHaveLength(1)

  await database.ledger_members.update([ledger.id, profile.id], {
    revoked_at: undefined,
  })
  await database.workspace_members.update([workspace.id, profile.id], {
    status: 'revoked',
  })
  expect(await finance.load()).toMatchObject({ workspaces: [], ledgers: [] })
})

test('deletes empty ledgers and workspaces with their memberships and tag links', async () => {
  await finance.saveProfile('小林')
  const workspace = await finance.createWorkspace(workspaceInput)
  const ledger = await finance.createLedger(workspace.id, {
    ...ledgerInput,
    newTagNames: ['日常'],
  })
  const otherWorkspace = await finance.createWorkspace(workspaceInput)
  const groupId = crypto.randomUUID()
  await database.account_groups.add({
    id: groupId,
    ledger_id: ledger.id,
    name: '常用',
    description: '',
    created_at: ledger.created_at,
  })

  await expect(finance.deleteWorkspace(workspace.id)).rejects.toThrow(
    '还有账本',
  )
  await expect(
    finance.deleteLedger(otherWorkspace.id, ledger.id),
  ).rejects.toThrow('没有删除此账本的权限')
  await expect(finance.deleteLedger(workspace.id, ledger.id)).rejects.toThrow(
    '还有账户、账户集合或交易记录',
  )
  expect(await database.tag_links.count()).toBe(1)

  await database.account_groups.delete(groupId)
  await finance.deleteLedger(workspace.id, ledger.id)
  await finance.deleteWorkspace(workspace.id)

  expect(await finance.load()).toMatchObject({
    profile: { active_workspace_id: otherWorkspace.id },
    workspaces: [expect.objectContaining({ id: otherWorkspace.id })],
    ledgers: [],
  })
  expect(await database.ledger_members.count()).toBe(0)
  expect(await database.workspace_members.count()).toBe(1)
  expect(await database.tag_links.count()).toBe(0)
  expect(await database.tags.count()).toBe(1)
})
