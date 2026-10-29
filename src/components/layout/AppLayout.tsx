import type { ReactNode } from 'react'
import './layout.css'

interface AppLayoutProps {
  children: ReactNode
  navigation?: ReactNode
  analytics?: ReactNode
}

export function AppLayout({ children, navigation, analytics }: AppLayoutProps) {
  return (
    <div className={`app-shell${navigation ? '' : ' app-shell--guest'}`}>
      <a className="skip-link" href="#main-content">Lewati ke konten</a>
      {navigation}
      <div className={`app-workspace${analytics ? '' : ' app-workspace--single'}`}>
        <main id="main-content" className="app-main" tabIndex={-1}>{children}</main>
        {analytics && <aside className="app-analytics" aria-label="Ringkasan tambahan">{analytics}</aside>}
      </div>
    </div>
  )
}
