import { createTagAssignments } from './tags'
import type {
  BookRepository,
  BookStore,
} from '@ks-finance/application/bookkeeping-store'
import type { FinanceDatabase } from '../database'

export function createDexieBookStore(database: FinanceDatabase): BookStore {
  const {
    user_profiles,
    ledgers,
    workspace_members,
    ledger_members,
    accounts,
    account_groups,
    account_group_members,
    tag_links,
    financial_transactions,
    postings,
    local_changes,
    device_keys,
    automatic_transaction_rules,
    automatic_transaction_occurrences,
  } = database
  const accessTables = [
    user_profiles,
    ledgers,
    workspace_members,
    ledger_members,
  ]
  const recordTables = [
    accounts,
    account_groups,
    account_group_members,
    financial_transactions,
    postings,
    automatic_transaction_rules,
  ]
  const repository: BookRepository = {
    ...createTagAssignments(database),
    async access(ledgerId) {
      const [profile, ledger] = await Promise.all([
        user_profiles.filter((row) => row.status === 'active').first(),
        ledgers.get(ledgerId),
      ])
      if (!profile || !ledger) return
      const [workspace, member] = await Promise.all([
        workspace_members.get([ledger.workspace_id, profile.id]),
        ledger_members.get([ledgerId, profile.id]),
      ])
      if (workspace?.status === 'active' && member && !member.revoked_at)
        return { ledger, member }
    },
    async records(ledgerId) {
      const [ledgerAccounts, groups, transactions, ledgerPostings] =
        await Promise.all([
          repository.accountList(ledgerId),
          account_groups.where('ledger_id').equals(ledgerId).toArray(),
          financial_transactions.where('ledger_id').equals(ledgerId).toArray(),
          postings.where('ledger_id').equals(ledgerId).toArray(),
        ])
      const groupMembers = await account_group_members
        .where('group_id')
        .anyOf(groups.map(({ id }) => id))
        .toArray()
      return {
        accounts: ledgerAccounts,
        groups,
        groupMembers,
        transactions,
        postings: ledgerPostings,
      }
    },
    automaticRules: (ledgerId) =>
      automatic_transaction_rules.where('ledger_id').equals(ledgerId).toArray(),
    automaticRule: (id) => automatic_transaction_rules.get(id),
    async putAutomaticRule(rule) {
      await automatic_transaction_rules.put(rule)
    },
    async addAutomaticOccurrence(occurrence) {
      await automatic_transaction_occurrences.add(occurrence)
    },
    accountList: (ledgerId) =>
      accounts.where('ledger_id').equals(ledgerId).toArray(),
    async group(ledgerId, id) {
      const group = await account_groups.get(id)
      return group?.ledger_id === ledgerId ? group : undefined
    },
    async transaction(ledgerId, id) {
      const transaction = await financial_transactions.get(id)
      return transaction?.ledger_id === ledgerId ? transaction : undefined
    },
    entries: (ledgerId, transactionId) =>
      postings
        .where('transaction_id')
        .equals(transactionId)
        .filter((posting) => posting.ledger_id === ledgerId)
        .toArray(),
    async hasOtherAccountTransactions(ledgerId, accountId, transactionId) {
      const entries = await postings
        .where('account_id')
        .equals(accountId)
        .filter(
          (posting) =>
            posting.ledger_id === ledgerId &&
            posting.transaction_id !== transactionId,
        )
        .toArray()
      const ids = [...new Set(entries.map((posting) => posting.transaction_id))]
      if (ids.length === 0) return false
      const records = await financial_transactions.bulkGet(ids)
      return records.some(
        (transaction) =>
          transaction?.ledger_id === ledgerId &&
          transaction.status !== 'voided',
      )
    },
    async hasReversal(ledgerId, transactionId) {
      return !!(await financial_transactions
        .where('reverse_of_id')
        .equals(transactionId)
        .filter((transaction) => transaction.ledger_id === ledgerId)
        .first())
    },
    async putAccount(account) {
      await accounts.put(account)
    },
    async hasAccountPostings(id) {
      return !!(await postings.where('account_id').equals(id).first())
    },
    async deleteAccount(id) {
      await account_group_members.where('account_id').equals(id).delete()
      await tag_links.where('[kind+target_id]').equals(['account', id]).delete()
      await accounts.delete(id)
    },
    async putGroup(group, accountIds) {
      await account_groups.put(group)
      await account_group_members.where('group_id').equals(group.id).delete()
      await account_group_members.bulkAdd(
        accountIds.map((account_id) => ({ group_id: group.id, account_id })),
      )
    },
    async deleteGroup(id) {
      await account_group_members.where('group_id').equals(id).delete()
      await account_groups.delete(id)
    },
    async currentDeviceId(userId) {
      return (await device_keys.get(userId))?.device_id
    },
    async putTransaction(change) {
      await financial_transactions.put(change.transaction)
      await postings
        .where('transaction_id')
        .equals(change.transaction.id)
        .delete()
      await postings.bulkAdd(change.postings)
      await local_changes.add(change)
    },
  }
  return {
    read: (run) =>
      database.transaction('r', [...accessTables, ...recordTables], () =>
        run(repository),
      ),
    write: (run) =>
      database.transaction(
        'rw',
        [
          ...accessTables,
          ...recordTables,
          local_changes,
          automatic_transaction_occurrences,
          device_keys,
          database.tags,
          tag_links,
        ],
        // Dexie tracks native async continuations through the scope callback.
        async () => await run(repository),
      ),
  }
}
