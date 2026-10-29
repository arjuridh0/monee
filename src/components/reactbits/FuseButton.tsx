// Monee adaptation of reactbits.dev/micro/fuse-button; see LICENSE.md.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, Save, Undo2 } from 'lucide-react'
import { InlineError } from '@/components/ui/feedback'
import './interactions.css'

type Phase = 'idle' | 'armed' | 'settled'
interface FuseButtonProps {
  label?: string
  doneLabel?: string
  undoWindow?: number
  commitOn?: 'press' | 'fuseEnd'
  settle?: 'reset' | 'stay'
  disabled?: boolean
  beforeArm?: () => boolean | Promise<boolean>
  onPhaseChange?: (phase: Phase) => void
  onSettled?: () => void
  onReset?: () => void
  onCommit: () => void | Promise<void>
  onUndo: () => void | Promise<void>
  getErrorMessage?: (error: unknown) => string
}

export function FuseButton({ label = 'Simpan', doneLabel = 'Tersimpan', undoWindow = 2000,
  commitOn = 'press', settle = 'reset', disabled, beforeArm, onPhaseChange, onSettled, onReset, onCommit, onUndo, getErrorMessage }: FuseButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const button = useRef<HTMLButtonElement>(null)
  const busy = useRef(false)
  const mounted = useRef(true)
  const callbacks = useRef({ onCommit, onUndo, getErrorMessage, beforeArm, onPhaseChange, onSettled, onReset })
  callbacks.current = { onCommit, onUndo, getErrorMessage, beforeArm, onPhaseChange, onSettled, onReset }

  useEffect(() => { callbacks.current.onPhaseChange?.(phase) }, [phase])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const perform = useCallback(async (action: () => void | boolean | Promise<void | boolean>, next: Phase, undo = false) => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      const accepted = await action()
      if (mounted.current && accepted !== false) {
        setPhase(next)
        if (undo) callbacks.current.onReset?.()
      }
    } catch (cause) {
      if (mounted.current) {
        setError(callbacks.current.getErrorMessage?.(cause) ?? (undo ? 'Pembatalan gagal. Periksa riwayat sebelum mencoba lagi.' : 'Aksi belum tersimpan. Coba lagi.'))
        setPhase(undo ? 'settled' : 'idle')
      }
    } finally {
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'armed' || pending) return
    button.current?.focus({ preventScroll: true })
    const timer = window.setTimeout(() => {
      if (commitOn === 'fuseEnd') void perform(() => callbacks.current.onCommit(), 'settled')
      else setPhase('settled')
    }, undoWindow)
    return () => window.clearTimeout(timer)
  }, [phase, pending, commitOn, undoWindow, perform])

  useEffect(() => {
    if (phase !== 'settled' || error) return
    const timer = window.setTimeout(() => {
      callbacks.current.onSettled?.()
      if (settle === 'reset') {
        setPhase('idle')
        callbacks.current.onReset?.()
      }
    }, 800)
    return () => window.clearTimeout(timer)
  }, [phase, settle, error])

  const undo = () => { void perform(() => callbacks.current.onUndo(), 'idle', true) }
  const text = pending ? 'Memproses…' : phase === 'armed' ? 'Batal' : phase === 'settled' ? doneLabel : label
  const Icon = phase === 'armed' ? Undo2 : phase === 'settled' ? Check : Save
  return <div className="rb-fuse-group">
    <button ref={button} type="button" className="rb-fuse" data-phase={phase} aria-busy={pending}
      disabled={pending || phase === 'settled' || (phase === 'idle' && disabled)}
      style={{ '--fuse-duration': `${undoWindow}ms` } as CSSProperties}
      onClick={() => {
        if (phase === 'armed') undo()
        else if (phase === 'idle' && !busy.current) {
          if (commitOn === 'fuseEnd' && !callbacks.current.beforeArm) {
            setError(''); setPhase('armed'); return
          }
          void perform(async () => {
            if (await callbacks.current.beforeArm?.() === false) return false
            if (commitOn === 'press') await callbacks.current.onCommit()
          }, 'armed')
        }
      }}
      onKeyDown={event => { if (event.key === 'Escape' && phase === 'armed') { event.preventDefault(); event.stopPropagation(); undo() } }}>
      <Icon size={18} aria-hidden="true" />{text}
      {phase === 'armed' && <svg className="rb-fuse-rim" aria-hidden="true"><rect pathLength="1" /></svg>}
    </button>
    <span className="sr-only" role="status">{phase === 'armed' ? `${commitOn === 'fuseEnd' ? 'Menunggu konfirmasi' : doneLabel}. Bisa dibatalkan dalam ${undoWindow / 1000} detik.` : phase === 'settled' ? doneLabel : ''}</span>
    {error && <InlineError>{error}</InlineError>}
  </div>
}
