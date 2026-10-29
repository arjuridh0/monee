import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/controls'
import type { MascotId } from '@/core/finance/types'
import { MASCOT_THEMES, applyMascotTheme } from '@/theme/mascot-themes'
import { cardMotion, cardStep, clamp, nearestIndex, snapTarget } from './carousel-math'
import { MASCOT_OPTIONS, type MascotOption } from './mascot-options'
import { canRenderMascotSnapshot, getMascotSnapshot, retainMascotSnapshots } from './model-snapshot'
import { MascotCanvas } from './MascotCanvas'
import './mascot-carousel.css'

const COUNT = MASCOT_OPTIONS.length
const EDGE_OVERSCROLL = 0.4

interface MascotCarouselProps {
  initialIndex?: number
  applying?: boolean
  onApply: (id: MascotId) => void | Promise<void>
}

function mascotVars(option: MascotOption): CSSProperties {
  return {
    '--m-accent': option.accent,
    '--m-accent-vivid': option.accentVivid,
    '--m-soft': option.soft,
    '--m-ink': option.ink,
    '--m-bg': option.bgTone,
  } as CSSProperties
}

export function MascotCarousel({ initialIndex = 0, applying = false, onApply }: MascotCarouselProps) {
  const startIndex = clamp(initialIndex, 0, COUNT - 1)
  const [activeIndex, setActiveIndex] = useState(startIndex)
  const [dragging, setDragging] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [hidden, setHidden] = useState(document.hidden)
  const [snapshots, setSnapshots] = useState<Partial<Record<MascotId, string>>>({})
  const [failed, setFailed] = useState<Partial<Record<MascotId, boolean>>>({})

  const stageRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const innerRefs = useRef<(HTMLDivElement | null)[]>([])
  const positionRef = useRef(startIndex)
  const targetRef = useRef(startIndex)
  const velocityRef = useRef(0)
  const activeRef = useRef(startIndex)
  const lastFramePosRef = useRef(startIndex)
  const lastTimeRef = useRef(0)
  const mountedRef = useRef(true)
  const loadedRef = useRef<Partial<Record<MascotId, string>>>({})
  const dragRef = useRef({ active: false, lastX: 0, distance: 0 })
  const wheelRef = useRef({ active: false, timer: 0 })
  const wakeRef = useRef<() => void>(() => undefined)
  const appliedRef = useRef(false)
  const initialThemeRef = useRef<MascotId>(MASCOT_OPTIONS[clamp(initialIndex, 0, COUNT - 1)].id)

  const active = MASCOT_OPTIONS[activeIndex]

  useEffect(() => {
    mountedRef.current = true
    const release = retainMascotSnapshots()
    return () => { mountedRef.current = false; release() }
  }, [])

  // Swiping previews the theme; Apply commits it, dismissal restores the previous one.
  useEffect(() => { applyMascotTheme(active.id) }, [active.id])
  useEffect(() => () => {
    if (!appliedRef.current) applyMascotTheme(initialThemeRef.current)
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(query.matches)
    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  const loadSnapshot = useCallback((id: MascotId) => {
    if (loadedRef.current[id]) return
    if (!canRenderMascotSnapshot()) {
      setFailed((current) => current[id] ? current : { ...current, [id]: true })
      return
    }
    getMascotSnapshot(id)
      .then((source) => {
        if (!mountedRef.current) return
        loadedRef.current[id] = source
        setSnapshots((current) => current[id] ? current : { ...current, [id]: source })
      })
      .catch(() => {
        if (!mountedRef.current) return
        setFailed((current) => current[id] ? current : { ...current, [id]: true })
      })
  }, [])

  useEffect(() => {
    if (!reducedMotion && !hidden) loadSnapshot(active.id)
  }, [active.id, loadSnapshot, reducedMotion, hidden])

  const applyActive = useCallback(async (id: MascotId) => {
    try {
      await onApply(id)
      appliedRef.current = true
    } catch {
      // The host renders the persistence error; preview stays until dismissal.
    }
  }, [onApply])

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      if (!frame && !document.hidden && !reducedMotion) frame = requestAnimationFrame(loop)
    }
    const loop = (time: number) => {
      frame = 0
      const dt = lastTimeRef.current ? Math.min(48, time - lastTimeRef.current) : 16.67
      lastTimeRef.current = time

      if (!dragRef.current.active && !wheelRef.current.active) {
        if (reducedMotion) {
          positionRef.current = targetRef.current
        } else {
          const factor = 1 - Math.pow(1 - 0.17, dt / 16.67)
          positionRef.current += (targetRef.current - positionRef.current) * factor
          if (Math.abs(targetRef.current - positionRef.current) < 0.001) {
            positionRef.current = targetRef.current
          }
        }
      }

      const step = cardStep(cardRefs.current[0]?.offsetWidth ?? 280)
      const speed = Math.abs(positionRef.current - lastFramePosRef.current)
      const blur = reducedMotion ? 0 : Math.min(7, speed * step * 0.075)

      for (let index = 0; index < COUNT; index += 1) {
        const node = cardRefs.current[index]
        if (!node) continue
        if (reducedMotion) {
          node.style.transform = ''; node.style.opacity = ''; node.style.zIndex = ''
          const inner = innerRefs.current[index]
          if (inner) inner.style.filter = ''
          continue
        }
        const motion = cardMotion(index - positionRef.current)
        node.style.transform =
          `translate3d(${motion.offset * step}px, 0, ${motion.depth}px) ` +
          `rotateY(${motion.rotateY}deg) scale(${motion.scale})`
        node.style.opacity = String(motion.opacity)
        node.style.zIndex = String(100 - Math.round(Math.min(Math.abs(motion.offset), 3) * 10))
        const inner = innerRefs.current[index]
        if (inner) inner.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : ''
      }
      lastFramePosRef.current = positionRef.current

      const next = nearestIndex(positionRef.current, COUNT)
      if (next !== activeRef.current) {
        activeRef.current = next
        setActiveIndex(next)
      }
      if (Math.abs(positionRef.current - targetRef.current) > 0.001
        && !dragRef.current.active && !wheelRef.current.active) schedule()
    }
    wakeRef.current = () => {
      if (reducedMotion) {
        const next = nearestIndex(targetRef.current, COUNT)
        positionRef.current = next
        activeRef.current = next
        setActiveIndex(next)
      } else schedule()
    }
    const visibility = () => {
      setHidden(document.hidden)
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0 }
      else { lastTimeRef.current = 0; wakeRef.current() }
    }
    const resize = () => { lastTimeRef.current = 0; wakeRef.current() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('resize', resize)
    if (reducedMotion) loop(0)
    else schedule()
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('resize', resize)
      wakeRef.current = () => undefined
    }
  }, [reducedMotion])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || reducedMotion) return
    const wheel = wheelRef.current
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (!delta) return
      event.preventDefault()
      const step = cardStep(cardRefs.current[0]?.offsetWidth ?? 280)
      positionRef.current = clamp(
        positionRef.current + (delta / (step * 1.1)) * 0.85,
        -EDGE_OVERSCROLL,
        COUNT - 1 + EDGE_OVERSCROLL,
      )
      const next = nearestIndex(positionRef.current, COUNT)
      if (next !== activeRef.current) {
        activeRef.current = next
        setActiveIndex(next)
      }
      wheel.active = true
      wakeRef.current()
      window.clearTimeout(wheel.timer)
      wheel.timer = window.setTimeout(() => {
        wheel.active = false
        targetRef.current = snapTarget(positionRef.current, 0, COUNT)
        wakeRef.current()
      }, 140)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      stage.removeEventListener('wheel', onWheel)
      window.clearTimeout(wheel.timer)
    }
  }, [reducedMotion])

  const goTo = useCallback((index: number) => {
    const next = clamp(index, 0, COUNT - 1)
    targetRef.current = next
    velocityRef.current = 0
    wheelRef.current.active = false
    if (reducedMotion) positionRef.current = next
    wakeRef.current()
  }, [reducedMotion])

  const move = (direction: number) => {
    goTo(nearestIndex(targetRef.current, COUNT) + direction)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reducedMotion) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return
    dragRef.current = { active: true, lastX: event.clientX, distance: 0 }
    targetRef.current = positionRef.current
    velocityRef.current = 0
    wheelRef.current.active = false
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    const dx = event.clientX - dragRef.current.lastX
    dragRef.current.lastX = event.clientX
    dragRef.current.distance += Math.abs(dx)
    const step = cardStep(cardRefs.current[0]?.offsetWidth ?? 280)
    const delta = dx / step
    positionRef.current = clamp(
      positionRef.current - delta,
      -EDGE_OVERSCROLL,
      COUNT - 1 + EDGE_OVERSCROLL,
    )
    velocityRef.current = clamp(-delta, -1.2, 1.2)
    wakeRef.current()
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    targetRef.current = snapTarget(positionRef.current, velocityRef.current, COUNT)
    velocityRef.current = 0
    wakeRef.current()
  }

  const handleCardClick = (index: number) => {
    if (dragRef.current.distance > 6) {
      dragRef.current.distance = 0
      return
    }
    if (index !== activeRef.current) goTo(index)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      goTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      goTo(COUNT - 1)
    } else if (event.key === 'Enter' && event.target === event.currentTarget) {
      event.preventDefault()
      void applyActive(active.id)
    }
  }

  const actionVars = {
    ...mascotVars(active),
    '--accent': active.accent,
    '--accent-vivid': active.accentVivid,
    '--text-on-accent': MASCOT_THEMES[active.id].onAccent,
  } as CSSProperties

  return (
    <div className="mascot-carousel" style={mascotVars(active)}>
      <div className="mascot-carousel__backdrop" aria-hidden="true">
        {MASCOT_OPTIONS.map((option, index) => (
          <div
            key={option.id}
            className={`mascot-carousel__tint${index === activeIndex ? ' is-active' : ''}`}
            style={mascotVars(option)}
          />
        ))}
      </div>

      <div
        ref={stageRef}
        className={`mascot-stage${dragging ? ' is-dragging' : ''}${reducedMotion ? ' mascot-stage--simple' : ''}`}
        data-paused={hidden}
        role="listbox"
        aria-label="Pilih maskot"
        aria-activedescendant={`mascot-option-${active.id}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {MASCOT_OPTIONS.map((option, index) => {
          const snapshot = snapshots[option.id]
          const isFailed = failed[option.id] || !canRenderMascotSnapshot()
          return (
            <div
              key={option.id}
              ref={(node) => { cardRefs.current[index] = node }}
              id={`mascot-option-${option.id}`}
              role="option"
              aria-selected={index === activeIndex}
              aria-label={`${option.name}, tema ${option.themeName}`}
              data-active={index === activeIndex}
              className="mascot-card"
              style={mascotVars(option)}
              onClick={() => handleCardClick(index)}
            >
              <div
                ref={(node) => { innerRefs.current[index] = node }}
                className="mascot-card__inner"
              >
                <div className="mascot-card__art">
                  {snapshot ? (
                    <img src={snapshot} alt="" draggable={false} />
                  ) : isFailed ? (
                    <MascotCanvas mascotId={option.id} state="idle" size={reducedMotion ? 112 : 216} />
                  ) : reducedMotion ? (
                    <MascotCanvas mascotId={option.id} state="idle" size={112} />
                  ) : (
                    <span className="mascot-card__loading" aria-hidden="true" />
                  )}
                </div>
                <div className="mascot-card__foot">
                  <span className="mascot-card__name">{option.name}</span>
                  <span className="mascot-card__personality">{option.personality}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mascot-carousel__meta" aria-live="polite">
        <p className="mascot-carousel__theme">{active.name} · Tema {active.themeName}</p>
        <p className="mascot-carousel__tagline">{active.tagline}</p>
      </div>

      <div className="mascot-dots" role="group" aria-label="Pilih maskot cepat">
        {MASCOT_OPTIONS.map((option, index) => (
          <button
            key={option.id}
            type="button"
            className={`mascot-dot${index === activeIndex ? ' is-active' : ''}`}
            aria-label={`Pilih ${option.name}`}
            aria-current={index === activeIndex ? 'true' : undefined}
            onClick={() => goTo(index)}
          />
        ))}
      </div>

      <div className="mascot-carousel__actions" style={actionVars}>
        <button
          type="button"
          className="mascot-arrow"
          aria-label="Maskot sebelumnya"
          onClick={() => move(-1)}
          disabled={activeIndex === 0}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <Button onClick={() => { void applyActive(active.id) }} loading={applying} disabled={applying}>
          Pilih Maskot ini
        </Button>
        <button
          type="button"
          className="mascot-arrow"
          aria-label="Maskot berikutnya"
          onClick={() => move(1)}
          disabled={activeIndex === COUNT - 1}
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
