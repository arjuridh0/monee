import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import './ui.css'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

export function Dialog({ open, onClose, title, children, footer, sheet = false }: DialogProps & { sheet?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const dialog = ref.current
    dialog?.showModal()
    const initialFocus = dialog?.querySelector<HTMLElement>('[data-autofocus="true"], [autofocus]')
      ?? dialog?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)')
    initialFocus?.focus({ preventScroll: true })
    return () => dialog?.close()
  }, [open])

  return <dialog ref={ref} aria-labelledby={titleId} className={`ui-dialog${sheet ? ' ui-dialog--sheet' : ''}`}
    onCancel={event => { event.preventDefault(); onClose() }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      )).filter(node => !node.closest('[inert]'))
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="ui-dialog-panel">
      {sheet && <div className="ui-sheet-handle" aria-hidden="true" />}
      <header className="ui-dialog-header"><h2 id={titleId}>{title}</h2>
        <button type="button" className="ui-icon-button" aria-label={`Tutup ${title}`} onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="ui-dialog-body">{children}</div>
      {footer && <footer className="ui-dialog-footer">{footer}</footer>}
    </div>
  </dialog>
}

export function BottomSheet(props: DialogProps) {
  return <Dialog {...props} sheet />
}
