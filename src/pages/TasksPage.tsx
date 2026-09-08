import { useMemo, useState } from 'react'
import type { Priority, Task } from '../lib/types'
import { useStore } from '../lib/store'
import { CATEGORIES, PRIORITIES } from '../lib/constants'
import { dueState } from '../lib/dates'
import { Avatar } from '../components/Avatar'
import { TaskCard } from '../components/TaskCard'
import { IconSearch, IconX } from '../components/Icons'

interface Props {
  personFilter: string // 'all' | 'pool' | profile id
  setPersonFilter: (v: string) => void
  onEdit: (t: Task) => void
}

const PRIO_RANK: Record<Priority, number> = { urgent: 0, important: 1, normal: 2, none: 3 }

export function TasksPage({ personFilter, setPersonFilter, onEdit }: Props) {
  const { tasks, profiles, settings, profileById } = useStore()
  const [showDone, setShowDone] = useState(false)
  const [category, setCategory] = useState('all')
  const [priority, setPriority] = useState<'all' | Priority>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = tasks.filter((t) => (showDone ? t.status === 'done' || t.status === 'archived' : t.status === 'open' || t.status === 'claimed'))
    if (personFilter === 'pool') list = list.filter((t) => t.is_pool)
    else if (personFilter !== 'all') list = list.filter((t) => t.assignee_ids.includes(personFilter))
    if (category !== 'all') list = list.filter((t) => t.category === category)
    if (settings.priorities_enabled && priority !== 'all') list = list.filter((t) => t.priority === priority)
    if (q) {
      list = list.filter((t) => {
        const who = t.completed_by ? (profileById(t.completed_by)?.display_name ?? '') : ''
        return t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q) || who.toLowerCase().includes(q)
      })
    }
    if (showDone) {
      list.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    } else {
      list.sort((a, b) => {
        const da = dueState(a.due_kind, a.due_date)
        const db = dueState(b.due_kind, b.due_date)
        const od = (da === 'overdue' ? 0 : 1) - (db === 'overdue' ? 0 : 1)
        if (od !== 0) return od
        if (settings.priorities_enabled) {
          const pr = PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
          if (pr !== 0) return pr
        }
        return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.created_at.localeCompare(a.created_at)
      })
    }
    return list
  }, [tasks, showDone, personFilter, category, priority, query, settings.priorities_enabled, profileById])

  const filterName =
    personFilter === 'all' ? 'Alle' : personFilter === 'pool' ? 'Familien-Pool' : (profileById(personFilter)?.display_name ?? 'Alle')

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Aufgaben</h1>
          <p className="subtitle">
            {filterName} · {filtered.length} {showDone ? 'erledigt' : 'offen'}
          </p>
        </div>
      </div>

      <div className="field" style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 14, top: 15, color: 'var(--muted)' }}>
          <IconSearch />
        </span>
        <input
          className="input"
          style={{ paddingLeft: 42, paddingRight: 42 }}
          placeholder="Suchen in Titel und Beschreibung"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
        />
        {query && (
          <button className="icon-btn" style={{ position: 'absolute', right: 6, top: 6 }} onClick={() => setQuery('')} aria-label="Suche löschen">
            <IconX />
          </button>
        )}
      </div>

      <div className="chips">
        <button className={`chip ${personFilter === 'all' ? 'active' : ''}`} onClick={() => setPersonFilter('all')}>
          Alle
        </button>
        {profiles.map((p) => (
          <button key={p.id} className={`chip ${personFilter === p.id ? 'active' : ''}`} onClick={() => setPersonFilter(p.id)}>
            <Avatar profile={p} size="sm" /> {p.display_name}
          </button>
        ))}
        <button className={`chip ${personFilter === 'pool' ? 'active sage' : ''}`} onClick={() => setPersonFilter('pool')}>
          Pool
        </button>
      </div>

      <div className="chips">
        <button className={`chip ${!showDone ? 'active' : ''}`} onClick={() => setShowDone(false)}>
          Offen
        </button>
        <button className={`chip ${showDone ? 'active' : ''}`} onClick={() => setShowDone(true)}>
          Erledigt
        </button>
        <select className="select chip" style={{ minHeight: 38, padding: '6px 34px 6px 14px', width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategorie">
          <option value="all">Alle Kategorien</option>
          {CATEGORIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        {settings.priorities_enabled && (
          <select className="select chip" style={{ minHeight: 38, padding: '6px 34px 6px 14px', width: 'auto' }} value={priority} onChange={(e) => setPriority(e.target.value as 'all' | Priority)} aria-label="Priorität">
            <option value="all">Alle Prioritäten</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-emoji">{showDone ? '📖' : '🎈'}</div>
            {showDone ? 'Noch nichts Erledigtes mit diesen Filtern.' : 'Keine offenen Aufgaben mit diesen Filtern.'}
          </div>
        ) : (
          <div className="task-list">
            {filtered.map((t) => (
              <TaskCard key={t.id} task={t} onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
