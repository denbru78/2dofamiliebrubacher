import type { ReminderType, Task } from './types'

export const REMINDER_TYPES: { value: ReminderType; label: string }[] = [
  { value: 'none', label: 'Keine' },
  { value: 'due_morning', label: 'Am Fälligkeitstag morgens' },
  { value: 'day_before', label: '1 Tag vorher' },
]

export function reminderLabel(t: Task): string {
  switch (t.reminder_type) {
    case 'due_morning':
      return 'Erinnerung am Tag selbst'
    case 'day_before':
      return 'Erinnerung 1 Tag vorher'
    case 'custom':
      return t.reminder_at ? `Erinnerung ${new Date(t.reminder_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Erinnerung'
    default:
      return ''
  }
}

/** Fällige Erinnerungen (Zeitpunkt erreicht, Aufgabe offen), höchstens 3 Tage zurück */
export function dueReminders(tasks: Task[], profileId: string): Task[] {
  const now = Date.now()
  const floor = now - 3 * 24 * 60 * 60 * 1000
  return tasks.filter(
    (t) =>
      (t.status === 'open' || t.status === 'claimed') &&
      t.reminder_at &&
      t.assignee_ids.includes(profileId) &&
      new Date(t.reminder_at).getTime() <= now &&
      new Date(t.reminder_at).getTime() >= floor,
  )
}

const SHOWN_KEY = 'familie.reminders.shown'

export function alreadyShown(id: string, stamp: string): boolean {
  try {
    const map = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '{}') as Record<string, string>
    return map[id] === stamp
  } catch {
    return false
  }
}

export function markShown(id: string, stamp: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '{}') as Record<string, string>
    map[id] = stamp
    const keys = Object.keys(map)
    if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete map[k]
    localStorage.setItem(SHOWN_KEY, JSON.stringify(map))
  } catch {
    /* ignorieren */
  }
}

/** Lokale Geräte-Benachrichtigung (nur bei erteilter Erlaubnis, nur wenn App offen) */
export function showLocalNotification(title: string, body: string): void {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    new Notification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' })
  } catch {
    /* ignorieren */
  }
}
