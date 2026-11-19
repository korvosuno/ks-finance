export const accountClasses = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE',
] as const
export type AccountClass = (typeof accountClasses)[number]
export type Side = 'DEBIT' | 'CREDIT'

export interface Account {
  id: string
  ledger_id: string
  code: string
  name: string
  account_class: AccountClass
  subtype: string
  parent_id?: string
  currency: string
  normal_balance: Side
  is_system: boolean
  is_archived: boolean
}

export interface AccountGroup {
  id: string
  ledger_id: string
  name: string
  description: string
  created_at: string
}

export interface AccountGroupMember {
  group_id: string
  account_id: string
}
