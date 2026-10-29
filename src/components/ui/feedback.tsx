import { useEffect, type HTMLAttributes, type ReactNode } from 'react'
import { CircleAlert, Sprout, X } from 'lucide-react'
import './ui.css'

export function InlineError({ children, className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} role="alert" className={`ui-error ${className}`}>
    <CircleAlert size={16} aria-hidden="true" /><span>{children}</span>
  </p>
}

export function EmptyState({ title, message, action, illustration }: {
  title: string; message: string; action?: ReactNode; illustration?: ReactNode
}) {
  return <div className="ui-empty">
    <div className="ui-empty-art" aria-hidden="true">{illustration ?? <Sprout size={44} />}</div>
    <h2>{title}</h2><p>{message}</p>{action}
  </div>
}

export function Skeleton({ label = 'Memuat konten' }: { label?: string }) {
  return <div className="ui-skeleton" role="status" aria-label={label} aria-busy="true">
    <span /><span /><span />
  </div>
}

export function Toast({ message, onDismiss, duration = 3000 }: {
  message: string; onDismiss: () => void; duration?: number
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, duration)
    return () => window.clearTimeout(timer)
  }, [duration, onDismiss])

  return <div className="ui-toast" role="status" aria-live="polite">
    <span>{message}</span>
    <button type="button" aria-label="Tutup notifikasi" onClick={onDismiss}><X size={18} aria-hidden="true" /></button>
  </div>
}
