import type { Priority, Task } from './types'
import { dueState } from './dates'

export type Scope = 'all' | 'mine' | 'pool' | 'open' | 'done' | 'archive'
export type DueFilter = 'all' | 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none'
export type SortMode = 'default' | 'due' | 'priority' | 'newest' | 'oldest' | 'alpha'

export interface TaskFilters {
  scope: Scope
  persons: string[] // Struktur für Mehrfachauswahl; V1 nutzt maximal einen Eintrag
  categories: string[]
  priorities: Priority[]
  due: DueFilter
  sort: SortMode
  urgentOnly: boolean
  query: string
}

export const DEFAULT_FILTERS: TaskFilters = {
  scope: 'open',
  persons: [],
  categories: [],
  priorities: [],
  due: 'all',
  sort: 'default',
  urgentOnly: false,
  query: '',
}

const KEY = 'familie.filters'

export function loadFilters(): TaskFilters {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<TaskFilters>) }
  } catch {
    return DEFAULT_FILTERS
  }
}

export function saveFilters(f: TaskFilters): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    /* ignorieren */
  }
}

export const DUE_FILTERS: { value: DueFilter; label: string }[] = [
  { value: 'all', label: 'Alle Termine' },
  { value: 'overdue', label: 'Überfällig' },
  { value: 'today', label: 'Heute' },
  { value: 'tomorrow', label: 'Morgen' },
  { value: 'week', label: 'Diese Woche' },
  { value: 'later', label: 'Später' },
  { value: 'none', label: 'Ohne Termin' },
]

export const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: 'default', label: 'Standard (überfällig → dringend → heute)' },
  { value: 'due', label: 'Fälligkeit' },
  { value: 'priority', label: 'Priorität' },
  { value: 'newest', label: 'Neueste zuerst' },
  { value: 'oldest', label: 'Älteste zuerst' },
  { value: 'alpha', label: 'Alphabetisch' },
]

const PRIO_RANK: Record<Priority, number> = { urgent: 0, important: 1, normal: 2, none: 3 }

/** Standard: überfällig → dringend → heute → bald fällig → ohne Termin */
export function defaultRank(t: Task, prioritiesEnabled: boolean): number {
  const ds = dueState(t.due_kind, t.due_date)
  if (ds === 'overdue') return 0
  if (prioritiesEnabled && t.priority === 'urgent') return 1
  if (ds === 'today') return 2
  if (ds === 'tomorrow' || ds === 'soon' || ds === 'later') return 3
  return 4
}

export function matchesDue(t: Task, f: DueFilter): boolean {
  if (f === 'all') return true
  const ds = dueState(t.due_kind, t.due_date)
  switch (f) {
    case 'overdue':
      return ds === 'overdue'
    case 'today':
      return ds === 'today'
    case 'tomorrow':
      return ds === 'tomorrow'
    case 'week':
      return ds === 'today' || ds === 'tomorrow' || ds === 'soon'
    case 'later':
      return ds === 'later'
    case 'none':
      return ds === 'none' || ds === 'someday'
    default:
      return true
  }
}

export function sortTasks(list: Task[], mode: SortMode, prioritiesEnabled: boolean, doneView: boolean): Task[] {
  const byDue = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
  const byNewest = (a: Task, b: Task) => b.created_at.localeCompare(a.created_at)
  const copy = list.slice()
  switch (mode) {
    case 'due':
      return copy.sort((a, b) => byDue(a, b) || byNewest(a, b))
    case 'priority':
      return copy.sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || byDue(a, b) || byNewest(a, b))
    case 'newest':
      return copy.sort(byNewest)
    case 'oldest':
      return copy.sort((a, b) => a.created_at.localeCompare(b.created_at))
    case 'alpha':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }))
    default:
      if (doneView) return copy.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
      return copy.sort(
        (a, b) => defaultRank(a, prioritiesEnabled) - defaultRank(b, prioritiesEnabled) || byDue(a, b) || byNewest(a, b),
      )
  }
}

/** Volltextsuche: Titel, Beschreibung, Kategorie, Link (unabhängig von Groß-/Kleinschreibung) */
export function matchesQuery(t: Task, q: string, extra: string[] = []): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const hay = [t.title, t.description ?? '', t.category, t.link ?? '', ...extra].join(' ').toLowerCase()
  return needle.split(/\s+/).every((w) => hay.includes(w))
}
