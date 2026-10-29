// Monee adaptation of reactbits.dev/micro/code-slots; see LICENSE.md.
import { useEffect, useId, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import './interactions.css'

interface CodeSlotsProps {
  length?: number
  value?: string
  defaultValue?: string
  onChange?: (code: string) => void
  onComplete?: (code: string) => void
  status?: 'idle' | 'error' | 'success'
  mask?: boolean
  disabled?: boolean
  ariaLabel?: string
}

export function CodeSlots({ length = 6, value, defaultValue = '', onChange, onComplete,
  status = 'idle', mask = true, disabled, ariaLabel = 'PIN 6 digit' }: CodeSlotsProps) {
  const [inner, setInner] = useState(defaultValue)
  const [focused, setFocused] = useState(false)
  const code = (value ?? inner).replace(/\D/g, '').slice(0, length)
  const previous = useRef(code)
  const previousStatus = useRef('idle')
  const id = useId()
  const reduce = useReducedMotion()
  useEffect(() => { previous.current = code }, [code])
  useEffect(() => {
    if (status === 'error' && previousStatus.current !== 'error') {
      setInner('')
      previous.current = ''
      onChange?.('')
    }
    previousStatus.current = status
  }, [status, onChange])

  return <label className="rb-code">
    <span className="rb-code-label">{ariaLabel}</span>
    <span className="rb-code-row" data-status={status}>
      <input type={mask ? 'password' : 'text'} inputMode="numeric" autoComplete="off" spellCheck={false}
        maxLength={length} value={code} aria-label={ariaLabel} aria-describedby={id}
        aria-invalid={status === 'error'} disabled={disabled} readOnly={status === 'success'}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={event => {
          const next = event.target.value.replace(/\D/g, '').slice(0, length)
          const was = previous.current
          previous.current = next
          if (value === undefined) setInner(next)
          onChange?.(next)
          if (next.length === length && was.length < length) onComplete?.(next)
        }} />
      {Array.from({ length }, (_, i) => <span className="rb-code-slot" key={i} aria-hidden="true" data-filled={Boolean(code[i])}>
        {focused && status !== 'success' && code.length < length && i === code.length && <span className="rb-code-caret" />}
        {status === 'success' ? <Check size={18} /> : code[i] ? <motion.span key={`${i}-${code[i]}`}
          initial={reduce ? false : { y: 8, scale: 0.8, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0.2, duration: 0.3, delay: i * 0.02 }}>
          {mask ? '•' : code[i]}
        </motion.span> : null}
      </span>)}
    </span>
    <span id={id} className="sr-only" aria-live="polite">
      {status === 'success' ? 'PIN diterima' : `${code.length} dari ${length} digit terisi`}
    </span>
  </label>
}
