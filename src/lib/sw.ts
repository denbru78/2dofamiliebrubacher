/* Registrierung des Service Workers + Update-Erkennung ("Neue Version verfügbar") */
type Listener = (hasUpdate: boolean) => void
const listeners = new Set<Listener>()
let waiting: ServiceWorker | null = null
let reloading = false

export function onUpdate(fn: Listener): () => void {
  listeners.add(fn)
  fn(!!waiting)
  return () => listeners.delete(fn)
}

export function applyUpdate(): void {
  if (!waiting) {
    window.location.reload()
    return
  }
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

export function setupServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = reg.waiting ?? sw
            listeners.forEach((l) => l(true))
          }
        })
      }
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting
        listeners.forEach((l) => l(true))
      }
      track(reg.installing)
      reg.addEventListener('updatefound', () => track(reg.installing))
      // Beim Zurückkehren in die App nach Updates suchen
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => null)
      })
      window.setInterval(() => reg.update().catch(() => null), 60 * 60 * 1000)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return
        reloading = true
        window.location.reload()
      })
    } catch {
      /* Service Worker ist optional */
    }
  })
}
