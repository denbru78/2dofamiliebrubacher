import { useEffect, useState } from 'react'
import type { Profile, Role } from '../lib/types'
import { useStore } from '../lib/store'
import { EMOJI_AVATARS, IMAGE_AVATARS } from '../lib/constants'
import { Avatar } from '../components/Avatar'
import { IconEdit, IconX } from '../components/Icons'
import { formatDateTime } from '../lib/dates'

function AvatarPicker({ value, onPick }: { value: string; onPick: (a: string) => void }) {
  return (
    <div className="chips wrap">
      {IMAGE_AVATARS.map((a) => (
        <button key={a} className={`chip ${value === a ? 'active sage' : ''}`} onClick={() => onPick(a)} aria-label="Avatar wählen">
          <Avatar avatar={a} size="md" />
        </button>
      ))}
      {EMOJI_AVATARS.map((e) => (
        <button key={e} className={`chip ${value === e ? 'active sage' : ''}`} onClick={() => onPick(e)} aria-label={`Avatar ${e}`}>
          <span style={{ fontSize: 22 }}>{e}</span>
        </button>
      ))}
    </div>
  )
}

function MemberEditSheet({ member, onClose }: { member: Profile; onClose: () => void }) {
  const { profile, updateMemberProfile, toast } = useStore()
  const [name, setName] = useState(member.display_name)
  const [avatar, setAvatar] = useState(member.avatar)
  const [role, setRole] = useState<Role>(member.role)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSelf = profile?.id === member.id

  const save = async () => {
    if (!name.trim()) {
      setError('Bitte einen Namen eingeben.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await updateMemberProfile(member.id, { display_name: name.trim(), avatar, role })
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    toast(`${name.trim()} gespeichert`, 'info')
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Mitglied bearbeiten" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2>{member.display_name} bearbeiten</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <IconX />
          </button>
        </div>
        <div className="field">
          <label htmlFor="mname">Name</label>
          <input id="mname" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
        </div>
        <div className="field">
          <span className="label">Avatar</span>
          <AvatarPicker value={avatar} onPick={setAvatar} />
        </div>
        <div className="field">
          <span className="label">Rolle</span>
          <div className="chips wrap">
            <button className={`chip ${role === 'admin' ? 'active' : ''}`} onClick={() => setRole('admin')} disabled={isSelf}>
              Elternteil (Admin)
            </button>
            <button className={`chip ${role === 'member' ? 'active' : ''}`} onClick={() => setRole('member')} disabled={isSelf}>
              Mitglied
            </button>
          </div>
          {isSelf && <div className="muted small" style={{ marginTop: 6 }}>Die eigene Rolle kann nicht geändert werden.</div>}
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn block" onClick={save} disabled={busy}>
          {busy ? 'Speichern…' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  created: 'hat angelegt',
  claimed: 'hat übernommen',
  released: 'hat zurück in den Pool gelegt',
  done: 'hat erledigt',
  reopened: 'hat wieder geöffnet',
  updated: 'hat bearbeitet',
  deleted: 'hat gelöscht',
  archived: 'hat archiviert',
}

export function ProfilePage() {
  const { profile, profiles, isAdmin, settings, activities, profileById, updateProfile, updateSettings, signOut, toast } = useStore()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [goal, setGoal] = useState(String(settings.weekly_goal))
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)

  useEffect(() => setName(profile?.display_name ?? ''), [profile?.display_name])
  useEffect(() => setGoal(String(settings.weekly_goal)), [settings.weekly_goal])

  if (!profile) return null

  const saveName = async () => {
    if (!name.trim() || name.trim() === profile.display_name) return
    setBusy(true)
    const err = await updateProfile({ display_name: name.trim() })
    setBusy(false)
    toast(err ?? 'Name gespeichert', err ? 'error' : 'info')
  }

  const pickAvatar = async (a: string) => {
    if (a === profile.avatar) return
    const err = await updateProfile({ avatar: a })
    if (err) toast(err, 'error')
  }

  const togglePrio = async () => {
    const err = await updateSettings({ priorities_enabled: !settings.priorities_enabled })
    if (err) toast(err, 'error')
  }

  const saveGoal = async () => {
    const n = Math.max(1, Math.min(200, Math.round(Number(goal) || 0)))
    if (n === settings.weekly_goal) return
    const err = await updateSettings({ weekly_goal: n })
    toast(err ?? `Wochenziel: ${n} Aufgaben`, err ? 'error' : 'info')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Profil</h1>
          <p className="subtitle">{isAdmin ? 'Elternteil (Admin)' : 'Familienmitglied'}</p>
        </div>
      </div>

      <div className="card center">
        <Avatar profile={profile} size="xl" />
        <div style={{ fontWeight: 800, fontSize: 20, marginTop: 8 }}>{profile.display_name}</div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 10 }}>Name</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
          <button className="btn" onClick={saveName} disabled={busy || !name.trim() || name.trim() === profile.display_name}>
            Speichern
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 10 }}>Avatar</h2>
        <AvatarPicker value={profile.avatar} onPick={pickAvatar} />
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 6 }}>Unsere Familie</h2>
        {isAdmin && <div className="muted small" style={{ marginBottom: 6 }}>Als Elternteil kannst du Name, Avatar und Rolle aller Mitglieder ändern.</div>}
        {profiles.map((p) => (
          <div key={p.id} className="history-row">
            <Avatar profile={p} size="md" />
            <span style={{ fontWeight: 600 }}>{p.display_name}</span>
            <span className="muted small" style={{ marginLeft: 'auto' }}>
              {p.role === 'admin' ? 'Admin' : 'Mitglied'}
            </span>
            {isAdmin && (
              <button className="icon-btn" onClick={() => setEditing(p)} aria-label={`${p.display_name} bearbeiten`}>
                <IconEdit />
              </button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="card">
          <h2 style={{ marginBottom: 6 }}>Einstellungen</h2>
          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>Prioritäten verwenden</div>
              <div className="muted small">Ausgeblendet, wenn deaktiviert. Daten bleiben erhalten.</div>
            </div>
            <button className={`switch ${settings.priorities_enabled ? 'on' : ''}`} onClick={togglePrio} role="switch" aria-checked={settings.priorities_enabled} aria-label="Prioritäten verwenden" />
          </div>
          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>Wochenziel</div>
              <div className="muted small">Aufgaben pro Woche für den Fortschrittsbalken</div>
            </div>
            <input
              className="input"
              style={{ width: 84, textAlign: 'center' }}
              inputMode="numeric"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onBlur={saveGoal}
              aria-label="Wochenziel"
            />
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 6 }}>Zuletzt passiert</h2>
        {activities.length === 0 ? (
          <div className="muted small">Noch keine Aktivität.</div>
        ) : (
          activities.slice(0, 25).map((a) => {
            const who = profileById(a.actor_id)
            return (
              <div key={a.id} className="history-row">
                {who && <Avatar profile={who} size="sm" />}
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <strong>{who?.display_name ?? 'Jemand'}</strong> {ACTION_LABEL[a.action] ?? a.action}: {a.task_title ?? ''}
                </span>
                <span className="muted small" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {formatDateTime(a.created_at)}
                </span>
              </div>
            )
          })
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 6 }}>App installieren</h2>
        <p className="muted small" style={{ margin: '0 0 10px' }}>
          iPhone: In Safari „Teilen“ → „Zum Home-Bildschirm“. Android: Menü → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.
        </p>
        <button className="btn secondary block" onClick={signOut}>
          Abmelden
        </button>
      </div>
      {editing && <MemberEditSheet member={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
