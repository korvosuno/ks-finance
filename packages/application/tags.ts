import type { TagKind } from '@ks-finance/domain/tag'
import { z } from 'zod'

export const tagIdsInput = z.array(z.string().min(1)).optional()
export const tagNameInput = z
  .string()
  .trim()
  .min(1, '请输入标签名称。')
  .max(60, '标签名称最多 60 字。')

export const tagNamesInput = z.array(tagNameInput).optional()

export interface TagAssignments {
  assignTags(
    userId: string,
    kind: TagKind,
    targetId: string,
    tagIds: string[],
    newNames?: string[],
  ): Promise<void>
}
