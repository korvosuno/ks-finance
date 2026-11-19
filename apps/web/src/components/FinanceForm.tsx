import type { FormEvent, ReactNode } from 'react'
import { createContext, useContext, useId, useState } from 'react'
import { ZodError } from 'zod'

export const FormDialogClose = createContext<(() => void) | undefined>(
  undefined,
)

interface FinanceFormProps {
  children?: ReactNode
  sections?: ReactNode
  label: string
  secondaryLabel?: string
  disabled: boolean
  onSave: (fields: FormData) => Promise<void>
}

export function FinanceForm({
  children,
  sections,
  label,
  secondaryLabel,
  disabled,
  onSave,
}: FinanceFormProps) {
  const [error, setError] = useState<string>()
  const onClose = useContext(FormDialogClose)
  const formId = useId()
  const hasFields = children != null || sections != null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    setError(undefined)
    try {
      await onSave(
        new FormData(
          event.currentTarget,
          (event.nativeEvent as SubmitEvent).submitter,
        ),
      )
    } catch (cause) {
      if (cause instanceof ZodError) {
        setError(cause.issues[0]?.message ?? '请检查输入。')
      } else {
        setError(
          cause instanceof Error && cause.name === 'Error'
            ? cause.message
            : '保存失败，请重试。',
        )
      }
    }
  }

  return (
    <div className={hasFields || onClose ? 'finance-form' : undefined}>
      <form id={formId} onSubmit={submit}>
        {hasFields && (
          <fieldset className='form-content' disabled={disabled}>
            {children != null && (
              <div className='form-card form-fields'>{children}</div>
            )}
            {sections}
          </fieldset>
        )}
        {error && (
          <p className='error' role='alert'>
            {error}
          </p>
        )}
      </form>
      <div className='form-actions'>
        {onClose && (
          <button type='button' disabled={disabled} onClick={onClose}>
            关闭
          </button>
        )}
        <button
          type='submit'
          form={formId}
          disabled={disabled}
          className={secondaryLabel ? 'primary-action' : undefined}
        >
          {label}
        </button>
        {secondaryLabel && (
          <button
            type='submit'
            form={formId}
            name='intent'
            value='draft'
            disabled={disabled}
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  )
}
