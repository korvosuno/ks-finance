import { tagIdsInput, tagNamesInput } from './tags'
import type { FinanceStore } from './finance-store'
import type { Ledger } from '@ks-finance/domain/ledger'
import type { Workspace, WorkspaceMember } from '@ks-finance/domain/workspace'
import { z } from 'zod'

const displayName = z
  .string()
  .trim()
  .min(1, '请输入显示名称。')
  .max(100, '显示名称最多 100 字。')
const name = z
  .string()
  .trim()
  .min(1, '请输入名称。')
  .max(100, '名称最多 100 字。')
const timezone = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: value,
      }).resolvedOptions().timeZone
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: '请输入有效的时区，例如 Asia/Shanghai。',
      })
      return z.NEVER
    }
  })
const workspaceInput = z.object({
  name,
  type: z.enum(['personal', 'household'], { error: '请选择工作空间类型。' }),
  timezone,
})
const currencyCodes = new Set(Intl.supportedValuesOf('currency'))
const ledgerInput = z.object({
  name,
  type: z.enum(['personal', 'shared'], { error: '请选择账本类型。' }),
  base_currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (code) => currencyCodes.has(code),
      '请输入有效的三字母货币代码，例如 CNY。',
    ),
  timezone,
  tagIds: tagIdsInput,
  newTagNames: tagNamesInput,
})

function canCreateLedger(membership: WorkspaceMember | undefined) {
  return (
    membership?.status === 'active' &&
    (membership.role === 'Owner' || membership.role === 'Admin')
  )
}

export function createFinanceService(store: FinanceStore) {
  return {
    load: () =>
      store.read(async (repository) => {
        const profile = await repository.getProfile()
        if (!profile) return { profile: undefined, workspaces: [], ledgers: [] }

        const [accessibleWorkspaces, ledgers] = await Promise.all([
          repository.getWorkspaces(profile.id),
          repository.getLedgers(profile.id),
        ])
        const workspaces = accessibleWorkspaces.map(
          ({ workspace, membership }) => ({
            ...workspace,
            canCreateLedger: canCreateLedger(membership),
          }),
        )
        const workspaceIds = new Set(workspaces.map(({ id }) => id))
        return {
          profile,
          workspaces,
          ledgers: ledgers.filter((ledger) =>
            workspaceIds.has(ledger.workspace_id),
          ),
        }
      }),

    saveProfile: (input: string) => {
      const display_name = displayName.parse(input)
      return store.write(async (repository) => {
        const profile = await repository.getProfile()
        await repository.saveProfile(
          profile
            ? { ...profile, display_name }
            : {
                id: crypto.randomUUID(),
                display_name,
                created_at: new Date().toISOString(),
                status: 'active',
              },
        )
      })
    },

    activateWorkspace: (id: string) =>
      store.write(async (repository) => {
        const profile = await repository.getProfile()
        if (!profile) throw new Error('请先登记用户。')
        const workspaces = await repository.getWorkspaces(profile.id)
        if (!workspaces.some(({ workspace }) => workspace.id === id))
          throw new Error('该工作空间不存在或你没有访问权限。')
        await repository.saveProfile({ ...profile, active_workspace_id: id })
      }),

    createWorkspace: (input: unknown) => {
      const fields = workspaceInput.parse(input)
      return store.write(async (repository) => {
        const profile = await repository.getProfile()
        if (!profile) throw new Error('请先创建用户资料。')

        const existing = await repository.getWorkspaces(profile.id)
        const workspace: Workspace = {
          ...fields,
          id: crypto.randomUUID(),
          owner_user_id: profile.id,
          created_at: new Date().toISOString(),
        }
        await repository.addWorkspace(workspace, {
          workspace_id: workspace.id,
          user_id: profile.id,
          role: 'Owner',
          joined_at: workspace.created_at,
          status: 'active',
        })
        if (
          !existing.some(
            ({ workspace }) => workspace.id === profile.active_workspace_id,
          )
        ) {
          await repository.saveProfile({
            ...profile,
            active_workspace_id: existing[0]?.workspace.id ?? workspace.id,
          })
        }
        return workspace
      })
    },

    createLedger: (workspaceId: string, input: unknown) => {
      const { tagIds, newTagNames, ...fields } = ledgerInput.parse(input)
      return store.write(async (repository) => {
        const profile = await repository.getProfile()
        if (!profile) throw new Error('请先创建用户资料。')

        const membership = await repository.getWorkspaceMembership(
          workspaceId,
          profile.id,
        )
        if (!canCreateLedger(membership)) {
          throw new Error('你没有在此工作空间创建账本的权限。')
        }

        const ledger: Ledger = {
          ...fields,
          id: crypto.randomUUID(),
          workspace_id: workspaceId,
          owner_user_id: profile.id,
          created_at: new Date().toISOString(),
          status: 'active',
        }
        await repository.addLedger(ledger, {
          ledger_id: ledger.id,
          user_id: profile.id,
          role: 'Owner',
          permissions: {},
          joined_at: ledger.created_at,
        })
        if (tagIds || newTagNames)
          await repository.assignTags(
            profile.id,
            'ledger',
            ledger.id,
            tagIds ?? [],
            newTagNames,
          )
        return ledger
      })
    },

    editWorkspace: (id: string, input: unknown) => {
      const fields = workspaceInput.parse(input)
      return store.write(async (repository) => {
        const profile = await repository.getProfile()
        if (!profile) throw new Error('请先登记用户。')
        const workspaces = await repository.getWorkspaces(profile.id)
        const existing = workspaces.find(({ workspace }) => workspace.id === id)
        if (!existing || !canCreateLedger(existing.membership)) {
          throw new Error('你没有编辑此工作空间的权限。')
        }
        await repository.putWorkspace({ ...existing.workspace, ...fields })
      })
    },

    editLedger: (workspaceId: string, id: string, input: unknown) => {
      const { tagIds, newTagNames, name, type, timezone, base_currency } =
        ledgerInput.parse(input)
      return store.write(async (repository) => {
        const profile = await repository.getProfile()
        if (!profile) throw new Error('请先登记用户。')
        const [ledger, membership] = await Promise.all([
          repository.getLedgerForEdit(id, profile.id),
          repository.getWorkspaceMembership(workspaceId, profile.id),
        ])
        if (
          !ledger ||
          ledger.workspace_id !== workspaceId ||
          membership?.status !== 'active'
        ) {
          throw new Error('你没有编辑此账本的权限。')
        }
        if (base_currency !== ledger.base_currency)
          throw new Error('已创建账本的基准币种不可修改。')
        await repository.putLedger({ ...ledger, name, type, timezone })
        if (tagIds || newTagNames)
          await repository.assignTags(
            profile.id,
            'ledger',
            id,
            tagIds ?? [],
            newTagNames,
          )
      })
    },

    deleteWorkspace: (id: string) =>
      store.write(async (repository) => {
        const profile = await repository.getProfile()
        if (!profile) throw new Error('请先登记用户。')
        const membership = await repository.getWorkspaceMembership(
          id,
          profile.id,
        )
        if (!canCreateLedger(membership))
          throw new Error('你没有删除此工作空间的权限。')
        if (await repository.hasWorkspaceLedgers(id))
          throw new Error('此工作空间还有账本，无法删除。')
        await repository.deleteWorkspace(id)
        if (profile.active_workspace_id === id) {
          const [next] = await repository.getWorkspaces(profile.id)
          await repository.saveProfile({
            ...profile,
            active_workspace_id: next?.workspace.id,
          })
        }
      }),

    deleteLedger: (workspaceId: string, id: string) =>
      store.write(async (repository) => {
        const profile = await repository.getProfile()
        if (!profile) throw new Error('请先登记用户。')
        const [ledger, membership] = await Promise.all([
          repository.getLedgerForEdit(id, profile.id),
          repository.getWorkspaceMembership(workspaceId, profile.id),
        ])
        if (
          !ledger ||
          ledger.workspace_id !== workspaceId ||
          membership?.status !== 'active'
        ) {
          throw new Error('你没有删除此账本的权限。')
        }
        if (await repository.hasLedgerRecords(id))
          throw new Error('此账本还有账户、账户集合或交易记录，无法删除。')
        await repository.deleteLedger(id)
      }),
  }
}
