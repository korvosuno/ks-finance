export interface UserProfile {
  id: string
  active_workspace_id?: string
  display_name: string
  public_encryption_key?: string
  public_signing_key?: string
  created_at: string
  status: 'active' | 'revoked'
}
