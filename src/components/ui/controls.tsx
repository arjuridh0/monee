import { useId, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes } from 'react'
import { LoaderCircle } from 'lucide-react'
import { formatPercent } from '@/core/finance/percent'
import { InlineError } from './feedback'
import './ui.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}

export function Button({ variant = 'primary', loading = false, disabled, type = 'button', className = '', children, onClick, ...props }: ButtonProps) {
  const [fusePulse, setFusePulse] = useState(0)
  return <button {...props} type={type} className={`ui-button ui-button--${variant} ${className}`}
    disabled={disabled || loading} aria-busy={loading || undefined}
    data-fuse-pulse={fusePulse || undefined}
    onClick={event => { setFusePulse(value => value + 1); onClick?.(event) }}>
    {loading && <LoaderCircle className="ui-spin" size={18} aria-hidden="true" />}
    <span className="ui-button__content">{children}</span>
    {fusePulse > 0 && <svg key={fusePulse} className="ui-button__fuse" aria-hidden="true" viewBox="0 0 100 48" preserveAspectRatio="none">
      <rect x="1" y="1" width="98" height="46" rx="9" pathLength="1" />
    </svg>}
  </button>
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-card ${className}`} />
}

export function Chip({ selected = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return <button {...props} type="button" aria-pressed={selected} className={`ui-chip ${className}`} />
}

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  disabled?: boolean
}

export function Toggle({ label, checked, onChange, hint, disabled }: ToggleProps) {
  const id = useId()
  return <button type="button" role="switch" aria-checked={checked} aria-labelledby={id}
    aria-describedby={hint ? `${id}-hint` : undefined} disabled={disabled}
    className="ui-toggle" onClick={() => onChange(!checked)}>
    <span className="ui-toggle-copy"><span id={id}>{label}</span>
      {hint && <span id={`${id}-hint`} className="ui-helper">{hint}</span>}</span>
    <span className="ui-toggle-hit" aria-hidden="true"><span className="ui-toggle-track"><span /></span></span>
  </button>
}

export function ProgressBar({ label, value }: { label: string; value: number }) {
  const actual = Number.isFinite(value) ? Math.max(0, value) : 0
  const percent = Math.min(100, actual)
  const state = actual >= 100 ? 'danger' : actual >= 90 ? 'warning' : actual >= 75 ? 'aware' : 'normal'
  return <div className={`ui-progress ui-progress--${state}`} role="progressbar" aria-label={label}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    aria-valuetext={`${formatPercent(actual)}%${actual > 100 ? ' · lewat jatah' : ''}`}>
    <span style={{ transform: `scaleX(${percent / 100})` }} />
  </div>
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
}

export function TextField({ label, hint, error, id, className = '', ...props }: TextFieldProps) {
  const generated = useId()
  const fieldId = id ?? generated
  const description = error || hint
  return <div className={`ui-field ${className}`}>
    <label htmlFor={fieldId}>{label}</label>
    <input {...props} data-autofocus={props.autoFocus || undefined} id={fieldId} aria-invalid={Boolean(error)}
      aria-describedby={description ? `${fieldId}-help` : undefined} />
    <div className="ui-field-feedback">
      {error ? <InlineError id={`${fieldId}-help`}>{error}</InlineError>
        : hint && <p className="ui-helper" id={`${fieldId}-help`}>{hint}</p>}
    </div>
  </div>
}
