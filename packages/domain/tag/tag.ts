export const tagKinds = ['ledger', 'account', 'transaction'] as const
export type TagKind = (typeof tagKinds)[number]

export interface Tag {
  id: string
  user_id: string
  kind: TagKind
  name: string
  name_key: string
}

export interface TagLink {
  tag_id: string
  kind: TagKind
  target_id: string
}

export function tagNameKey(name: string) {
  return name.trim().normalize('NFKC').toLowerCase()
}
