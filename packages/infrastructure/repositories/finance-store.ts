import { createTagAssignments } from './tags'
import type {
  FinanceRepository,
  FinanceStore,
} from '@ks-finance/application/finance-store'
import type { FinanceDatabase } from '../database'

export function createDexieFinanceStore(
  database: FinanceDatabase,
): FinanceStore {
  const {
    user_profiles,
    workspaces,
    workspace_members,
    ledgers,
    ledger_members,
    tag_links,
  } = database
  const tables = [
    user_profiles,
    workspaces,
    workspace_members,
    ledgers,
    ledger_members,
    database.tags,
    tag_links,
  ]
  const ledgerRecordTables = [
    database.accounts,
    database.account_groups,
    database.financial_transactions,
    database.postings,
    database.local_changes,
    database.automatic_transaction_rules,
  ]
  const repository: FinanceRepository = {
    ...createTagAssignments(database),
    getProfile: () =>
      user_profiles.filter((profile) => profile.status === 'active').first(),
    async saveProfile(profile) {
      await user_profiles.put(profile)
    },
    async getWorkspaces(userId) {
      const memberships = await workspace_members
        .where('user_id')
        .equals(userId)
        .toArray()
      const activeMemberships = memberships.filter(
        (member) => member.status === 'active',
      )
      const records = await workspaces.bulkGet(
        activeMemberships.map((member) => member.workspace_id),
      )
      return activeMemberships.flatMap((membership, index) => {
        const workspace = records[index]
        return workspace ? [{ workspace, membership }] : []
      })
    },
    async getWorkspaceMembership(workspaceId, userId) {
      const [workspace, membership] = await Promise.all([
        workspaces.get(workspaceId),
        workspace_members.get([workspaceId, userId]),
      ])
      return workspace ? membership : undefined
    },
    async putWorkspace(workspace) {
      await workspaces.put(workspace)
    },
    async putLedger(ledger) {
      await ledgers.put(ledger)
    },
    async getLedgerForEdit(ledgerId, userId) {
      const [ledger, member] = await Promise.all([
        ledgers.get(ledgerId),
        ledger_members.get([ledgerId, userId]),
      ])
      return ledger?.status === 'active' &&
        member &&
        !member.revoked_at &&
        (member.role === 'Owner' || member.role === 'Admin')
        ? ledger
        : undefined
    },
    async addWorkspace(workspace, member) {
      await workspaces.add(workspace)
      await workspace_members.add(member)
    },
    async getLedgers(userId) {
      const memberships = await ledger_members
        .where('user_id')
        .equals(userId)
        .toArray()
      const ids = memberships
        .filter((member) => !member.revoked_at)
        .map((member) => member.ledger_id)
      const records = await ledgers.bulkGet(ids)
      return records.flatMap((ledger, index) => {
        if (!ledger) return []
        const member = memberships.find(
          ({ ledger_id }) => ledger_id === ids[index],
        )
        return [
          {
            ...ledger,
            canEdit:
              ledger.status === 'active' &&
              (member?.role === 'Owner' || member?.role === 'Admin'),
          },
        ]
      })
    },
    async addLedger(ledger, member) {
      await ledgers.add(ledger)
      await ledger_members.add(member)
    },
    async hasWorkspaceLedgers(workspaceId) {
      return !!(await ledgers.where('workspace_id').equals(workspaceId).first())
    },
    async hasLedgerRecords(ledgerId) {
      const records = await Promise.all(
        ledgerRecordTables.map((table) =>
          table.where('ledger_id').equals(ledgerId).first(),
        ),
      )
      return records.some(Boolean)
    },
    async deleteWorkspace(id) {
      await workspace_members.where('workspace_id').equals(id).delete()
      await workspaces.delete(id)
    },
    async deleteLedger(id) {
      await ledger_members.where('ledger_id').equals(id).delete()
      await tag_links.where('[kind+target_id]').equals(['ledger', id]).delete()
      await ledgers.delete(id)
    },
  }
  return {
    read: (run) => database.transaction('r', tables, () => run(repository)),
    write: (run) =>
      database.transaction('rw', [...tables, ...ledgerRecordTables], () =>
        run(repository),
      ),
  }
}
