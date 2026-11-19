import { tagNameKey } from '@ks-finance/domain/tag'
import type { TagAssignments } from '@ks-finance/application/tags'
import type { FinanceDatabase } from '../database'

export function createTagAssignments(
  database: FinanceDatabase,
): TagAssignments {
  const { tags, tag_links } = database
  return {
    async assignTags(userId, kind, targetId, tagIds, newNames = []) {
      const ids = [...new Set(tagIds)]
      const selected = ids.length ? await tags.bulkGet(ids) : []
      if (
        selected.some((tag) => tag?.kind !== kind || tag.user_id !== userId)
      ) {
        throw new Error('标签已删除，或不属于当前用户和分类。')
      }
      const selectedIds = new Set(ids)
      for (const name of newNames) {
        const name_key = tagNameKey(name)
        const existing = await tags
          .where('[user_id+kind+name_key]')
          .equals([userId, kind, name_key])
          .first()
        const id = existing?.id ?? crypto.randomUUID()
        if (!existing)
          await tags.add({ id, user_id: userId, kind, name, name_key })
        selectedIds.add(id)
      }
      const current = await tag_links
        .where('[kind+target_id]')
        .equals([kind, targetId])
        .toArray()
      const existingIds = new Set(current.map(({ tag_id }) => tag_id))
      const removedIds = current
        .map(({ tag_id }) => tag_id)
        .filter((id) => !selectedIds.has(id))
      if (removedIds.length) {
        const removedTags = await tags.bulkGet(removedIds)
        const keys = removedTags.flatMap((tag) =>
          tag?.user_id === userId
            ? [[tag.id, kind, targetId] as [string, string, string]]
            : [],
        )
        if (keys.length) await tag_links.bulkDelete(keys)
      }
      const added = [...selectedIds].filter((id) => !existingIds.has(id))
      if (added.length)
        await tag_links.bulkAdd(
          added.map((tag_id) => ({ tag_id, kind, target_id: targetId })),
        )
    },
  }
}

export function createTagService(database: FinanceDatabase) {
  const { tags, tag_links, user_profiles } = database
  const tables = [tags, tag_links, user_profiles]
  const profile = () =>
    user_profiles.filter(({ status }) => status === 'active').first()

  return {
    load: () =>
      database.transaction('r', tables, async () => {
        const user = await profile()
        if (!user) return { tags: [], links: [] }
        const items = await tags.where('user_id').equals(user.id).toArray()
        const links = items.length
          ? await tag_links
              .where('tag_id')
              .anyOf(items.map(({ id }) => id))
              .toArray()
          : []
        return {
          tags: items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
          links,
        }
      }),

    delete: (id: string) =>
      database.transaction('rw', tables, async () => {
        const user = await profile()
        const tag = await tags.get(id)
        if (!user || tag?.user_id !== user.id) throw new Error('找不到标签。')
        await tag_links.where('tag_id').equals(id).delete()
        await tags.delete(id)
      }),
  }
}
