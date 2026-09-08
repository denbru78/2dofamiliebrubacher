import type { DueKind, Recurrence } from './types'

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Montag der aktuellen Woche, 00:00 Uhr */
export function startOfWeek(d: Date = new Date()): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // Mo=0 ... So=6
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfWeekISO(d: Date = new Date()): string {
  return toISODate(addDays(startOfWeek(d), 6))
}

export function nextSaturdayISO(d: Date = new Date()): string {
  const x = new Date(d)
  const day = x.getDay() // So=0 ... Sa=6
  if (day === 6) return toISODate(x)
  if (day === 0) return toISODate(x) // Sonntag zählt noch als Wochenende
  return toISODate(addDays(x, 6 - day))
}

/** Löst eine Terminart in ein konkretes Datum auf (oder null). */
export function resolveDueDate(kind: DueKind, dateValue: string): string | null {
  const now = new Date()
  switch (kind) {
    case 'today':
      return toISODate(now)
    case 'tomorrow':
      return toISODate(addDays(now, 1))
    case 'week':
      return endOfWeekISO(now)
    case 'weekend':
      return nextSaturdayISO(now)
    case 'date':
      return dateValue || null
    default:
      return null
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export type DueState = 'none' | 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later' | 'someday'

export function dueState(dueKind: DueKind, dueDate: string | null): DueState {
  if (dueKind === 'someday') return 'someday'
  if (!dueDate) return 'none'
  const t = todayISO()
  if (dueDate < t) return 'overdue'
  if (dueDate === t) return 'today'
  if (dueDate === toISODate(addDays(new Date(), 1))) return 'tomorrow'
  if (dueDate <= endOfWeekISO()) return 'soon'
  return 'later'
}

export function dueLabel(dueKind: DueKind, dueDate: string | null): string {
  const s = dueState(dueKind, dueDate)
  switch (s) {
    case 'overdue':
      return `Überfällig · ${formatDate(dueDate)}`
    case 'today':
      return 'Heute'
    case 'tomorrow':
      return 'Morgen'
    case 'soon': {
      const d = new Date(`${dueDate}T12:00:00`)
      return d.toLocaleDateString('de-DE', { weekday: 'long' })
    }
    case 'later':
      return formatDate(dueDate)
    case 'someday':
      return 'Irgendwann'
    default:
      return ''
  }
}

export function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return toISODate(new Date(a)) === toISODate(new Date(b))
}

/** Nächster Termin einer wiederkehrenden Aufgabe (wie im Datenbank-Trigger). */
export function nextDueDate(dueDate: string | null, rec: Recurrence, interval: number): string {
  const n = Math.max(1, interval || 1)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  let base = dueDate ? new Date(`${dueDate}T12:00:00`) : today
  if (base < today) base = today
  const d = new Date(base)
  switch (rec) {
    case 'daily':
      d.setDate(d.getDate() + n)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7 * n)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + n)
      break
    case 'yearly':
      d.setFullYear(d.getFullYear() + n)
      break
    default:
      break
  }
  return toISODate(d)
}
