import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { StoreProvider } from './lib/store'
import { setupServiceWorker } from './lib/sw'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>,
)

// Startansicht ausblenden, sobald React gerendert hat
window.requestAnimationFrame(() => {
  const s = document.getElementById('splash')
  if (s) {
    s.style.transition = 'opacity 0.2s ease'
    s.style.opacity = '0'
    window.setTimeout(() => s.remove(), 220)
  }
})

if (import.meta.env.PROD) setupServiceWorker()
