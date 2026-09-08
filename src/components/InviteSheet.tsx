import { useState } from 'react'
import type { Role } from '../lib/types'
import { useStore } from '../lib/store'
import { inviteText, inviteUrl } from '../lib/invites'
import { openWhatsApp } from '../lib/whatsapp'
import { formatDate } from '../lib/dates'
import { AppIcon } from './AppIcon'
import { IconX } from './Icons'

export function InviteSheet({ onClose }: { onClose: () => void }) {
  const { familyName, invites, createInvite, revokeInvite, profileById, toast } = useStore()
  const [role, setRole] = useState<Role>('member')
  const [label, setLabel] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = invites.filter((i) => !i.used_at && new Date(i.expires_at).getTime() > Date.now())

  const generate = async () => {
    setBusy(true)
    setError(null)
    const r = await createInvite(role, label.trim() || undefined)
    setBusy(false)
    if (r.error) setError(r.error)
    else setToken(r.token ?? null)
  }

  const copy = async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(inviteUrl(token))
      toast('Link kopiert', 'info')
    } catch {
      toast('Kopieren nicht möglich – bitte Link markieren', 'error')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Mitglied einladen" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2>Mitglied einladen</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <IconX />
          </button>
        </div>

        {!token ? (
          <>
            <div className="field">
              <span className="label">Rolle</span>
              <div className="chips wrap">
                <button className={`chip ${role === 'member' ? 'active' : ''}`} onClick={() => setRole('member')}>
                  Mitglied (Kind)
                </button>
                <button className={`chip ${role === 'admin' ? 'active' : ''}`} onClick={() => setRole('admin')}>
                  Elternteil (Admin)
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="ilabel">Für wen? (optional)</label>
              <input id="ilabel" className="input" placeholder="z. B. Oma" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} />
            </div>
            <div className="muted small" style={{ marginBottom: 12 }}>Der Link ist 7 Tage gültig und kann genau einmal verwendet werden.</div>
            {error && <div className="error">{error}</div>}
            <button className="btn block" onClick={generate} disabled={busy}>
              {busy ? 'Bitte warten…' : 'Einladungslink erstellen'}
            </button>
          </>
        ) : (
          <>
            <div className="invite-box" style={{ marginBottom: 14 }}>
              <div className="invite-icon">
                <AppIcon name="check" size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>Einladung bereit</div>
                <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{inviteUrl(token)}</div>
              </div>
            </div>
            <button className="btn block whatsapp" style={{ marginBottom: 10 }} onClick={() => openWhatsApp(null, inviteText(familyName, token))}>
              Per WhatsApp teilen
            </button>
            <button className="btn secondary block" style={{ marginBottom: 10 }} onClick={copy}>
              Link kopieren
            </button>
            <button className="btn ghost block" onClick={() => setToken(null)}>
              Weitere Einladung erstellen
            </button>
          </>
        )}

        {open.length > 0 && (
          <>
            <h2 style={{ fontSize: 16, margin: '18px 0 6px' }}>Offene Einladungen</h2>
            {open.map((i) => (
              <div key={i.id} className="history-row">
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{i.label || (i.invited_role === 'admin' ? 'Elternteil' : 'Mitglied')}</span>
                  <span className="muted small" style={{ display: 'block' }}>
                    {i.invited_role === 'admin' ? 'Elternteil' : 'Mitglied'} · gültig bis {formatDate(i.expires_at)}
                    {i.created_by ? ` · von ${profileById(i.created_by)?.display_name ?? ''}` : ''}
                  </span>
                </span>
                <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={async () => { const e = await revokeInvite(i.id); if (e) toast(e, 'error'); else toast('Einladung zurückgezogen', 'info') }}>
                  Zurückziehen
                </button>
              </div>
            ))}
            <div className="muted small" style={{ marginTop: 6 }}>Aus Sicherheitsgründen lässt sich ein einmal erstellter Link nicht erneut anzeigen – bei Bedarf einfach einen neuen erstellen.</div>
          </>
        )}
      </div>
    </div>
  )
}
