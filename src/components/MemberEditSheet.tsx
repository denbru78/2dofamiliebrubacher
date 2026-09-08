import { useState } from 'react'
import type { Profile, Role } from '../lib/types'
import { useStore } from '../lib/store'
import { IMAGE_AVATARS } from '../lib/constants'
import { MEMBER_COLORS, memberColorKey } from '../lib/colors'
import type { MemberColor } from '../lib/colors'
import { Avatar } from './Avatar'
import { IconX } from './Icons'

export function AvatarPicker({ value, onPick, name, color }: { value: string; onPick: (a: string) => void; name?: string; color?: string | null }) {
  return (
    <div className="chips wrap">
      {IMAGE_AVATARS.map((a) => (
        <button key={a} className={`chip ${value === a ? 'active sage' : ''}`} onClick={() => onPick(a)} aria-label="Avatar wählen">
          <Avatar avatar={a} size="md" />
        </button>
      ))}
      <button className={`chip ${value === '' ? 'active sage' : ''}`} onClick={() => onPick('')} aria-label="Initialen">
        <Avatar avatar="" name={name ?? ''} color={color} size="md" /> Initialen
      </button>
    </div>
  )
}

export function ColorPicker({ value, onPick }: { value: MemberColor; onPick: (c: MemberColor) => void }) {
  return (
    <div className="chips wrap">
      {MEMBER_COLORS.map((c) => (
        <button key={c.key} className={`chip color-chip ${value === c.key ? 'active' : ''}`} onClick={() => onPick(c.key)} aria-label={c.label} style={{ background: c.bg, color: c.ink, borderColor: value === c.key ? c.ink : c.bg }}>
          <span className="dot" style={{ background: c.dot }} /> {c.label}
        </button>
      ))}
    </div>
  )
}

export function MemberEditSheet({ member, onClose }: { member: Profile; onClose: () => void }) {
  const { profile, updateMemberProfile, toast } = useStore()
  const [name, setName] = useState(member.display_name)
  const [avatar, setAvatar] = useState(member.avatar)
  const [color, setColor] = useState<MemberColor>(memberColorKey(member))
  const [role, setRole] = useState<Role>(member.role)
  const [active, setActive] = useState<boolean>(member.active !== false)
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
    const err = await updateMemberProfile(member.id, { display_name: name.trim(), avatar, role, active, color })
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
          <AvatarPicker value={avatar} onPick={setAvatar} name={name} color={color} />
        </div>
        <div className="field">
          <span className="label">Farbe</span>
          <ColorPicker value={color} onPick={setColor} />
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
        {!isSelf && (
          <div className="toggle-row" style={{ marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Aktiv</div>
              <div className="muted small">Deaktivierte Mitglieder können sich nicht mehr anmelden und werden ausgeblendet.</div>
            </div>
            <button className={`switch ${active ? 'on' : ''}`} onClick={() => setActive(!active)} role="switch" aria-checked={active} aria-label="Aktiv" />
          </div>
        )}
        {error && <div className="error">{error}</div>}
        <button className="btn block" onClick={save} disabled={busy}>
          {busy ? 'Speichern…' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
