import { useEffect, useState } from 'react'
import type { InvitePreview } from '../lib/types'
import { useStore } from '../lib/store'
import { getRemember, setRemember } from '../lib/supabase'
import { getPendingInvite, clearPendingInvite } from '../lib/invites'
import { AppIcon } from '../components/AppIcon'

type Mode = 'login' | 'register' | 'forgot'

export function LoginPage() {
  const { signIn, signUp, resetPassword, invitePreview } = useStore()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [name, setName] = useState('')
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

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
    setInfo(null)
  }

  const submit = async () => {
    if (busy) return
    setError(null)
    setInfo(null)
    if (!email.trim()) return setError('Bitte deine E-Mail-Adresse eingeben.')
    if (mode === 'forgot') {
      setBusy(true)
      const err = await resetPassword(email)
      setBusy(false)
      if (err) setError(err)
      else setInfo('Wenn die Adresse bekannt ist, haben wir dir eine E-Mail geschickt. Öffne den Link darin, um ein neues Passwort zu setzen.')
      return
    }
    if (!password) return setError('Bitte dein Passwort eingeben.')
    if (mode === 'register') {
      if (!name.trim()) return setError('Bitte einen Anzeigenamen eingeben (z. B. Oma).')
      if (password.length < 6) return setError('Das Passwort braucht mindestens 6 Zeichen.')
      if (password !== password2) return setError('Die Passwörter stimmen nicht überein.')
    }
    setBusy(true)
    setRemember(remember)
    if (mode === 'login') {
      const err = await signIn(email, password)
      if (err) setError(err)
    } else {
      const r = await signUp(email, password, name)
      if (r.error) setError(r.error)
      else if (r.needsConfirm) setInfo('Fast geschafft: Bitte den Bestätigungslink in deiner E-Mail öffnen und danach hier anmelden. Die Einladung bleibt gemerkt.')
    }
    setBusy(false)
  }

  const title = mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Passwort vergessen'

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src="/icons/icon-192.png" alt="" />
        <h1 className="center" style={{ fontSize: 26 }}>Familien-Liste</h1>
        <p className="subtitle center" style={{ marginBottom: 18 }}>
          {title}
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
                  <div className="muted small">Du bist eingeladen als {invite.invited_role === 'admin' ? 'Elternteil' : 'Mitglied'}. Erstelle ein Konto oder melde dich an, um beizutreten.</div>
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

        <div className="field">
          <label htmlFor="email">E-Mail</label>
          <input id="email" className="input" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" placeholder="deine@email.de" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'forgot') submit() }} />
        </div>

        {mode === 'register' && (
          <div className="field">
            <label htmlFor="name">Anzeigename</label>
            <input id="name" className="input" placeholder="z. B. Oma" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="nickname" />
          </div>
        )}

        {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="pw">Passwort</label>
            <input id="pw" className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'login') submit() }} />
          </div>
        )}

        {mode === 'register' && (
          <div className="field">
            <label htmlFor="pw2">Passwort bestätigen</label>
            <input id="pw2" className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          </div>
        )}

        {mode === 'login' && (
          <button className="remember-row" onClick={() => setRememberState(!remember)} role="checkbox" aria-checked={remember}>
            <span className={`checkbox ${remember ? 'on' : ''}`} aria-hidden="true">
              {remember ? '✓' : ''}
            </span>
            <span>
              <span style={{ fontWeight: 600 }}>Angemeldet bleiben</span>
              <span className="muted small" style={{ display: 'block' }}>Auf diesem Gerät nicht mehr nachfragen</span>
            </span>
          </button>
        )}

        {error && <div className="error">{error}</div>}
        {info && <div className="notice">{info}</div>}

        <button className="btn block" onClick={submit} disabled={busy}>
          {busy ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : mode === 'register' ? (invite?.valid ? 'Konto erstellen und beitreten' : 'Konto erstellen') : 'Reset-Mail senden'}
        </button>

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <button className="link-btn" onClick={() => switchMode('forgot')}>
                Passwort vergessen
              </button>
              <button className="link-btn" onClick={() => switchMode('register')}>
                Konto erstellen
              </button>
            </>
          )}
          {mode !== 'login' && (
            <button className="link-btn" onClick={() => switchMode('login')}>
              Zurück zur Anmeldung
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
