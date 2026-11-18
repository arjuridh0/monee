import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { getToday, isValidDateStr } from '@/core/finance/period'
import './date-field.css'

interface DateFieldProps {
  label: string
  value: string
  onChange: (date: string) => void
  min?: string | undefined
  max?: string | undefined
  disabled?: boolean | undefined
  clearable?: boolean
}
const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('id-ID', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, month, 1))))
const weekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const longWeekdays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
function dateObject(value: string) { return new Date(`${value}T12:00:00Z`) }
function formatDate(value: string, weekday = false) {
  return new Intl.DateTimeFormat('id-ID', { ...(weekday ? { weekday: 'long' } : {}), day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dateObject(value))
}
function monthDate(year: number, month: number, day: number) { return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
function monthDays(year: number, month: number) {
  const date = dateObject(monthDate(year, month, 1)); date.setUTCMonth(month + 1, 0)
  return date.getUTCDate()
}

/** An in-form calendar keeps the same touch and keyboard interaction on every device. */
export function DateField({ label, value, onChange, min, max, disabled = false, clearable = false }: DateFieldProps) {
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const lower = isValidDateStr(min) ? min : '0001-01-01'
  const upper = isValidDateStr(max) ? max : '9999-12-31'
  const validBounds = lower <= upper
  const clamp = (date: string) => date < lower ? lower : date > upper ? upper : date
  const today = getToday()
  const [expanded, setExpanded] = useState(false)
  const [focused, setFocused] = useState(() => clamp(isValidDateStr(value) ? value : today))
  const [choosing, setChoosing] = useState(false)
  const [yearDraft, setYearDraft] = useState('')
  const open = expanded && !disabled && validBounds
  const year = Number(focused.slice(0, 4)), month = Number(focused.slice(5, 7)) - 1
  const first = monthDate(year, month, 1), days = monthDays(year, month)
  const leading = (dateObject(first).getUTCDay() + 6) % 7
  const selected = isValidDateStr(value)

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setExpanded(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  useEffect(() => {
    if (!open) return
    function reveal() {
      const calendar = panel.current
      if (!calendar) return
      const dialog = calendar.closest('dialog')
      const body = calendar.querySelector<HTMLElement>('.date-calendar-grid,.date-calendar-chooser')
      if (dialog && body) {
        const top = (dialog.querySelector('.ui-dialog-header')?.getBoundingClientRect().bottom ?? dialog.getBoundingClientRect().top) + 8
        const bottom = (dialog.querySelector('.ui-dialog-footer')?.getBoundingClientRect().top ?? dialog.getBoundingClientRect().bottom) - 8
        const chrome = calendar.getBoundingClientRect().height - body.getBoundingClientRect().height
        // Measure the real sticky actions, including wrapped headings on small phones.
        body.style.maxHeight = `${Math.max(44, Math.min(304, bottom - top - chrome))}px`
        const rect = calendar.getBoundingClientRect()
        dialog.scrollTop += Math.min(0, rect.top - top) || Math.min(Math.max(0, rect.bottom - bottom), Math.max(0, rect.top - top))
      } else calendar.scrollIntoView?.({ block: 'nearest' })
      if (!choosing) {
        const active = calendar.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
        active?.focus({ preventScroll: true })
        const grid = active?.closest<HTMLElement>('[role="grid"]')
        if (grid && active) {
          const row = active.getBoundingClientRect(), box = grid.getBoundingClientRect()
          const heading = grid.querySelector('.date-calendar-weekdays')?.getBoundingClientRect().bottom ?? box.top
          grid.scrollTop += Math.max(0, row.bottom - box.bottom) + Math.min(0, row.top - heading)
        }
      }
    }
    reveal()
    window.addEventListener('resize', reveal)
    return () => window.removeEventListener('resize', reveal)
  }, [open, focused, choosing])

  function close() { setExpanded(false); trigger.current?.focus({ preventScroll: true }) }
  function choose(date: string) { onChange(date); close() }
  function openCalendar() {
    setFocused(clamp(selected ? value : today)); setChoosing(false); setExpanded(true)
  }
  function moveMonth(offset: number) {
    const index = Math.max(12, Math.min(119999, year * 12 + month + offset))
    const y = Math.floor(index / 12), m = index % 12
    setFocused(clamp(monthDate(y, m, Math.min(Number(focused.slice(8)), monthDays(y, m)))))
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return }
    if (!(event.target instanceof HTMLButtonElement) || !event.target.dataset.date) return
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let offset = offsets[event.key]
    const weekday = (dateObject(focused).getUTCDay() + 6) % 7
    if (event.key === 'Home') offset = -weekday
    if (event.key === 'End') offset = 6 - weekday
    if (offset !== undefined) {
      event.preventDefault(); const next = dateObject(focused); next.setUTCDate(next.getUTCDate() + offset)
      setFocused(clamp(next.getUTCFullYear() < 1 ? '0001-01-01' : next.getUTCFullYear() > 9999 ? '9999-12-31' : next.toISOString().slice(0, 10)))
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault(); moveMonth((event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1))
    }
  }
  const draftYear = Number(yearDraft)
  const yearValid = /^\d{1,4}$/.test(yearDraft) && draftYear >= 1 && draftYear <= 9999
  return <div ref={root} className="date-field" data-open={open || undefined} onKeyDown={navigate}
    onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setExpanded(false) }}>
    <label htmlFor={`${id}-trigger`} id={`${id}-label`}>{label}</label>
    <button ref={trigger} type="button" id={`${id}-trigger`} className="date-field-trigger"
      aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={open ? `${id}-calendar` : undefined}
      disabled={disabled || !validBounds} onClick={() => open ? close() : openCalendar()}
      onKeyDown={event => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); openCalendar() } }}>
      <CalendarDays size={18} aria-hidden="true" /><span id={`${id}-value`}>{selected ? formatDate(value) : 'Pilih tanggal'}</span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div ref={panel} id={`${id}-calendar`} className="date-calendar" role="group" aria-label={`Kalender ${label}`}>
      <div className="date-calendar-nav">
        <button type="button" aria-label="Bulan sebelumnya" disabled={first <= lower.slice(0, 7) + '-01'} onClick={() => moveMonth(-1)}><ChevronLeft size={19} /></button>
        <button type="button" className="date-calendar-heading" aria-expanded={choosing} aria-label={`Pilih bulan dan tahun, ${months[month]} ${year}`}
          onClick={() => { setYearDraft(String(year)); setChoosing(current => !current) }}>
          <span aria-live="polite">{months[month]} {year}</span><ChevronDown size={14} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Bulan berikutnya" disabled={first >= upper.slice(0, 7) + '-01'} onClick={() => moveMonth(1)}><ChevronRight size={19} /></button>
      </div>
      {choosing ? <div className="date-calendar-chooser">
        <label>Tahun kalender<input type="number" inputMode="numeric" min="1" max="9999" value={yearDraft} autoFocus
          onChange={event => setYearDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault() }} /></label>
        <div className="date-calendar-months">{months.map((name, index) => <button type="button" key={name}
          disabled={!yearValid || monthDate(draftYear, index, monthDays(draftYear, index)) < lower || monthDate(draftYear, index, 1) > upper}
          aria-pressed={index === month && draftYear === year}
          onClick={() => { setFocused(clamp(monthDate(draftYear, index, Math.min(Number(focused.slice(8)), monthDays(draftYear, index))))); setChoosing(false) }}>{name}</button>)}</div>
      </div> : <div role="grid" aria-label={`${months[month]} ${year}`} className="date-calendar-grid">
        <div role="row" className="date-calendar-weekdays">{weekdays.map((name, index) => <span role="columnheader" aria-label={longWeekdays[index]} key={name}>{name}</span>)}</div>
        {Array.from({ length: 6 }, (_, week) => <div role="row" key={week}>{Array.from({ length: 7 }, (_, weekday) => {
          const day = week * 7 + weekday - leading + 1
          if (day < 1 || day > days) return <span role="gridcell" key={weekday} />
          const date = monthDate(year, month, day)
          return <span role="gridcell" aria-selected={date === value} key={weekday}><button type="button" data-date={date}
            aria-label={formatDate(date, true)} aria-current={date === today ? 'date' : undefined} disabled={date < lower || date > upper}
            tabIndex={date === focused ? 0 : -1} onFocus={() => setFocused(date)} onClick={() => choose(date)}>{day}</button></span>
        })}</div>)}
      </div>}
      <div className="date-calendar-actions">
        <button type="button" disabled={today < lower || today > upper} onClick={() => choose(today)}>Hari ini</button>
        {clearable && <button type="button" onClick={() => choose('')}>Hapus tanggal</button>}
        <button type="button" onClick={close}>Tutup</button>
      </div>
    </div>}
  </div>
}
