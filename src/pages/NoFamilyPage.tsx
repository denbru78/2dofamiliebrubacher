import { useEffect, useState } from 'react'
import type { InvitePreview } from '../lib/types'
import { useStore } from '../lib/store'
import { getPendingInvite, clearPendingInvite } from '../lib/invites'
import { AppIcon } from '../components/AppIcon'

type Step = 'choose' | 'create' | 'join'

function extractToken(input: string): string {
  const s = input.trim()
  try {
    const u = new URL(s)
    return u.searchParams.get('invite') ?? (u.hash.startsWith('#invite=') ? u.hash.slice(8) : s)
  } catch {
    return s.replace(/^.*invite=/, '')
  }
}

/** Erster Start: angemeldet, aber noch keiner Familie zugeordnet */
export function NoFamilyPage() {
  const { acceptInvite, createFamily, invitePreview, inviteError, signOut, session } = useStore()
  const metaName = ((session?.user as { user_metadata?: { display_name?: string } } | undefined)?.user_metadata?.display_name ?? '').trim()
  const pending = getPendingInvite()
  const [step, setStep] = useState<Step>(pending ? 'join' : 'choose')
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [tokenInput, setTokenInput] = useState(pending ?? '')
  const [name, setName] = useState(metaName)
  const [famName, setFamName] = useState('Unser Plan')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(inviteError)
  const token = extractToken(tokenInput)

  useEffect(() => {
    if (step === 'join' && token.length > 10) invitePreview(token).then(setPreview)
    else setPreview(null)
  }, [step, token, invitePreview])

  const join = async () => {
    if (!token) return
    setBusy(true)
    setError(null)
    const err = await acceptInvite(token, name)
    setBusy(false)
    if (err) setError(err)
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    const err = await createFamily(famName, name)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src="/icons/icon-192.png" alt="" />

        {step === 'choose' && (
          <>
            <h2 className="center">Willkommen bei Unser Plan</h2>
            <p className="muted center" style={{ margin: '4px 0 18px' }}>
              {metaName ? `Hallo ${metaName}! ` : ''}Dein Konto ist noch keiner Familie zugeordnet. Wie möchtest du starten?
            </p>
            <button className="option-card" onClick={() => setStep('create')}>
              <span className="invite-icon">
                <AppIcon name="home" size={20} />
              </span>
              <span>
                <span style={{ fontWeight: 700, display: 'block' }}>Familie erstellen</span>
                <span className="muted small">Du wirst Elternteil (Admin) und lädst die anderen ein.</span>
              </span>
            </button>
            <button className="option-card" onClick={() => setStep('join')}>
              <span className="invite-icon">
                <AppIcon name="family" size={20} />
              </span>
              <span>
                <span style={{ fontWeight: 700, display: 'block' }}>Einladung annehmen</span>
                <span className="muted small">Du hast einen Link oder Code von Mama oder Papa.</span>
              </span>
            </button>
          </>
        )}

        {step === 'create' && (
          <>
            <h2 className="center">Familie erstellen</h2>
            <p className="muted center" style={{ margin: '4px 0 16px' }}>Du bekommst Standardkategorien und ein Wochenziel von 10 Aufgaben – beides lässt sich später ändern.</p>
            <div className="field">
              <label htmlFor="fn">Name der Familie</label>
              <input id="fn" className="input" value={famName} onChange={(e) => setFamName(e.target.value)} maxLength={40} />
            </div>
            <div className="field">
              <label htmlFor="dn">Dein Anzeigename</label>
              <input id="dn" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Papa" maxLength={30} />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn block" onClick={create} disabled={busy || !famName.trim()}>
              {busy ? 'Bitte warten…' : 'Familie erstellen'}
            </button>
            <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => { setStep('choose'); setError(null) }}>
              Zurück
            </button>
          </>
        )}

        {step === 'join' && (
          <>
            <h2 className="center">{preview?.valid ? `Willkommen bei ${preview.family_name}` : 'Einladung annehmen'}</h2>
            {preview?.valid ? (
              <p className="muted center" style={{ margin: '4px 0 16px' }}>Du trittst als {preview.invited_role === 'admin' ? 'Elternteil' : 'Mitglied'} bei.</p>
            ) : (
              <p className="muted center" style={{ margin: '4px 0 16px' }}>Füge den Einladungslink oder den Code aus WhatsApp ein.</p>
            )}
            {!pending && (
              <div className="field">
                <label htmlFor="tk">Einladungslink oder Code</label>
                <input id="tk" className="input" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="https://… oder Code" autoCapitalize="none" autoComplete="off" />
              </div>
            )}
            {preview && !preview.valid && token.length > 10 && <div className="error">{preview.reason ?? 'Einladung ungültig'}.</div>}
            <div className="field">
              <label htmlFor="dn2">Dein Anzeigename</label>
              <input id="dn2" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Oma" maxLength={30} />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn block" onClick={join} disabled={busy || !preview?.valid}>
              {busy ? 'Bitte warten…' : 'Einladung annehmen'}
            </button>
            <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => { clearPendingInvite(); setTokenInput(''); setPreview(null); setStep('choose'); setError(null) }}>
              Zurück
            </button>
          </>
        )}

        <p className="muted small center" style={{ marginTop: 14 }}>Angemeldet als {session?.user.email ?? ''}</p>
        <button className="link-btn" style={{ width: '100%', justifyContent: 'center', display: 'flex' }} onClick={signOut}>
          Abmelden
        </button>
      </div>
    </div>
  )
}
