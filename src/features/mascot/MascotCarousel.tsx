import {
  useCallback, useEffect, useId, useRef, useState,
  type CSSProperties, type KeyboardEvent, type PointerEvent,
} from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/controls'
import type { MascotId } from '@/core/finance/types'
import { MASCOT_THEMES, applyMascotTheme } from '@/theme/mascot-themes'
import { nearestIndex, swipeDirection } from './carousel-math'
import { MASCOT_OPTIONS } from './mascot-options'
import { MascotCanvas } from './MascotCanvas'
import './mascot-carousel.css'

const COUNT = MASCOT_OPTIONS.length

interface MascotCarouselProps {
  initialIndex?: number
  applying?: boolean
  onApply: (id: MascotId) => void | Promise<void>
}

export function MascotCarousel({ initialIndex = 0, applying = false, onApply }: MascotCarouselProps) {
  const [{ index: activeIndex, previousIndex }, setSelection] = useState(() => {
    const index = nearestIndex(initialIndex, COUNT)
    return { index, previousIndex: index }
  })
  const [saving, setSaving] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef(false)
  const mountedRef = useRef(true)
  const busy = applying || saving
  const busyRef = useRef(busy)
  busyRef.current = busy
  const committedThemeRef = useRef(MASCOT_OPTIONS[nearestIndex(initialIndex, COUNT)].id)
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  const wheelRef = useRef({ total: 0, moved: false, timer: 0 })
  const id = useId()
  const optionId = (mascot: MascotId) => `${id}-mascot-${mascot}`
  const active = MASCOT_OPTIONS[activeIndex]

  useEffect(() => { applyMascotTheme(active.id) }, [active.id])
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      applyMascotTheme(committedThemeRef.current)
    }
  }, [])

  const goTo = useCallback((index: number) => {
    if (!busyRef.current && !pendingRef.current) {
      const next = nearestIndex(index, COUNT)
      setSelection(current => next === current.index ? current : { index: next, previousIndex: current.index })
    }
  }, [])

  const move = useCallback((direction: number) => {
    if (!busyRef.current && !pendingRef.current) {
      setSelection(current => ({ index: nearestIndex(current.index + direction, COUNT), previousIndex: current.index }))
    }
  }, [])

  // Rate-limit momentum events while still allowing sustained scrolling to loop.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const wheel = wheelRef.current
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || busyRef.current || pendingRef.current) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight || 240 : 1
      wheel.total += delta * unit
      if (!wheel.moved && Math.abs(wheel.total) >= 32) {
        move(Math.sign(wheel.total))
        wheel.moved = true
      }
      if (wheel.moved) event.preventDefault()
      if (!wheel.timer) wheel.timer = window.setTimeout(() => {
        wheel.total = 0; wheel.moved = false; wheel.timer = 0
      }, 180)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      stage.removeEventListener('wheel', onWheel)
      window.clearTimeout(wheel.timer)
    }
  }, [move])

  const applyActive = async () => {
    if (busyRef.current || pendingRef.current) return
    pendingRef.current = true
    setSaving(true)
    const selectedId = active.id
    try {
      await onApply(selectedId)
      committedThemeRef.current = selectedId
      // Hosts may close the picker as soon as their save succeeds.
      if (!mountedRef.current) applyMascotTheme(selectedId)
    } catch {
      // The host owns the persistence error. Dismissal restores the committed theme.
    } finally {
      pendingRef.current = false
      if (mountedRef.current) setSaving(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || busyRef.current || pendingRef.current) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      move(event.key === 'ArrowRight' ? 1 : -1)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      goTo(event.key === 'Home' ? 0 : COUNT - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void applyActive()
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (busyRef.current || pendingRef.current || event.isPrimary === false || event.button > 0) return
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    suppressClickRef.current = false
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    // Capturing on pointerdown would retarget taps away from the side option.
    if (Math.abs(dx) >= 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      suppressClickRef.current = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
  }

  const finishPointer = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (cancelled) return
    const direction = swipeDirection(event.clientX - drag.x, event.clientY - drag.y)
    if (direction) {
      suppressClickRef.current = true
      move(direction)
    }
  }

  const theme = MASCOT_THEMES[active.id]
  const vars = {
    '--m-accent': theme.accent,
    '--m-ink': theme.accentInk,
    '--accent': theme.accent,
    '--accent-vivid': theme.accentVivid,
    '--text-on-accent': theme.onAccent,
  } as CSSProperties

  return (
    <section className="mascot-carousel" data-mascot={active.id} aria-label="Pilihan maskot" aria-roledescription="karusel" style={vars}>
      <div
        ref={stageRef}
        className="mascot-stage"
        role="listbox"
        aria-label="Pilih maskot"
        aria-orientation="horizontal"
        aria-activedescendant={optionId(active.id)}
        aria-disabled={busy || undefined}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={event => finishPointer(event)}
        onPointerCancel={event => finishPointer(event, true)}
        onLostPointerCapture={event => {
          // Touch implicitly captures the option first. Its bubbling loss when
          // capture transfers to this stage does not cancel the user's swipe.
          if (event.target === event.currentTarget) finishPointer(event, true)
        }}
      >
        {MASCOT_OPTIONS.map((option, index) => {
          const offset = nearestIndex(index - activeIndex + 1, COUNT) - 1
          const previousOffset = nearestIndex(index - previousIndex + 1, COUNT) - 1
          const direction = activeIndex === previousIndex ? 0 : nearestIndex(activeIndex - previousIndex, COUNT) === 1 ? 1 : -1
          const wraps = direction && previousOffset === -direction && offset === direction
          const previewTheme = MASCOT_THEMES[option.id]
          return (
            <div
              key={option.id}
              id={optionId(option.id)}
              role="option"
              aria-selected={offset === 0}
              aria-label={`${option.name}, tema ${option.themeName}`}
              data-position={offset}
              data-wrap={wraps ? direction : undefined}
              className="mascot-preview"
              style={{ '--preview-tint': previewTheme.accentSoft } as CSSProperties}
              onClick={() => {
                if (suppressClickRef.current) { suppressClickRef.current = false; return }
                goTo(index)
              }}
            >
              <div className="mascot-preview__art" aria-hidden="true">
                <MascotCanvas mascotId={option.id} state="idle" size={240} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mascot-carousel__meta" aria-live="polite" aria-atomic="true">
        <h3 className="mascot-carousel__name">{active.name}</h3>
        <p className="mascot-carousel__theme">Tema {active.themeName} · {active.personality}</p>
        <span className="sr-only">{activeIndex + 1} dari {COUNT}</span>
      </div>

      <div className="mascot-carousel__actions">
        <button type="button" className="mascot-arrow" aria-label="Maskot sebelumnya" disabled={busy} onClick={() => move(-1)}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <Button onClick={() => { void applyActive() }} loading={busy} disabled={busy}>Pilih Maskot ini</Button>
        <button type="button" className="mascot-arrow" aria-label="Maskot berikutnya" disabled={busy} onClick={() => move(1)}>
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
