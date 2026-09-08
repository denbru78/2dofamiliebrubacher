import type { Profile } from './types'

export type MemberColor = 'sage' | 'rose' | 'pink' | 'blue' | 'peach' | 'grey'

export const MEMBER_COLORS: { key: MemberColor; label: string; bg: string; ink: string; dot: string }[] = [
  { key: 'sage', label: 'Salbei', bg: '#DDEAE0', ink: '#3F6B4E', dot: '#6E9B7C' },
  { key: 'rose', label: 'Rosé', bg: '#F6DCDC', ink: '#9A4B4B', dot: '#D98C8C' },
  { key: 'pink', label: 'Rosa', bg: '#F2DCEE', ink: '#7E4A78', dot: '#C58BBE' },
  { key: 'blue', label: 'Hellblau', bg: '#D9E6F5', ink: '#3E5F86', dot: '#7FA3CF' },
  { key: 'peach', label: 'Peach', bg: '#F9E3D2', ink: '#9A5A2E', dot: '#E5A97C' },
  { key: 'grey', label: 'Grau', bg: '#E8E8E4', ink: '#5A5E66', dot: '#A2A6AE' },
]

const BY_AVATAR: Record<string, MemberColor> = {
  '/avatars/papa.png': 'sage',
  '/avatars/mama.png': 'rose',
  '/avatars/mia.png': 'pink',
  '/avatars/leo.png': 'blue',
}

export function memberColorKey(p: Pick<Profile, 'avatar' | 'color'> | null | undefined): MemberColor {
  if (!p) return 'grey'
  const c = p.color as MemberColor | null | undefined
  if (c && MEMBER_COLORS.some((m) => m.key === c)) return c
  return BY_AVATAR[p.avatar] ?? 'grey'
}

export function memberColor(p: Pick<Profile, 'avatar' | 'color'> | null | undefined) {
  const key = memberColorKey(p)
  return MEMBER_COLORS.find((m) => m.key === key) ?? MEMBER_COLORS[5]
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
