import { useMemo, useState } from 'react'
import type { Priority, Task } from '../lib/types'
import { useStore } from '../lib/store'
import { PRIORITIES, categoryShort } from '../lib/constants'
import { dueState } from '../lib/dates'
import { isImportantNow } from './StartPage'
import { Avatar } from '../components/Avatar'
import { TaskCard } from '../components/TaskCard'
import { IconSearch, IconX } from '../components/Icons'
import { AppIcon } from '../components/AppIcon'

interface Props {
  personFilter: string // 'all' | 'pool' | profile id
  setPersonFilter: (v: string) => void
  urgentOnly: boolean
  setUrgentOnly: (v: boolean) => void
  onEdit: (t: Task) => void
}

type Scope = 'all' | 'mine' | 'pool' | 'done' | 'archive'

/** Sortierung: überfällig → dringend → heute → bald fällig → ohne Termin */
function rank(t: Task, prio: boolean): number {
  const ds = dueState(t.due_kind, t.due_date)
  if (ds === 'overdue') return 0
  if (prio && t.priority === 'urgent') return 1
  if (ds === 'today') return 2
  if (ds === 'tomorrow' || ds === 'soon' || ds === 'later') return 3
  return 4
}

export function TasksPage({ personFilter, setPersonFilter, urgentOnly, setUrgentOnly, onEdit }: Props) {
  const { profile, tasks, profiles, settings, profileById, allCategories, categories } = useStore()
  const [scopeState, setScope] = useState<Scope>('all')
  const [category, setCategory] = useState('all')
  const [priority, setPriority] = useState<'all' | Priority>('all')
  const [query, setQuery] = useState('')

  // Übergabe von der Startseite: Person oder Pool
  const scope: Scope = personFilter === 'pool' ? 'pool' : profile && personFilter === profile.id && scopeState !== 'done' ? 'mine' : scopeState
  const showDone = scope === 'done' || scope === 'archive'
  const person = personFilter === 'all' || personFilter === 'pool' ? 'all' : personFilter

  const chooseScope = (s: Scope) => {
    setScope(s)
    if (s === 'pool') setPersonFilter('pool')
    else if (s === 'mine' && profile) setPersonFilter(profile.id)
    else setPersonFilter('all')
    if (s === 'done' || s === 'archive') setUrgentOnly(false)
  }

  const choosePerson = (id: string) => {
    if (person === id) {
      setPersonFilter('all')
      if (scopeState === 'mine') setScope('all')
      return
    }
    setPersonFilter(id)
    if (scopeState === 'pool') setScope('all')
  }

  const catList = allCategories.length ? allCategories.slice().sort((a, b) => a.sort_order - b.sort_order) : categories

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = tasks.filter((t) => (scope === 'archive' ? t.status === 'archived' : scope === 'done' ? t.status === 'done' : t.status === 'open' || t.status === 'claimed'))
    if (scope === 'pool') list = list.filter((t) => t.is_pool)
    if (person !== 'all') list = list.filter((t) => t.assignee_ids.includes(person))
    if (urgentOnly && !showDone) list = list.filter((t) => isImportantNow(t, settings.priorities_enabled))
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
      const prio = settings.priorities_enabled
      list.sort(
        (a, b) =>
          rank(a, prio) - rank(b, prio) ||
          (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
          b.created_at.localeCompare(a.created_at),
      )
    }
    return list
  }, [tasks, showDone, scope, person, category, priority, query, urgentOnly, settings.priorities_enabled, profileById])

  const scopeChips: { key: Scope; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'mine', label: 'Meine' },
    { key: 'pool', label: 'Pool' },
    { key: 'done', label: 'Erledigt' },
    { key: 'archive', label: 'Archiv' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Alle Aufgaben</h1>
          <p className="subtitle">
            {filtered.length} {scope === 'archive' ? 'archiviert' : showDone ? 'erledigt' : 'offen'}
            {person !== 'all' ? ` · ${profileById(person)?.display_name ?? ''}` : ''}
            {category !== 'all' ? ` · ${category}` : ''}
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
        {scopeChips.map((c) => (
          <button key={c.key} className={`chip ${scope === c.key ? (c.key === 'pool' ? 'active sage' : c.key === 'archive' ? 'active quiet' : 'active') : ''}`} onClick={() => chooseScope(c.key)}>
            {c.label}
          </button>
        ))}
        {!showDone && (
          <button className={`chip ${urgentOnly ? 'active' : ''}`} onClick={() => setUrgentOnly(!urgentOnly)}>
            Heute wichtig
          </button>
        )}
      </div>

      <div className="chips">
        {profiles.map((p) => (
          <button key={p.id} className={`chip ${person === p.id ? 'active' : ''}`} onClick={() => choosePerson(p.id)}>
            <Avatar profile={p} size="sm" /> {p.display_name}
          </button>
        ))}
      </div>

      <div className="chips">
        <button className={`chip ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>
          Alle Kategorien
        </button>
        {catList.map((c) => (
          <button key={c.id} className={`chip ${category === c.name ? 'active' : ''}`} onClick={() => setCategory(category === c.name ? 'all' : c.name)}>
            <AppIcon name={c.icon} size={16} /> {categoryShort(c.name)}
          </button>
        ))}
        {settings.priorities_enabled && (
          <select
            className="select chip"
            style={{ minHeight: 38, padding: '6px 34px 6px 14px', width: 'auto' }}
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'all' | Priority)}
            aria-label="Priorität"
          >
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
            <div className="empty-icon">
              <AppIcon name={showDone ? 'book' : 'balloon'} size={30} />
            </div>
            {scope === 'archive' ? 'Das Archiv ist leer. Erledigte Aufgaben wandern nach 30 Tagen automatisch hierher.' : showDone ? 'Noch nichts Erledigtes mit diesen Filtern.' : 'Keine offenen Aufgaben mit diesen Filtern.'}
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
