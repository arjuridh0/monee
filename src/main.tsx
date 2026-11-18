import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@/theme/tokens.css'
import { AppShell } from '@/app/AppShell'
import '@/theme/refinement.css'
import { initializePwa } from '@/pwa/pwa-state'

initializePwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  </StrictMode>,
)
