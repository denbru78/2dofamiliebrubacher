import { useState } from 'react'
import { useStore } from '../lib/store'
import { getRemember, setRemember } from '../lib/supabase'

export function LoginPage() {
  const { signIn } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remember, setRememberState] = useState(getRemember())

  const submit = async () => {
    if (busy) return
    if (!email.trim() || !password) {
      setError('Bitte E-Mail und Passwort eingeben.')
      return
    }
    setBusy(true)
    setError(null)
    setRemember(remember)
    const err = await signIn(email, password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src="/icons/icon-192.png" alt="" />
        <h1 className="center">Familien-Liste</h1>
        <p className="subtitle center" style={{ marginBottom: 22 }}>
          Gemeinsam mehr schaffen ♡
        </p>
        <div className="field">
          <label htmlFor="email">E-Mail</label>
          <input
            id="email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            placeholder="z. B. papa@familie.local"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pw">Passwort</label>
          <input
            id="pw"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </div>
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
        <button className="btn block" onClick={submit} disabled={busy}>
          {busy ? 'Anmelden…' : 'Anmelden'}
        </button>
        <p className="muted small center" style={{ marginTop: 16 }}>
          Die Zugangsdaten legen Mama oder Papa an.
        </p>
      </div>
    </div>
  )
}
