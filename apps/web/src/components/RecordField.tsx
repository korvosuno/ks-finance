import type { ReactNode } from 'react'

export function RecordField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className='record-field'>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
