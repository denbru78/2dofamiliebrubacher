import type { Profile } from '../lib/types'
import { initials, memberColor } from '../lib/colors'

interface Props {
  profile?: Profile | null
  avatar?: string
  color?: string | null
  name?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  title?: string
}

/** Feste Avatar-Welt: Bild-Avatare, sonst Initialen auf der Familienfarbe. */
export function Avatar({ profile, avatar, color, name, size = 'md', title }: Props) {
  const a = avatar ?? profile?.avatar ?? ''
  const label = title ?? name ?? profile?.display_name ?? ''
  const isImage = a.startsWith('/') || a.startsWith('http')
  const col = memberColor({ avatar: a, color: color ?? profile?.color ?? null })
  return (
    <span className={`avatar ${size}`} title={label} aria-label={label} style={{ background: col.bg, color: col.ink }}>
      {isImage ? <img src={a} alt={label} loading="lazy" /> : <span aria-hidden="true">{initials(label) || '•'}</span>}
    </span>
  )
}
