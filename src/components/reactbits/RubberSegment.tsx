// Monee adaptation of reactbits.dev/micro/rubber-segment; see LICENSE.md.
import { useId, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import './interactions.css'

interface RubberSegmentProps {
  items: (string | { value: string; label: ReactNode; icon?: ReactNode })[]
  value?: string
  defaultValue?: string
  onChange?: (value: string, index: number) => void
  disabled?: boolean
  'aria-label'?: string
}

export function RubberSegment({ items, value, defaultValue, onChange, disabled, 'aria-label': label = 'Pilihan' }: RubberSegmentProps) {
  const list = items.map(item => typeof item === 'string' ? { value: item, label: item, icon: undefined } : item)
  const [inner, setInner] = useState(defaultValue ?? list[0]?.value)
  const selected = value ?? inner
  const index = Math.max(0, list.findIndex(item => item.value === selected))
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const select = (next: number) => {
    const item = list[next]
    if (!item || disabled || next === index) return
    if (value === undefined) setInner(item.value)
    onChange?.(item.value, next)
  }

  return <div ref={root} className="rb-segment" role="radiogroup" aria-label={label} aria-disabled={disabled}>
    {list.map((item, i) => <button type="button" role="radio" key={item.value} aria-checked={i === index}
      tabIndex={i === index ? 0 : -1} disabled={disabled} onClick={() => select(i)}
      onKeyDown={event => {
        let next = index
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % list.length
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + list.length) % list.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = list.length - 1
        else return
        event.preventDefault()
        select(next)
        root.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
      }}>
      {i === index && <motion.span className="rb-segment-thumb" aria-hidden="true" layoutId={id}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 27 }} />}
      <span className="rb-segment-content">{item.icon}{item.label}</span>
    </button>)}
  </div>
}
