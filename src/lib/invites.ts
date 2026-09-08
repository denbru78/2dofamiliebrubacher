const KEY = 'familie.pendingInvite'

/** Einladungs-Token aus der URL lesen (?invite=… oder #invite=…) und merken */
export function captureInviteFromUrl(): string | null {
  try {
    const url = new URL(window.location.href)
    const t = url.searchParams.get('invite') ?? (url.hash.startsWith('#invite=') ? url.hash.slice(8) : null)
    if (t) {
      localStorage.setItem(KEY, JSON.stringify({ t, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }))
      url.searchParams.delete('invite')
      url.hash = ''
      window.history.replaceState({}, '', url.pathname + (url.search || ''))
      return t
    }
    return getPendingInvite()
  } catch {
    return null
  }
}

export function getPendingInvite(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { t?: string; exp?: number }
    if (!v.t || (v.exp && v.exp < Date.now())) {
      localStorage.removeItem(KEY)
      return null
    }
    return v.t
  } catch {
    return null
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignorieren */
  }
}

/** Token im Hash-Teil: wird nicht an Server/Netlify-Logs übertragen */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/#invite=${encodeURIComponent(token)}`
}

export function inviteText(familyName: string, token: string): string {
  return `Du wurdest zu unserer Familien-App „${familyName}“ eingeladen. Öffne den Link und tritt unserer Familie bei:\n${inviteUrl(token)}`
}
