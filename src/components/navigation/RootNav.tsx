// Root navigation contract: docs/03-ux-interaction.md §Navbar (D35, D42, D44).
// Bottom nav <768px, sidebar ≥768px: dua-duanya tidak pernah di-render bersamaan (D44).
import { NavLink } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { BarChart3, Home, PiggyBank, Plus, Settings } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { REDUCED_MOTION_QUERY, useMediaQuery } from './useMediaQuery'
import '@/app/shell.css'

const ITEMS = [
  { to: ROUTES.home, label: 'Home', icon: Home },
  { to: ROUTES.history, label: 'Riwayat', icon: BarChart3 },
  { to: ROUTES.savings, label: 'Tabungan', icon: PiggyBank },
  { to: ROUTES.settings, label: 'Atur', icon: Settings },
] as const

export function AddButton({ className = '', onClick }: { className?: string; onClick: () => void }) {
  const timer = useRef(0), longPress = useRef(false), origin = useRef({ x: 0, y: 0 })
  const cancel = () => window.clearTimeout(timer.current)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return <button type="button" className={`nav-add ${className}`} aria-label="Tambah transaksi"
    title="Tambah transaksi · tahan untuk voice" onPointerDown={event => {
      if (event.button !== 0) return
      longPress.current = false; origin.current = { x: event.clientX, y: event.clientY }
      timer.current = window.setTimeout(() => { longPress.current = true; window.dispatchEvent(new Event('monee:voice')) }, 550)
    }} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
    onPointerMove={event => { if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancel() }}
    onContextMenu={event => { event.preventDefault() }}
    onClick={event => { cancel(); if (!longPress.current || event.detail === 0) onClick(); longPress.current = false }}>
    <Plus size={24} aria-hidden="true" /><span className="nav-add-label">Catat</span>
  </button>
}

function NavLinkItem({ to, label, icon: Icon, baseClass, activeClass }: { to: string; label: string; icon: typeof Home; baseClass: string; activeClass: string }) {
  // framer's hook captures the preference only at mount; read the live query too.
  const motionHookReduce = useReducedMotion()
  const mediaReduce = useMediaQuery(REDUCED_MOTION_QUERY)
  const reduce = motionHookReduce || mediaReduce
  return <NavLink to={to} className={({ isActive }) => `${baseClass}${isActive ? ` ${activeClass}` : ''}`}>
    {({ isActive }) => <>
      {isActive && <motion.span className="nav-active-pill" {...(reduce ? {} : { layoutId: "root-active-pill" })} aria-hidden="true"
        initial={reduce ? { opacity: 0 } : false} animate={reduce ? { opacity: 1 } : { scaleX: [1, 1.08, 1], scaleY: [1, 0.92, 1] }}
        transition={reduce ? { duration: 0.12 } : { layout: { duration: reduce ? 0.12 : 0.26, ease: [0.34, 1.56, 0.64, 1] }, scaleX: { duration: reduce ? 0 : 0.26 }, scaleY: { duration: reduce ? 0 : 0.26 } }} />}
      <motion.span className="nav-icon" animate={{ scale: isActive && !reduce ? [1, 1.25, 1] : 1 }} transition={{ duration: reduce ? 0 : 0.28 }}><Icon size={22} aria-hidden="true" /></motion.span>
      <span className="nav-label">{label}</span>
    </>}
  </NavLink>
}

export function BottomNav({ onAddTransaction }: { onAddTransaction: () => void }) {
  return <LayoutGroup id="bottom-root-nav"><nav className="bottom-nav" aria-label="Navigasi utama">
    <NavItemPair slice={[0, 2]} baseClass="nav-item" activeClass="nav-item--active" />
    <AddButton className="bottom-nav-add" onClick={onAddTransaction} />
    <NavItemPair slice={[2, 4]} baseClass="nav-item" activeClass="nav-item--active" />
  </nav></LayoutGroup>
}

function NavItemPair({ slice, baseClass, activeClass }: { slice: readonly [number, number]; baseClass: string; activeClass: string }) {
  return <> {ITEMS.slice(slice[0], slice[1]).map(item =>
    <NavLinkItem key={item.to} to={item.to} label={item.label} icon={item.icon} baseClass={baseClass} activeClass={activeClass} />)}
  </>
}

export function Sidebar({ onAddTransaction }: { onAddTransaction: () => void }) {
  return <LayoutGroup id="sidebar-root-nav"><nav className="sidebar" aria-label="Navigasi utama">
    <div className="sidebar-brand" aria-hidden="true"><span className="sidebar-logo" /><span className="sidebar-wordmark">Monee</span></div>
    <div className="sidebar-tabs">
      {ITEMS.map(item => <NavLinkItem key={item.to} to={item.to} label={item.label} icon={item.icon} baseClass="sidebar-item" activeClass="sidebar-item--active" />)}
    </div>
    <AddButton className="sidebar-add" onClick={onAddTransaction} />
  </nav></LayoutGroup>
}

export function RootNav({ onAddTransaction }: { onAddTransaction: () => void }) {
  return useMediaQuery('(min-width: 768px)')
    ? <Sidebar onAddTransaction={onAddTransaction} />
    : <BottomNav onAddTransaction={onAddTransaction} />
}
