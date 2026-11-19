export interface Workspace {
  id: string
  name: string
  type: 'personal' | 'household'
  owner_user_id: string
  created_at: string
  timezone: string
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: 'Owner' | 'Admin' | 'Member'
  joined_at: string
  status: 'invited' | 'active' | 'revoked'
}
