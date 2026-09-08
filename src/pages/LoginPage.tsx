import { useEffect, useState } from 'react'
import type { InvitePreview } from '../lib/types'
import { useStore } from '../lib/store'
import { getRemember, setRemember } from '../lib/supabase'
import { getPendingInvite, clearPendingInvite } from '../lib/invites'
import { AppIcon } from '../components/AppIcon'

export function LoginPage() {
  const { signIn, signUp, invitePreview } = useStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [remember, setRememberState] = useState(getRemember())
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const token = getPendingInvite()

  useEffect(() => {
    if (!token) return
    invitePreview(token).then((p) => {
      setInvite(p)
      if (p.valid) setMode('register')
    })
  }, [token, invitePreview])

  const submit = async () => {
    if (busy) return
    if (!email.trim() || !password) {
      setError('Bitte E-Mail und Passwort eingeben.')
      return
    }
    if (mode === 'register') {
      if (password.length < 6) {
        setError('Das Passwort braucht mindestens 6 Zeichen.')
        return
      }
      if (password !== password2) {
        setError('Die Passwörter stimmen nicht überein.')
        return
      }
    }
    setBusy(true)
    setError(null)
    setInfo(null)
    setRemember(remember)
    if (mode === 'login') {
      const err = await signIn(email, password)
      if (err) setError(err)
    } else {
      const r = await signUp(email, password)
      if (r.error) setError(r.error)
      else if (r.needsConfirm) setInfo('Fast geschafft: Bitte den Bestätigungslink in deiner E-Mail öffnen und danach hier anmelden. Die Einladung bleibt gemerkt.')
    }
    setBusy(false)
  }

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src="/icons/icon-192.png" alt="" />
        <h1 className="center">Familien-Liste</h1>
        <p className="subtitle center" style={{ marginBottom: 18 }}>
          Gemeinsam mehr schaffen ♡
        </p>

        {invite && (
          <div className={invite.valid ? 'invite-box' : 'error'} style={{ marginBottom: 16 }}>
            {invite.valid ? (
              <>
                <div className="invite-icon">
                  <AppIcon name="family" size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>Willkommen bei {invite.family_name}</div>
                  <div className="muted small">
                    Du bist eingeladen als {invite.invited_role === 'admin' ? 'Elternteil' : 'Mitglied'}. Registriere dich oder melde dich an, um beizutreten.
                  </div>
                </div>
              </>
            ) : (
              <span>
                {invite.reason ?? 'Einladung ungültig'}.{' '}
                <button className="link-btn" style={{ display: 'inline', padding: 0, minHeight: 0 }} onClick={() => { clearPendingInvite(); setInvite(null) }}>
                  Ausblenden
                </button>
              </span>
            )}
          </div>
        )}

        <div className="chips wrap" style={{ marginBottom: 14 }}>
          <button className={`chip ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
            Anmelden
          </button>
          <button className={`chip ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
            Registrieren
          </button>
        </div>

        <div className="field">
          <label htmlFor="email">E-Mail</label>
          <input id="email" className="input" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" placeholder={mode === 'login' ? 'z. B. papa@familie.local' : 'deine@email.de'} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Passwort</label>
          <input id="pw" className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'login') submit() }} />
        </div>
        {mode === 'register' && (
          <div className="field">
            <label htmlFor="pw2">Passwort wiederholen</label>
            <input id="pw2" className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          </div>
        )}
        <button className="remember-row" onClick={() => setRememberState(!remember)} role="checkbox" aria-checked={remember}>
          <span className={`checkbox ${remember ? 'on' : ''}`} aria-hidden="true">
            {remember ? '✓' : ''}
          </span>
          <span>
            <span style={{ fontWeight: 600 }}>Angemeldet bleiben</span>
            <span className="muted small" style={{ display: 'block' }}>Auf diesem Gerät nicht mehr nachfragen</span>
          </span>
        </button>
        {error && <div className="error">{error}</div>}
        {info && <div className="notice">{info}</div>}
        <button className="btn block" onClick={submit} disabled={busy}>
          {busy ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : invite?.valid ? 'Registrieren und beitreten' : 'Registrieren'}
        </button>
        <p className="muted small center" style={{ marginTop: 16 }}>
          {mode === 'login' ? 'Neu hier? Dazu brauchst du einen Einladungslink von Mama oder Papa.' : 'Ohne Einladung entsteht eine neue, eigene Familie.'}
        </p>
      </div>
    </div>
  )
}
