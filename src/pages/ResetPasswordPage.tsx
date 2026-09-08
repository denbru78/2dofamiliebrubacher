import { useState } from 'react'
import { useStore } from '../lib/store'

/** Wird angezeigt, wenn die App über den Link aus der Passwort-Reset-Mail geöffnet wurde */
export function ResetPasswordPage() {
  const { updatePassword, clearRecovery, toast } = useStore()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (pw.length < 6) return setError('Das Passwort braucht mindestens 6 Zeichen.')
    if (pw !== pw2) return setError('Die Passwörter stimmen nicht überein.')
    setBusy(true)
    setError(null)
    const err = await updatePassword(pw)
    setBusy(false)
    if (err) setError(err)
    else toast('Neues Passwort gespeichert', 'success')
  }

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src="/icons/icon-192.png" alt="" />
        <h2 className="center">Neues Passwort</h2>
        <p className="muted center" style={{ margin: '4px 0 16px' }}>Wähle ein neues Passwort für dein Konto.</p>
        <div className="field">
          <label htmlFor="npw">Neues Passwort</label>
          <input id="npw" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="npw2">Passwort bestätigen</label>
          <input id="npw2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn block" onClick={save} disabled={busy}>
          {busy ? 'Bitte warten…' : 'Passwort speichern'}
        </button>
        <button className="btn ghost block" onClick={clearRecovery} style={{ marginTop: 8 }}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
