import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Bucket } from '@/core/finance/types'
import { CategoryIcon } from './CategoryIcon'
import './bucket-picker.css'

interface BucketPickerProps {
  label?: string
  buckets: readonly Bucket[]
  value: string | undefined
  onChange: (id: string) => void
  disabled?: boolean
}

function revealOption(option: HTMLButtonElement | null | undefined) {
  const list = option?.parentElement
  if (!option || !list) return
  const row = option.getBoundingClientRect(), box = list.getBoundingClientRect()
  list.scrollTop += Math.max(0, row.bottom - box.bottom) + Math.min(0, row.top - box.top)
  const dialog = list.closest('dialog')
  if (!dialog) return
  const top = (dialog.querySelector('.ui-dialog-header')?.getBoundingClientRect().bottom ?? 0) + 8
  const bottom = (dialog.querySelector('.ui-dialog-footer')?.getBoundingClientRect().top ?? dialog.getBoundingClientRect().bottom) - 8
  // Native focus scrolling does not account for a sticky save footer.
  if (bottom > top) dialog.scrollTop += Math.max(0, box.bottom - bottom) + Math.min(0, box.top - top)
}

/** In-form choices avoid the unrelated native Android select popup. */
export function BucketPicker({ label = 'Bucket', buckets, value, onChange, disabled = false }: BucketPickerProps) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const search = useRef({ text: '', time: 0 })
  const [expanded, setExpanded] = useState(false)
  const options = [...buckets].sort((a, b) => a.sortOrder - b.sortOrder)
  const selectedIndex = options.findIndex(bucket => bucket.id === value)
  const selected = options[selectedIndex]
  const open = expanded && !disabled && options.length > 0

  useEffect(() => {
    if (!open) return
    const option = optionRefs.current[Math.max(0, selectedIndex)]
    option?.focus({ preventScroll: true })
    revealOption(option)
  }, [open, selectedIndex])

  function choose(bucket: Bucket) {
    onChange(bucket.id)
    setExpanded(false)
    trigger.current?.focus({ preventScroll: true })
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      setExpanded(false); trigger.current?.focus({ preventScroll: true })
      return
    }
    const current = optionRefs.current.findIndex(node => node === document.activeElement)
    let next = -1
    if (event.key === 'ArrowDown') next = Math.min(options.length - 1, current + 1)
    else if (event.key === 'ArrowUp') next = Math.max(0, current - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = options.length - 1
    else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = performance.now()
      search.current.text = now - search.current.time < 700 ? search.current.text + event.key : event.key
      search.current.time = now
      const text = search.current.text.toLocaleLowerCase('id')
      const query = [...text].every(char => char === text[0]) ? text[0] : text
      for (let offset = 1; offset <= options.length; offset++) {
        const index = (Math.max(0, current) + offset) % options.length
        if (options[index]!.name.toLocaleLowerCase('id').startsWith(query)) { next = index; break }
      }
    } else return
    event.preventDefault(); event.stopPropagation()
    if (next >= 0) {
      optionRefs.current[next]?.focus({ preventScroll: true })
      revealOption(optionRefs.current[next])
    }
  }

  return <div className="bucket-picker" onKeyDown={navigate}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false) }}>
    <label id={`${id}-label`} htmlFor={`${id}-trigger`} className="bucket-picker-label">{label}</label>
    <button ref={trigger} id={`${id}-trigger`} type="button" className="bucket-picker-trigger"
      aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? `${id}-options` : undefined} disabled={disabled || !options.length}
      onClick={() => { search.current.text = ''; setExpanded(value => !value) }}
      onKeyDown={event => {
        if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setExpanded(true) }
      }}>
      <span className="bucket-picker-icon"><CategoryIcon name={selected?.icon} size={20} /></span>
      <span id={`${id}-value`} className="bucket-picker-value">{selected?.name ?? (options.length ? 'Pilih bucket' : 'Belum ada bucket')}</span>
      <ChevronDown className="bucket-picker-chevron" size={18} aria-hidden="true" />
    </button>
    {open && <div id={`${id}-options`} role="listbox" aria-label={`Pilihan ${label}`} className="bucket-picker-options">
      {options.map((bucket, index) => <button key={bucket.id} ref={node => { optionRefs.current[index] = node }}
        type="button" role="option" aria-selected={bucket.id === value} tabIndex={-1}
        className="bucket-picker-option" onClick={() => choose(bucket)}>
        <span className="bucket-picker-icon"><CategoryIcon name={bucket.icon} size={20} /></span>
        <span className="bucket-picker-value">{bucket.name}</span>
        {bucket.id === value && <Check size={18} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>
}
