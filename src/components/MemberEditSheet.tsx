import { useState } from 'react'
import type { Profile, Role } from '../lib/types'
import { useStore } from '../lib/store'
import { EMOJI_AVATARS, IMAGE_AVATARS } from '../lib/constants'
import { Avatar } from './Avatar'
import { IconX } from './Icons'

export function AvatarPicker({ value, onPick }: { value: string; onPick: (a: string) => void }) {
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

export function MemberEditSheet({ member, onClose }: { member: Profile; onClose: () => void }) {
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
