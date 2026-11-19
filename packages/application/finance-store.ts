import type { TagAssignments } from './tags'
import type { UserProfile } from '@ks-finance/domain/user-profile'
import type { Ledger, LedgerMember } from '@ks-finance/domain/ledger'
import type { Workspace, WorkspaceMember } from '@ks-finance/domain/workspace'

export interface FinanceRepository extends TagAssignments {
  getProfile(): Promise<UserProfile | undefined>
  saveProfile(profile: UserProfile): Promise<void>
  getWorkspaces(
    userId: string,
  ): Promise<{ workspace: Workspace; membership: WorkspaceMember }[]>
  getWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember | undefined>
  putWorkspace(workspace: Workspace): Promise<void>
  putLedger(ledger: Ledger): Promise<void>
  getLedgerForEdit(
    ledgerId: string,
    userId: string,
  ): Promise<Ledger | undefined>
  addWorkspace(workspace: Workspace, member: WorkspaceMember): Promise<void>
  getLedgers(userId: string): Promise<(Ledger & { canEdit: boolean })[]>
  addLedger(ledger: Ledger, member: LedgerMember): Promise<void>
  hasWorkspaceLedgers(workspaceId: string): Promise<boolean>
  hasLedgerRecords(ledgerId: string): Promise<boolean>
  deleteWorkspace(workspaceId: string): Promise<void>
  deleteLedger(ledgerId: string): Promise<void>
}

export interface FinanceStore {
  read<T>(run: (repository: FinanceRepository) => Promise<T>): Promise<T>
  write<T>(run: (repository: FinanceRepository) => Promise<T>): Promise<T>
}
