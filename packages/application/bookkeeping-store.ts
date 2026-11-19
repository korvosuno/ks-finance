import type { TagAssignments } from './tags'
import type {
  Account,
  AccountGroup,
  AccountGroupMember,
} from '@ks-finance/domain/account'
import type { Ledger, LedgerMember } from '@ks-finance/domain/ledger'
import type {
  AutomaticTransactionOccurrence,
  AutomaticTransactionRule,
  FinancialTransaction,
  LocalTransactionChange,
  Posting,
} from '@ks-finance/domain/transaction'

export interface BookRecords {
  accounts: Account[]
  groups: AccountGroup[]
  groupMembers: AccountGroupMember[]
  transactions: FinancialTransaction[]
  postings: Posting[]
}

export interface BookRepository extends TagAssignments {
  access(
    ledgerId: string,
  ): Promise<{ ledger: Ledger; member: LedgerMember } | undefined>
  records(ledgerId: string): Promise<BookRecords>
  automaticRules(ledgerId: string): Promise<AutomaticTransactionRule[]>
  automaticRule(id: string): Promise<AutomaticTransactionRule | undefined>
  putAutomaticRule(rule: AutomaticTransactionRule): Promise<void>
  addAutomaticOccurrence(
    occurrence: AutomaticTransactionOccurrence,
  ): Promise<void>
  accountList(ledgerId: string): Promise<Account[]>
  group(ledgerId: string, id: string): Promise<AccountGroup | undefined>
  transaction(
    ledgerId: string,
    id: string,
  ): Promise<FinancialTransaction | undefined>
  entries(ledgerId: string, transactionId: string): Promise<Posting[]>
  hasOtherAccountTransactions(
    ledgerId: string,
    accountId: string,
    transactionId: string,
  ): Promise<boolean>
  hasReversal(ledgerId: string, transactionId: string): Promise<boolean>
  putAccount(account: Account): Promise<void>
  hasAccountPostings(accountId: string): Promise<boolean>
  deleteAccount(accountId: string): Promise<void>
  putGroup(group: AccountGroup, accountIds: string[]): Promise<void>
  deleteGroup(groupId: string): Promise<void>
  currentDeviceId(userId: string): Promise<string | undefined>
  putTransaction(change: LocalTransactionChange): Promise<void>
}

export interface BookStore {
  read<T>(run: (repository: BookRepository) => Promise<T>): Promise<T>
  write<T>(run: (repository: BookRepository) => Promise<T>): Promise<T>
}
