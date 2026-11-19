import { useState } from 'react'
import { tagKinds, tagNameKey } from '@ks-finance/domain/tag'
import { useFinance } from '../app/App'
import { FormDialog } from '../components/FormDialog'
import { HoldConfirmButton } from '../components/HoldConfirmButton'
import { tagKindNames } from '../components/TagFields'

export function TagsSection() {
  const {
    tagService,
    snapshot: { tags },
    saving,
    save,
  } = useFinance()
  const [kind, setKind] = useState<(typeof tagKinds)[number]>('ledger')

  const [query, setQuery] = useState('')
  const [deleteId, setDeleteId] = useState<string>()
  const deleting = tags.find(({ id }) => id === deleteId)
  const matches = tags.filter(
    (tag) => tag.kind === kind && tag.name_key.includes(tagNameKey(query)),
  )

  return (
    <section aria-labelledby='tags-heading'>
      <h3 id='tags-heading'>标签</h3>
      <div className='tag-toolbar'>
        <label className='tag-category'>
          标签分类
          <select
            value={kind}
            onChange={(event) => {
              const selected = tagKinds.find(
                (item) => item === event.target.value,
              )
              if (selected) setKind(selected)
            }}
          >
            {tagKinds.map((item) => (
              <option key={item} value={item}>
                {tagKindNames[item]}
              </option>
            ))}
          </select>
        </label>
        <label className='tag-search'>
          搜索标签
          <input
            type='search'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {matches.length > 0 ? (
        <ul className='record-tags tag-management-list' aria-label='标签'>
          {matches.map((tag) => (
            <li key={tag.id} className='record-tag'>
              <span>{tag.name}</span>
              <button
                type='button'
                aria-label={`删除标签 ${tag.name}`}
                disabled={saving}
                onClick={() => setDeleteId(tag.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>没有匹配的标签。</p>
      )}
      {deleting && (
        <FormDialog
          title='删除标签'
          warning
          busy={saving}
          onClose={() => setDeleteId(undefined)}
        >
          <p>删除标签「{deleting.name}」？关联的记录将保留。</p>
          <div className='warning-actions'>
            <button
              type='button'
              disabled={saving}
              onClick={() => setDeleteId(undefined)}
            >
              取消
            </button>
            <HoldConfirmButton
              action='删除标签'
              disabled={saving}
              initiallyArmed
              onConfirm={async () => {
                await save(() => tagService.delete(deleting.id))
                setDeleteId(undefined)
              }}
            />
          </div>
        </FormDialog>
      )}
    </section>
  )
}
