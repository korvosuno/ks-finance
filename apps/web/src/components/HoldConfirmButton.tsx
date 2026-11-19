import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

const holdDuration = 5000

export function HoldConfirmButton({
  action,
  disabled,
  initiallyArmed = false,
  onConfirm,
}: {
  action: string
  disabled: boolean
  initiallyArmed?: boolean
  onConfirm: () => Promise<void>
}) {
  const [armed, setArmed] = useState(initiallyArmed)
  const [holding, setHolding] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const timer = useRef<number | undefined>(undefined)
  const activePress = useRef<number | string | undefined>(undefined)

  if (disabled && holding) setHolding(false)

  function clearPress() {
    clearTimeout(timer.current)
    activePress.current = undefined
  }

  function stopHold() {
    clearPress()
    setHolding(false)
  }

  useEffect(() => {
    window.addEventListener('blur', stopHold)
    return () => {
      window.removeEventListener('blur', stopHold)
      clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    if (disabled) clearPress()
  }, [disabled])

  function startHold(press: number | string) {
    if (!armed || disabled || pending || activePress.current !== undefined)
      return
    activePress.current = press
    setError(undefined)
    setHolding(true)
    timer.current = window.setTimeout(async () => {
      stopHold()
      setPending(true)
      try {
        await onConfirm()
        setArmed(initiallyArmed)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '操作失败，请重试。')
      } finally {
        setPending(false)
      }
    }, holdDuration)
  }

  return (
    <div className='hold-confirm'>
      <button
        type='button'
        className='hold-confirm-button'
        data-armed={armed}
        data-holding={holding}
        style={{ '--hold-duration': `${holdDuration}ms` } as CSSProperties}
        disabled={disabled || pending}
        onClick={() => setArmed(true)}
        onPointerDown={(event) => {
          if (!armed || !event.isPrimary || event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          startHold(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (activePress.current !== event.pointerId) return
          const bounds = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            stopHold()
        }}
        onPointerUp={stopHold}
        onPointerCancel={stopHold}
        onLostPointerCapture={stopHold}
        onBlur={stopHold}
        onContextMenu={(event) => {
          if (armed) event.preventDefault()
        }}
        onKeyDown={(event) => {
          if (!armed || (event.key !== ' ' && event.key !== 'Enter')) return
          event.preventDefault()
          if (!event.repeat) startHold(event.key)
        }}
        onKeyUp={(event) => {
          if (activePress.current !== event.key) return
          event.preventDefault()
          stopHold()
        }}
      >
        <span>{armed ? `长按以确认${action}` : action}</span>
      </button>
      {error && (
        <p className='error' role='alert'>
          {error}
        </p>
      )}
    </div>
  )
}
