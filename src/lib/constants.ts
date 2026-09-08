import type { DueKind, Priority, Recurrence } from './types'

export const CATEGORIES: { name: string; emoji: string }[] = [
  { name: 'Haus & Haushalt', emoji: '🏠' },
  { name: 'Garten', emoji: '🌿' },
  { name: 'Auto & Mobilität', emoji: '🚗' },
  { name: 'Besorgen & Kaufen', emoji: '🛒' },
  { name: 'Prüfen & Recherchieren', emoji: '🔍' },
  { name: 'Familie & Kinder', emoji: '👨‍👩‍👧‍👦' },
  { name: 'Organisation', emoji: '📋' },
  { name: 'Sonstiges', emoji: '✨' },
]

export function categoryEmoji(name: string): string {
  return CATEGORIES.find((c) => c.name === name)?.emoji ?? '✨'
}

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'none', label: 'Keine' },
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Wichtig' },
  { value: 'urgent', label: 'Dringend' },
]

export function priorityLabel(p: Priority): string {
  return PRIORITIES.find((x) => x.value === p)?.label ?? 'Keine'
}

export const DUE_KINDS: { value: DueKind; label: string }[] = [
  { value: 'none', label: 'Kein Termin' },
  { value: 'today', label: 'Heute' },
  { value: 'tomorrow', label: 'Morgen' },
  { value: 'week', label: 'Diese Woche' },
  { value: 'weekend', label: 'Wochenende' },
  { value: 'someday', label: 'Irgendwann' },
  { value: 'date', label: 'Datum' },
]

export const RECURRENCES: { value: Recurrence; label: string }[] = [
  { value: 'none', label: 'Keine' },
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
]

export const EMOJI_AVATARS = ['🙂', '😊', '😎', '🐻', '🦊', '🐱', '🐶', '🦄', '🌟', '🍀', '🚀', '⚽', '🎨', '🎸', '🌸', '🐢']

export const IMAGE_AVATARS = ['/avatars/papa.png', '/avatars/mama.png', '/avatars/mia.png', '/avatars/leo.png']
