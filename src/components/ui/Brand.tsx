/** Shared artwork; the same symbol is exported to favicon and PWA assets. */
export function Brand({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return <span className={`monee-brand ${className}`} role="img" aria-label="Monee">
    <img src="/icons/monee.svg" width="32" height="32" alt="" />
    {!compact && <span>Monee</span>}
  </span>
}
