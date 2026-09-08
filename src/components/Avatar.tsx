import type { Profile } from '../lib/types'

const BG_BY_AVATAR: Record<string, string> = {
  '/avatars/papa.png': '#dfe8e3',
  '/avatars/mama.png': '#f9dede',
  '/avatars/mia.png': '#f9e0e6',
  '/avatars/leo.png': '#d9e6f6',
}

interface Props {
  profile?: Profile | null
  avatar?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  title?: string
}

export function Avatar({ profile, avatar, size = 'md', title }: Props) {
  const a = avatar ?? profile?.avatar ?? '🙂'
  const label = title ?? profile?.display_name ?? ''
  const isImage = a.startsWith('/') || a.startsWith('http')
  const style = isImage ? { background: BG_BY_AVATAR[a] ?? 'var(--surface-2)' } : undefined
  return (
    <span className={`avatar ${size}`} title={label} aria-label={label} style={style}>
      {isImage ? <img src={a} alt={label} loading="lazy" /> : <span aria-hidden="true">{a}</span>}
    </span>
  )
}
