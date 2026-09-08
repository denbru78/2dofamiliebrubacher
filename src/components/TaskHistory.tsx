import type { Activity, Task } from '../lib/types'
import { useStore } from '../lib/store'
import { formatDate, formatDateTime } from '../lib/dates'
import { priorityLabel } from '../lib/constants'
import { AppIcon } from './AppIcon'

const ICON: Record<string, string> = {
  created: 'sparkle',
  assigned: 'family',
  moved_to_pool: 'basket',
  taken_from_pool: 'hand',
  priority_changed: 'flag',
  due_date_changed: 'calendar',
  completed: 'check',
  reopened: 'repeat',
  archived: 'book',
  edited: 'tool',
  deleted: 'tool',
  claimed: 'hand',
  released: 'basket',
  done: 'check',
  updated: 'tool',
}

export function TaskHistory({ task }: { task: Task }) {
  const { activities, profileById } = useStore()
  const rows = activities.filter((a) => a.task_id === task.id).slice().sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (rows.length === 0) return null

  const name = (id: unknown) => (typeof id === 'string' ? (profileById(id)?.display_name ?? 'jemand') : 'jemand')
  const names = (ids: unknown) => (Array.isArray(ids) ? ids.map((x) => name(x)).join(', ') : '')

  const label = (a: Activity): string => {
    const who = a.actor_id ? (profileById(a.actor_id)?.display_name ?? 'Jemand') : 'Automatisch'
    const m = (a.metadata ?? {}) as Record<string, unknown>
    switch (a.action) {
      case 'created':
        return m.parent_task_id ? `Als Folgeaufgabe der Serie angelegt` : `Erstellt von ${who}`
      case 'assigned':
        return `${names(m.new)} zugewiesen (von ${who})`
      case 'moved_to_pool':
      case 'released':
        return `${who} hat sie in den Familien-Pool gelegt`
      case 'taken_from_pool':
      case 'claimed':
        return `${who} hat sie aus dem Pool übernommen`
      case 'priority_changed':
        return `Priorität: ${priorityLabel((m.old as never) ?? 'none')} → ${priorityLabel((m.new as never) ?? 'none')} (${who})`
      case 'due_date_changed':
        return `Fälligkeit: ${m.old ? formatDate(String(m.old)) : 'keine'} → ${m.new ? formatDate(String(m.new)) : 'keine'} (${who})`
      case 'completed':
      case 'done':
        return `Von ${who} erledigt`
      case 'reopened':
        return `${who} hat sie wieder geöffnet`
      case 'archived':
        return m.auto ? 'Automatisch archiviert (30 Tage erledigt)' : `Von ${who} archiviert`
      case 'edited':
      case 'updated': {
        const parts: string[] = []
        const t = m.title as { old?: string; new?: string } | undefined
        if (t) parts.push(`Titel „${t.old}“ → „${t.new}“`)
        const c = m.category as { old?: string; new?: string } | undefined
        if (c) parts.push(`Kategorie ${c.old} → ${c.new}`)
        if (m.recurrence) parts.push('Wiederholung geändert')
        if (m.description_changed) parts.push('Notiz geändert')
        return `Bearbeitet von ${who}${parts.length ? ': ' + parts.join(', ') : ''}`
      }
      case 'deleted':
        return `Von ${who} gelöscht`
      default:
        return `${who}: ${a.action}`
    }
  }

  return (
    <div className="timeline">
      {rows.map((a) => (
        <div key={a.id} className="tl-row">
          <span className="tl-icon">
            <AppIcon name={ICON[a.action] ?? 'sparkle'} size={14} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{label(a)}</span>
            <span className="muted small">{formatDateTime(a.created_at)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
