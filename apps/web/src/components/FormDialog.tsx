import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { FinanceForm, FormDialogClose } from './FinanceForm'

export function FormDialog({
  title,
  busy,
  warning = false,
  onClose,
  children,
}: {
  title: string
  busy: boolean
  warning?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useLayoutEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement
    element?.showModal()
    element
      ?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([type="checkbox"]), select, textarea',
      )
      ?.focus()
    return () => {
      element?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      className={warning ? 'form-dialog warning-dialog' : 'form-dialog'}
      role={warning ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <header className='dialog-heading'>
        <h2 id={titleId}>{title}</h2>
      </header>
      <FormDialogClose.Provider value={onClose}>
        {children}
      </FormDialogClose.Provider>
    </dialog>
  )
}

export function DialogForm({
  title,
  disabled,
  label,
  onSave,
  children,
  sections,
}: {
  title: string
  disabled: boolean
  label: string
  onSave: (fields: FormData) => Promise<void>
  children?: ReactNode
  sections?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type='button' disabled={disabled} onClick={() => setOpen(true)}>
        {title}
      </button>
      {open && (
        <FormDialog
          title={title}
          busy={disabled}
          onClose={() => setOpen(false)}
        >
          <FinanceForm
            label={label}
            disabled={disabled}
            sections={sections}
            onSave={async (fields) => {
              await onSave(fields)
              setOpen(false)
            }}
          >
            {children}
          </FinanceForm>
        </FormDialog>
      )}
    </>
  )
}
