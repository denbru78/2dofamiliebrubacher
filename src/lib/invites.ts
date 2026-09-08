const KEY = 'familie.pendingInvite'

/** Einladungs-Token aus der URL lesen (?invite=… oder #invite=…) und merken */
export function captureInviteFromUrl(): string | null {
  try {
    const url = new URL(window.location.href)
    const t = url.searchParams.get('invite') ?? (url.hash.startsWith('#invite=') ? url.hash.slice(8) : null)
    if (t) {
      localStorage.setItem(KEY, t)
      url.searchParams.delete('invite')
      url.hash = ''
      window.history.replaceState({}, '', url.pathname + (url.search || ''))
      return t
    }
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY)
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

export function inviteUrl(token: string): string {
  return `${window.location.origin}/?invite=${encodeURIComponent(token)}`
}

export function inviteText(familyName: string, token: string): string {
  return `Du wurdest zu unserer Familien-App „${familyName}“ eingeladen. Öffne den Link und tritt unserer Familie bei:\n${inviteUrl(token)}`
}
