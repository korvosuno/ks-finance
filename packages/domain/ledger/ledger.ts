export interface Ledger {
  id: string
  workspace_id: string
  name: string
  type: 'personal' | 'shared'
  owner_user_id: string
  base_currency: string
  timezone: string
  created_at: string
  status: 'active' | 'archived'
}

export interface LedgerMember {
  ledger_id: string
  user_id: string
  role: 'Owner' | 'Admin' | 'Member' | 'Viewer'
  permissions: Record<string, unknown>
  key_version?: number
  joined_at: string
  revoked_at?: string
}
