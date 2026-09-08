import { useEffect, useMemo, useState } from 'react'
import type { Priority, Task } from '../lib/types'
import { useStore } from '../lib/store'
import { PRIORITIES, categoryShort } from '../lib/constants'
import { isImportantNow } from './StartPage'
import { Avatar } from '../components/Avatar'
import { TaskCard } from '../components/TaskCard'
import { IconSearch, IconX } from '../components/Icons'
import { AppIcon } from '../components/AppIcon'
import {
  DEFAULT_FILTERS,
  DUE_FILTERS,
  SORT_MODES,
  loadFilters,
  matchesDue,
  matchesQuery,
  saveFilters,
  sortTasks,
  type Scope,
  type TaskFilters,
} from '../lib/filters'

interface Props {
  personFilter: string // 'all' | 'pool' | profile id  (Einstieg von Startseite/Familie)
  setPersonFilter: (v: string) => void
  urgentOnly: boolean
  setUrgentOnly: (v: boolean) => void
  onEdit: (t: Task) => void
}

export function TasksPage({ personFilter, setPersonFilter, urgentOnly, setUrgentOnly, onEdit }: Props) {
  const { profile, tasks, profiles, settings, profileById, allCategories, categories } = useStore()
  const [f, setF] = useState<TaskFilters>(() => loadFilters())
  const [more, setMore] = useState(false)

  // Einstieg von anderen Seiten (Avatar antippen, "Meine Aufgaben", "Heute wichtig", Pool)
  useEffect(() => {
    if (personFilter === 'pool') setF((x) => ({ ...x, scope: 'pool', persons: [] }))
    else if (profile && personFilter === profile.id) setF((x) => ({ ...x, scope: 'mine', persons: [] }))
    else if (personFilter !== 'all') setF((x) => ({ ...x, scope: 'open', persons: [personFilter] }))
    if (urgentOnly) setF((x) => ({ ...x, urgentOnly: true }))
    setPersonFilter('all')
    setUrgentOnly(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personFilter, urgentOnly])

  useEffect(() => saveFilters(f), [f])

  const set = <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => setF((x) => ({ ...x, [key]: value }))
  const toggleIn = (key: 'persons' | 'categories' | 'priorities', value: string, single = true) =>
    setF((x) => {
      const arr = x[key] as string[]
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : single ? [value] : [...arr, value]
      return { ...x, [key]: next }
    })

  const doneView = f.scope === 'done' || f.scope === 'archive'
  const catList = allCategories.length ? allCategories.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order) : categories

  const filtered = useMemo(() => {
    let list = tasks
    switch (f.scope) {
      case 'all':
        list = list.filter((t) => t.status !== 'archived')
        break
      case 'mine':
        list = list.filter((t) => (t.status === 'open' || t.status === 'claimed') && !!profile && t.assignee_ids.includes(profile.id))
        break
      case 'pool':
        list = list.filter((t) => (t.status === 'open' || t.status === 'claimed') && t.is_pool)
        break
      case 'done':
        list = list.filter((t) => t.status === 'done')
        break
      case 'archive':
        list = list.filter((t) => t.status === 'archived')
        break
      default:
        list = list.filter((t) => t.status === 'open' || t.status === 'claimed')
    }
    if (f.persons.length) list = list.filter((t) => f.persons.some((p) => t.assignee_ids.includes(p)))
    if (f.categories.length) list = list.filter((t) => f.categories.includes(t.category))
    if (settings.priorities_enabled && f.priorities.length) list = list.filter((t) => f.priorities.includes(t.priority))
    if (!doneView) {
      if (f.urgentOnly) list = list.filter((t) => isImportantNow(t, settings.priorities_enabled))
      list = list.filter((t) => matchesDue(t, f.due))
    }
    if (f.query) list = list.filter((t) => matchesQuery(t, f.query, [t.completed_by ? (profileById(t.completed_by)?.display_name ?? '') : '']))
    return sortTasks(list, f.sort, settings.priorities_enabled, doneView)
  }, [tasks, f, profile, settings.priorities_enabled, doneView, profileById])

  const scopeChips: { key: Scope; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'mine', label: 'Meine' },
    { key: 'pool', label: 'Pool' },
    { key: 'open', label: 'Offen' },
    { key: 'done', label: 'Erledigt' },
    { key: 'archive', label: 'Archiv' },
  ]

  const extraActive =
    (settings.priorities_enabled && f.priorities.length > 0) || f.due !== 'all' || f.sort !== 'default' || f.urgentOnly
  const anyActive = extraActive || f.persons.length > 0 || f.categories.length > 0 || f.query !== '' || f.scope !== 'open'

  const subtitle = [
    `${filtered.length} ${f.scope === 'archive' ? 'archiviert' : f.scope === 'done' ? 'erledigt' : f.scope === 'all' ? 'Aufgaben' : 'offen'}`,
    ...f.persons.map((p) => profileById(p)?.display_name ?? ''),
    ...f.categories.map(categoryShort),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Alle Aufgaben</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="field" style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 14, top: 15, color: 'var(--muted)' }}>
          <IconSearch />
        </span>
        <input
          className="input"
          style={{ paddingLeft: 42, paddingRight: 42 }}
          placeholder="Aufgaben durchsuchen"
          value={f.query}
          onChange={(e) => set('query', e.target.value)}
          type="search"
          autoComplete="off"
        />
        {f.query && (
          <button className="icon-btn" style={{ position: 'absolute', right: 6, top: 6 }} onClick={() => set('query', '')} aria-label="Suche löschen">
            <IconX />
          </button>
        )}
      </div>

      {/* Status */}
      <div className="chips">
        {scopeChips.map((c) => (
          <button
            key={c.key}
            className={`chip ${f.scope === c.key ? (c.key === 'pool' ? 'active sage' : c.key === 'archive' ? 'active quiet' : 'active') : ''}`}
            onClick={() => set('scope', c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Person */}
      <div className="chips">
        {profiles.map((p) => (
          <button key={p.id} className={`chip ${f.persons.includes(p.id) ? 'active' : ''}`} onClick={() => toggleIn('persons', p.id)}>
            <Avatar profile={p} size="sm" /> {p.display_name}
          </button>
        ))}
      </div>

      {/* Kategorie */}
      <div className="chips">
        {catList.map((c) => (
          <button key={c.id} className={`chip ${f.categories.includes(c.name) ? 'active' : ''}`} onClick={() => toggleIn('categories', c.name)}>
            <AppIcon name={c.icon} size={16} /> {categoryShort(c.name)}
          </button>
        ))}
      </div>

      {/* Mehr Filter */}
      <div className="filter-more-row">
        <button className={`chip ${more || extraActive ? 'active sage' : ''}`} onClick={() => setMore(!more)}>
          <AppIcon name="tool" size={15} /> Mehr Filter{extraActive ? ' •' : ''}
        </button>
        {anyActive && (
          <button className="link-btn" onClick={() => setF({ ...DEFAULT_FILTERS })}>
            Zurücksetzen
          </button>
        )}
      </div>

      {more && (
        <div className="card filter-card">
          {!doneView && (
            <div className="field">
              <span className="label">Fälligkeit</span>
              <div className="chips wrap">
                {DUE_FILTERS.map((d) => (
                  <button key={d.value} className={`chip ${f.due === d.value ? 'active' : ''}`} onClick={() => set('due', d.value)}>
                    {d.label}
                  </button>
                ))}
                <button className={`chip ${f.urgentOnly ? 'active' : ''}`} onClick={() => set('urgentOnly', !f.urgentOnly)}>
                  Heute wichtig
                </button>
              </div>
            </div>
          )}
          {settings.priorities_enabled && (
            <div className="field">
              <span className="label">Priorität</span>
              <div className="chips wrap">
                {PRIORITIES.slice()
                  .reverse()
                  .map((p) => (
                    <button key={p.value} className={`chip ${f.priorities.includes(p.value) ? `active ${p.value}` : ''}`} onClick={() => toggleIn('priorities', p.value as Priority)}>
                      {p.label}
                    </button>
                  ))}
              </div>
            </div>
          )}
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="sort">Sortierung</label>
            <select id="sort" className="select" value={f.sort} onChange={(e) => set('sort', e.target.value as TaskFilters['sort'])}>
              {SORT_MODES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <AppIcon name={doneView ? 'book' : 'balloon'} size={30} />
            </div>
            {f.scope === 'archive'
              ? 'Das Archiv ist leer. Erledigte Aufgaben wandern nach 30 Tagen automatisch hierher.'
              : f.query
                ? `Nichts gefunden für „${f.query}“.`
                : doneView
                  ? 'Noch nichts Erledigtes mit diesen Filtern.'
                  : 'Hier ist gerade nichts offen.'}
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
