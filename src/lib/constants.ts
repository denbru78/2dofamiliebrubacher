import type { DueKind, Priority, Recurrence } from './types'

export const CATEGORIES: { name: string; short: string; emoji: string }[] = [
  { name: 'Haus & Haushalt', short: 'Haus', emoji: 'home' },
  { name: 'Garten', short: 'Garten', emoji: 'leaf' },
  { name: 'Auto & Mobilität', short: 'Auto', emoji: 'car' },
  { name: 'Besorgen & Kaufen', short: 'Kaufen', emoji: 'cart' },
  { name: 'Prüfen & Recherchieren', short: 'Prüfen', emoji: 'search' },
  { name: 'Familie & Kinder', short: 'Familie', emoji: 'family' },
  { name: 'Organisation', short: 'Organisation', emoji: 'clipboard' },
  { name: 'Sonstiges', short: 'Sonstiges', emoji: 'sparkle' },
]

/** Icon-Schlüssel der Kategorie (Fallback, wenn die Tabelle fehlt) */
export function categoryEmoji(name: string): string {
  return CATEGORIES.find((c) => c.name === name)?.emoji ?? 'sparkle'
}

/** Icon-Schlüssel, die im Kategorien-Editor angeboten werden */
export const CATEGORY_ICON_KEYS = ['home', 'leaf', 'car', 'cart', 'search', 'family', 'clipboard', 'sparkle', 'tool', 'calendar', 'basket', 'book', 'heart', 'flag', 'euro', 'sun']

/** Kurzform für Chips (Haus, Garten, Auto, Kaufen …) */
export function categoryShort(name: string): string {
  return CATEGORIES.find((c) => c.name === name)?.short ?? name
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

export type RecurrenceChoice = 'none' | 'daily' | 'weekly' | 'weeks_n' | 'monthly' | 'months_n' | 'yearly'

export const RECURRENCE_CHOICES: { value: RecurrenceChoice; label: string }[] = [
  { value: 'none', label: 'Keine Wiederholung' },
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'weeks_n', label: 'Alle X Wochen' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'months_n', label: 'Alle X Monate' },
  { value: 'yearly', label: 'Jährlich' },
]

export function toRecurrenceChoice(rec: Recurrence, interval: number): RecurrenceChoice {
  if (rec === 'weekly') return interval > 1 ? 'weeks_n' : 'weekly'
  if (rec === 'monthly') return interval > 1 ? 'months_n' : 'monthly'
  return rec
}

export function fromRecurrenceChoice(choice: RecurrenceChoice, n: number): { recurrence: Recurrence; recurrence_interval: number } {
  const safe = Math.max(1, Math.min(52, Math.round(n) || 1))
  switch (choice) {
    case 'weeks_n':
      return { recurrence: 'weekly', recurrence_interval: Math.max(2, safe) }
    case 'months_n':
      return { recurrence: 'monthly', recurrence_interval: Math.max(2, safe) }
    case 'none':
      return { recurrence: 'none', recurrence_interval: 1 }
    default:
      return { recurrence: choice, recurrence_interval: 1 }
  }
}

export function recurrenceLabel(rec: Recurrence, interval: number): string {
  const n = Math.max(1, interval || 1)
  switch (rec) {
    case 'daily':
      return n > 1 ? `alle ${n} Tage` : 'täglich'
    case 'weekly':
      return n > 1 ? `alle ${n} Wochen` : 'wöchentlich'
    case 'monthly':
      return n > 1 ? `alle ${n} Monate` : 'monatlich'
    case 'yearly':
      return n > 1 ? `alle ${n} Jahre` : 'jährlich'
    default:
      return ''
  }
}

export const IMAGE_AVATARS = ['/avatars/papa.png', '/avatars/mama.png', '/avatars/mia.png', '/avatars/leo.png']
