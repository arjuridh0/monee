import { useEffect, useRef, useState } from 'react'
import type { MascotCanvas as MascotEngine, MascotState } from '@mascots/core/mascot_canvas.js'
import type { MascotId } from '@/core/finance/types'
import { MASCOT_THEMES } from '@/theme/mascot-themes'
import { MASCOT_EVENT } from './mascot-events'
import { createMascotMachine, type MascotEvent } from './mascot-machine'
import './mascot-canvas.css'

export type { MascotState } from '@mascots/core/mascot_canvas.js'

export interface MascotCanvasProps {
  mascotId?: MascotId
  /** Base expression for this screen; reactions temporarily overlay it. */
  state?: MascotState
  size?: number
  className?: string
}

/** Live 2.5D companion; the canvas engine loads independently of the 3D picker. */
export function MascotCanvas({
  mascotId = 'mochi', state = 'greeting', size = 216, className = '',
}: MascotCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<MascotEngine | null>(null)
  const [reaction, setReaction] = useState<MascotState | null>(null)
  const latest = useRef({ mascotId, state, size, display: (reaction ?? state) as MascotState })
  latest.current = { mascotId, state, size, display: reaction ?? state }
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let disposed = false
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => {
      if (engineRef.current) engineRef.current.reduced = preference.matches
    }
    preference.addEventListener('change', updateMotion)

    void import('@mascots/core/mascot_canvas.js').then(({ MascotCanvas: Engine, STATES }) => {
      const canvas = canvasRef.current
      if (disposed || !canvas) return
      if (!canvas.getContext('2d')) {
        setUnavailable(true)
        return
      }
      const current = latest.current
      engineRef.current = new Engine({
        canvas, mascot: current.mascotId, width: current.size,
        state: STATES.includes(current.display) ? current.display : 'idle',
      })
      updateMotion()
    }).catch(() => {
      if (!disposed) setUnavailable(true)
    })

    return () => {
      disposed = true
      preference.removeEventListener('change', updateMotion)
      engineRef.current?.destroy()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    const machine = createMascotMachine()
    let timer = 0
    const sync = () => {
      const next = machine.current(performance.now())
      setReaction(next)
      return next
    }
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<MascotEvent>).detail
      const accepted = machine.dispatch(detail)
      if (!accepted) return
      window.clearTimeout(timer)
      sync()
      timer = window.setTimeout(sync, accepted.duration + 16)
    }
    window.addEventListener(MASCOT_EVENT, onEvent)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(MASCOT_EVENT, onEvent)
    }
  }, [])

  useEffect(() => { engineRef.current?.setMascot(mascotId) }, [mascotId])
  useEffect(() => {
    // JS consumers can still pass an unknown state; the engine safely falls back.
    try { engineRef.current?.setState(reaction ?? state) }
    catch { engineRef.current?.setState('idle') }
  }, [reaction, state])
  useEffect(() => { engineRef.current?.resize(size) }, [size])
  useEffect(() => {
    const reactToTab = (event: Event) => {
      const next = (event as CustomEvent<MascotState>).detail
      if (!['idle', 'thinking', 'happy', 'greeting'].includes(next)) return
      engineRef.current?.setState(latest.current.display)
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        canvasRef.current?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' })
      }
    }
    window.addEventListener('monee:tab', reactToTab)
    return () => window.removeEventListener('monee:tab', reactToTab)
  }, [])

  const name = MASCOT_THEMES[mascotId].name
  return (
    <div className={`mascot-canvas ${className}`} data-mascot={mascotId} data-state={reaction ?? state}
      style={{ width: size, height: size }} role="img" aria-label={`Maskot ${name}`}>
      <canvas ref={canvasRef} aria-hidden="true" hidden={unavailable} />
      {unavailable && <span className="mascot-canvas__fallback">{name} menemanimu</span>}
    </div>
  )
}
