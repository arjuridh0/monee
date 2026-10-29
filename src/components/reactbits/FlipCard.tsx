// Monee adaptation of reactbits.dev/micro/flip-card; see LICENSE.md.
import { useId, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import './interactions.css'

interface FlipCardProps {
  front: ReactNode
  back?: ReactNode
  flipped?: boolean
  defaultFlipped?: boolean
  onFlipChange?: (flipped: boolean) => void
  disabled?: boolean
}

export function FlipCard({ front, back, flipped, defaultFlipped = false, onFlipChange, disabled }: FlipCardProps) {
  const [inner, setInner] = useState(defaultFlipped)
  const hasBack = back !== undefined
  const shown = hasBack && (flipped ?? inner)
  const reduce = useReducedMotion()
  const id = useId()
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const flip = () => {
    if (disabled || !hasBack) return
    if (flipped === undefined) setInner(!shown)
    onFlipChange?.(!shown)
  }

  return <div className="rb-flip-perspective"><motion.section className={`rb-flip${shown ? ' rb-flip--back' : ''}`} aria-label="Ringkasan keuangan"
    initial={false} animate={{ rotateY: reduce ? 0 : shown ? 180 : 0 }}
    transition={reduce ? { duration: 0.12 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    onPointerDown={event => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button,a,input,select,textarea'))) return
      start.current = { x: event.clientX, y: event.clientY }
      swiped.current = false
    }}
    onPointerCancel={() => { start.current = null }}
    onPointerUp={event => {
      const point = start.current
      start.current = null
      if (!point) return
      const dx = Math.abs(event.clientX - point.x)
      if (dx > 48 && dx > Math.abs(event.clientY - point.y)) { swiped.current = true; flip() }
    }} onClick={event => {
      if (swiped.current) { swiped.current = false; return }
      if (!(event.target instanceof Element && event.target.closest('button,a,input,select,textarea,[role="button"]'))) flip()
    }}>
    {[false, true].filter(side => !side || hasBack).map(side => <div key={String(side)} className="rb-flip-side"
      data-active={side === shown} aria-hidden={side !== shown}
      ref={node => { if (node) { if (side === shown) node.removeAttribute('inert'); else node.setAttribute('inert', '') } }}
      style={{ transform: !reduce && side ? 'rotateY(180deg)' : 'none', ...(reduce && side !== shown ? { visibility: 'hidden' as const } : {}) }}>
      <header className="rb-flip-header"><span>{side ? 'Tabungan' : 'Saldo periode'}</span>
        {hasBack && <button type="button" className="ui-icon-button" aria-controls={`${id}-${side ? 'back' : 'front'}`} aria-pressed={shown}
          aria-label={side ? 'Kembali ke saldo periode' : 'Lihat tabungan'} disabled={disabled} onClick={flip}>
          <RefreshCw size={18} aria-hidden="true" />
        </button>}
      </header>
      <div id={`${id}-${side ? 'back' : 'front'}`} className="rb-flip-face">{side ? back : front}</div>
    </div>)}
  </motion.section></div>
}
