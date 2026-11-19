import type { Tag, TagLink } from '@ks-finance/domain/tag'
import Dexie from 'dexie'
import type { Table } from 'dexie'
import type {
  Account,
  AccountGroup,
  AccountGroupMember,
} from '@ks-finance/domain/account'
import type { Device, DeviceKeys } from '@ks-finance/domain/device'
import type {
  AutomaticTransactionOccurrence,
  AutomaticTransactionRule,
  FinancialTransaction,
  LocalTransactionChange,
  Posting,
} from '@ks-finance/domain/transaction'
import type { UserProfile } from '@ks-finance/domain/user-profile'
import type { Ledger, LedgerMember } from '@ks-finance/domain/ledger'
import type { Workspace, WorkspaceMember } from '@ks-finance/domain/workspace'

export class FinanceDatabase extends Dexie {
  declare user_profiles: Table<UserProfile, string>
  declare workspaces: Table<Workspace, string>
  declare workspace_members: Table<WorkspaceMember, [string, string]>
  declare ledgers: Table<Ledger, string>
  declare ledger_members: Table<LedgerMember, [string, string]>

  declare devices: Table<Device, string>
  declare device_keys: Table<DeviceKeys, string>
  declare accounts: Table<Account, string>
  declare account_groups: Table<AccountGroup, string>
  declare account_group_members: Table<AccountGroupMember, [string, string]>
  declare financial_transactions: Table<FinancialTransaction, string>
  declare postings: Table<Posting, string>
  declare local_changes: Table<LocalTransactionChange, string>

  declare automatic_transaction_rules: Table<AutomaticTransactionRule, string>
  declare automatic_transaction_occurrences: Table<
    AutomaticTransactionOccurrence,
    [string, string]
  >

  declare tags: Table<Tag, string>
  declare tag_links: Table<TagLink, [string, string, string]>

  constructor(name = 'ks-finance') {
    super(name)
    this.version(1).stores({
      user_profiles: 'id',
      devices: 'id, user_id',
      workspaces: 'id, owner_user_id',
      workspace_members: '[workspace_id+user_id], user_id',
      ledgers: 'id, workspace_id',
      ledger_members: '[ledger_id+user_id], user_id',
      accounts: 'id, ledger_id, [ledger_id+code]',
      account_groups: 'id, ledger_id',
      account_group_members: '[group_id+account_id], account_id',
      financial_transactions: 'id, [ledger_id+accounting_date], reverse_of_id',
      postings: 'id, ledger_id, transaction_id, account_id',
      currencies: 'code',
      sync_operations: 'operationId, &[ledgerId+deviceId+sequence]',
    })
    this.version(2).stores({
      device_keys: 'user_id',
      account_group_members: '[group_id+account_id], group_id, account_id',
      financial_transactions:
        'id, ledger_id, [ledger_id+accounting_date], reverse_of_id',
      local_changes: 'id, ledger_id, created_at',
    })
    this.version(3).stores({
      tags: 'id, user_id, &[user_id+kind+name_key]',
      tag_links: '[tag_id+kind+target_id], tag_id, [kind+target_id]',
    })
    this.version(4)
      .stores({})
      .upgrade(async (transaction) => {
        const tags = transaction.table<{ id: string; kind: string }>('tags')
        const links = transaction.table<{ tag_id: string; kind: string }>(
          'tag_links',
        )
        const obsolete = tags.filter(({ kind }) => kind === 'workspace')
        const ids = new Set((await obsolete.toArray()).map(({ id }) => id))
        await links
          .filter(({ kind, tag_id }) => kind === 'workspace' || ids.has(tag_id))
          .delete()
        await obsolete.delete()
      })
    this.version(5).stores({
      automatic_transaction_rules: 'id, ledger_id',
      automatic_transaction_occurrences: '[rule_id+scheduled_date], ledger_id',
    })
  }
}
