import { RecordField } from './RecordField'
import { useId, useRef, useState } from 'react'
import { tagNameKey } from '@ks-finance/domain/tag'
import type { TagKind } from '@ks-finance/domain/tag'
import { useFinance } from '../app/App'

export const tagKindNames = {
  ledger: '账本',
  account: '账户',
  transaction: '交易',
} satisfies Record<TagKind, string>

type Choice = { id: string; name: string } | { name: string; id?: undefined }

export function TagFields({
  kind,
  targetId,
}: {
  kind: TagKind
  targetId?: string
}) {
  const {
    snapshot: { tags, links },
  } = useFinance()
  const initial = tags.filter(
    (tag) =>
      tag.kind === kind &&
      links.some(
        (link) =>
          link.kind === kind &&
          link.target_id === targetId &&
          link.tag_id === tag.id,
      ),
  )
  const [selection, setSelection] = useState<Choice[]>()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const selected = selection ?? initial
  const key = tagNameKey(query)
  const available = tags.filter((tag) => tag.kind === kind)
  const selectedKeys = new Set(selected.map(({ name }) => tagNameKey(name)))
  const exact = available.some(({ name_key }) => name_key === key)
  const custom =
    query.trim() && !exact && !selectedKeys.has(key)
      ? { name: query.trim() }
      : undefined
  const options: Choice[] = [
    ...(custom ? [custom] : []),
    ...available.filter(
      (tag) => tag.name_key.includes(key) && !selectedKeys.has(tag.name_key),
    ),
  ]
  const expanded = open && options.length > 0
  const activeIndex = Math.min(active, options.length - 1)

  function choose(option: Choice) {
    setSelection([...selected, option])
    setQuery('')
    setActive(0)
    setOpen(true)
  }

  return (
    <div
      className='tag-picker'
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      {selected.length > 0 && (
        <ul className='tag-chips' aria-label='已选标签'>
          {selected.map((tag) => (
            <li key={tag.id ?? tagNameKey(tag.name)}>
              <input
                type='hidden'
                name={tag.id ? 'tagId' : 'newTagName'}
                value={tag.id ?? tag.name}
              />
              <button
                type='button'
                aria-label={`移除标签 ${tag.name}`}
                onClick={() =>
                  setSelection(selected.filter((item) => item !== tag))
                }
              >
                {tag.name} ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className='form-card'>
        标签
        <input
          ref={input}
          role='combobox'
          aria-autocomplete='list'
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={
            expanded ? `${listId}-${activeIndex}` : undefined
          }
          value={query}
          maxLength={60}
          autoComplete='off'
          placeholder='搜索或输入新标签'
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
            if (event.key === 'Escape' && expanded) {
              event.preventDefault()
              setOpen(false)
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              if (options[activeIndex]) choose(options[activeIndex])
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
              if (!options.length) return
              const direction = event.key === 'ArrowDown' ? 1 : -1
              setActive(
                open
                  ? (activeIndex + direction + options.length) % options.length
                  : 0,
              )
            }
          }}
        />
      </label>
      {expanded && (
        <ul
          className='tag-options'
          id={listId}
          role='listbox'
          aria-label='可选标签'
        >
          {options.map((option, index) => (
            <li
              key={option.id ?? tagNameKey(option.name)}
              id={`${listId}-${index}`}
              role='option'
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                choose(option)
                input.current?.focus()
              }}
            >
              {option.id ? option.name : `自定义：${option.name}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TagNames({
  kind,
  targetId,
}: {
  kind: TagKind
  targetId: string
}) {
  const {
    snapshot: { tags, links },
  } = useFinance()
  const selected = new Set(
    links
      .filter((link) => link.kind === kind && link.target_id === targetId)
      .map(({ tag_id }) => tag_id),
  )
  const names = tags
    .filter((tag) => selected.has(tag.id))
    .map(({ name }) => name)
  return names.length ? (
    <RecordField label='标签'>
      <ul className='record-tags' aria-label='标签'>
        {names.map((name) => (
          <li key={name} className='record-tag'>
            {name}
          </li>
        ))}
      </ul>
    </RecordField>
  ) : null
}
