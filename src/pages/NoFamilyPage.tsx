import { useEffect, useState } from 'react'
import type { InvitePreview } from '../lib/types'
import { useStore } from '../lib/store'
import { getPendingInvite, clearPendingInvite } from '../lib/invites'

/** Angemeldet, aber noch keiner Familie zugeordnet */
export function NoFamilyPage() {
  const { acceptInvite, createFamily, invitePreview, inviteError, signOut, session } = useStore()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [name, setName] = useState('')
  const [famName, setFamName] = useState('Unsere Familie')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(inviteError)
  const [showCreate, setShowCreate] = useState(false)
  const token = getPendingInvite()

  useEffect(() => {
    if (token) invitePreview(token).then(setPreview)
  }, [token, invitePreview])

  const join = async () => {
    if (!token) return
    setBusy(true)
    const err = await acceptInvite(token, name)
    setBusy(false)
    if (err) setError(err)
  }

  const create = async () => {
    setBusy(true)
    const err = await createFamily(famName, name)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src="/icons/icon-192.png" alt="" />
        {token && preview?.valid ? (
          <>
            <h2 className="center">Willkommen bei {preview.family_name}</h2>
            <p className="muted center" style={{ margin: '4px 0 16px' }}>
              Du trittst als {preview.invited_role === 'admin' ? 'Elternteil' : 'Mitglied'} bei. Wie sollen dich die anderen sehen?
            </p>
            <div className="field">
              <label htmlFor="dn">Dein Name</label>
              <input id="dn" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Oma" maxLength={30} />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn block" onClick={join} disabled={busy}>
              {busy ? 'Bitte warten…' : 'Einladung annehmen'}
            </button>
          </>
        ) : (
          <>
            <h2 className="center">Noch keine Familie</h2>
            <p className="muted center" style={{ margin: '4px 0 16px' }}>
              {token && preview && !preview.valid
                ? `${preview.reason}. Bitte um einen neuen Einladungslink oder gründe eine eigene Familie.`
                : 'Dein Konto ist noch keiner Familie zugeordnet. Öffne den Einladungslink von Mama oder Papa – oder gründe eine neue Familie.'}
            </p>
            {token && preview && !preview.valid && (
              <button className="btn secondary block" style={{ marginBottom: 10 }} onClick={() => { clearPendingInvite(); setPreview(null) }}>
                Einladung verwerfen
              </button>
            )}
            {!showCreate ? (
              <button className="btn block" onClick={() => setShowCreate(true)}>
                Neue Familie gründen
              </button>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="fn">Name der Familie</label>
                  <input id="fn" className="input" value={famName} onChange={(e) => setFamName(e.target.value)} maxLength={40} />
                </div>
                <div className="field">
                  <label htmlFor="dn2">Dein Name</label>
                  <input id="dn2" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Papa" maxLength={30} />
                </div>
                {error && <div className="error">{error}</div>}
                <button className="btn block" onClick={create} disabled={busy}>
                  {busy ? 'Bitte warten…' : 'Familie gründen (ich bin Admin)'}
                </button>
              </>
            )}
          </>
        )}
        <p className="muted small center" style={{ marginTop: 14 }}>Angemeldet als {session?.user.email ?? ''}</p>
        <button className="btn ghost block" onClick={signOut}>
          Abmelden
        </button>
      </div>
    </div>
  )
}
