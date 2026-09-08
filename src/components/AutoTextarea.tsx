import { useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
  autoFocus?: boolean
  onEnter?: () => void // Enter = Absenden, Shift+Enter = Zeilenumbruch
  minRows?: number
  maxRows?: number
  style?: CSSProperties
}

/** Mehrzeiliges Feld, das mit dem Inhalt mitwächst (CSS field-sizing + JS-Absicherung für ältere Browser) */
export function AutoTextarea({ value, onChange, placeholder, className = 'input', ariaLabel, autoFocus, onEnter, minRows = 1, maxRows = 12, style }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const line = parseFloat(getComputedStyle(el).lineHeight || '22') || 22
    const pad = 24
    const max = line * maxRows + pad
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }

  useEffect(resize, [value])
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && onEnter) {
      e.preventDefault()
      onEnter()
    }
  }

  return (
    <textarea
      ref={ref}
      className={`${className} auto-grow`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKey}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={minRows}
      style={style}
      enterKeyHint={onEnter ? 'go' : undefined}
      autoComplete="off"
    />
  )
}
