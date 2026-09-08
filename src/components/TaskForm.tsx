import { useEffect, useRef, useState } from 'react'
import type { DueKind, Priority, Recurrence, Task, TaskInput } from '../lib/types'
import { useStore } from '../lib/store'
import { CATEGORIES, DUE_KINDS, PRIORITIES, RECURRENCES } from '../lib/constants'
import { Avatar } from './Avatar'
import { IconX } from './Icons'

interface Props {
  task?: Task | null
  onClose: () => void
}

function emptyInput(): TaskInput {
  return {
    title: '',
    description: '',
    link: '',
    cost: '',
    category: 'Sonstiges',
    priority: 'none',
    due_kind: 'none',
    due_date: '',
    assignee_ids: [],
    recurrence: 'none',
  }
}

function fromTask(t: Task): TaskInput {
  return {
    title: t.title,
    description: t.description ?? '',
    link: t.link ?? '',
    cost: t.cost === null ? '' : String(t.cost),
    category: t.category,
    priority: t.priority,
    due_kind: t.due_kind,
    due_date: t.due_date ?? '',
    assignee_ids: t.assignee_ids,
    recurrence: t.recurrence,
  }
}

export function TaskForm({ task, onClose }: Props) {
  const { profiles, settings, createTask, updateTask, deleteTask, archiveTask, toast } = useStore()
  const [input, setInput] = useState<TaskInput>(task ? fromTask(task) : emptyInput())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => titleRef.current?.focus(), 80)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setInput((i) => ({ ...i, [key]: value }))

  const toggleAssignee = (id: string) =>
    set('assignee_ids', input.assignee_ids.includes(id) ? input.assignee_ids.filter((x) => x !== id) : [...input.assignee_ids, id])

  const save = async () => {
    if (saving) return
    if (!input.title.trim()) {
      setError('Bitte einen Titel eingeben.')
      titleRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    const err = task ? await updateTask(task.id, input) : await createTask(input)
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    toast(task ? 'Gespeichert' : input.assignee_ids.length === 0 ? 'Im Familien-Pool abgelegt' : 'Aufgabe angelegt', 'info')
    onClose()
  }

  const remove = async () => {
    if (!task) return
    setSaving(true)
    const err = await deleteTask(task.id)
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    toast('Aufgabe gelöscht', 'info')
    onClose()
  }

  const archive = async () => {
    if (!task) return
    setSaving(true)
    const err = await archiveTask(task.id)
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    toast('Archiviert', 'info')
    onClose()
  }

  const isPool = input.assignee_ids.length === 0

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2>{task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <IconX />
          </button>
        </div>

        <div className="field">
          <input
            ref={titleRef}
            className="input big"
            placeholder="Was ist zu tun?"
            value={input.title}
            onChange={(e) => set('title', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
            enterKeyHint="done"
            autoComplete="off"
          />
          {!task && <div className="muted small" style={{ marginTop: 6 }}>Nur Titel eingeben und Enter drücken: landet sofort im Familien-Pool.</div>}
        </div>

        <div className="field">
          <span className="label">Zuständigkeit {isPool ? '· Familien-Pool' : ''}</span>
          <div className="chips wrap">
            <button className={`chip ${isPool ? 'active sage' : ''}`} onClick={() => set('assignee_ids', [])}>
              Familien-Pool
            </button>
            {profiles.map((p) => (
              <button key={p.id} className={`chip ${input.assignee_ids.includes(p.id) ? 'active' : ''}`} onClick={() => toggleAssignee(p.id)}>
                <Avatar profile={p} size="sm" /> {p.display_name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Termin</span>
          <div className="chips wrap">
            {DUE_KINDS.map((d) => (
              <button key={d.value} className={`chip ${input.due_kind === d.value ? 'active' : ''}`} onClick={() => set('due_kind', d.value as DueKind)}>
                {d.label}
              </button>
            ))}
          </div>
          {input.due_kind === 'date' && (
            <input className="input" type="date" value={input.due_date} onChange={(e) => set('due_date', e.target.value)} style={{ marginTop: 10 }} />
          )}
        </div>

        <div className="field">
          <label htmlFor="cat">Kategorie</label>
          <select id="cat" className="select" value={input.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </div>

        {settings.priorities_enabled && (
          <div className="field">
            <span className="label">Priorität</span>
            <div className="chips wrap">
              {PRIORITIES.map((p) => (
                <button key={p.value} className={`chip ${input.priority === p.value ? 'active' : ''}`} onClick={() => set('priority', p.value as Priority)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <details className="more" open={!!(task && (task.description || task.link || task.cost !== null || task.recurrence !== 'none'))}>
          <summary>Weitere Angaben</summary>
          <div className="field" style={{ marginTop: 6 }}>
            <label htmlFor="desc">Beschreibung / Notiz</label>
            <textarea id="desc" className="textarea" value={input.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="link">Link</label>
            <input id="link" className="input" type="url" inputMode="url" placeholder="https://…" value={input.link} onChange={(e) => set('link', e.target.value)} />
          </div>
          <div className="row-2">
            <div className="field">
              <label htmlFor="cost">Kosten (€)</label>
              <input id="cost" className="input" inputMode="decimal" placeholder="0,00" value={input.cost} onChange={(e) => set('cost', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rec">Wiederholung</label>
              <select id="rec" className="select" value={input.recurrence} onChange={(e) => set('recurrence', e.target.value as Recurrence)}>
                {RECURRENCES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>

        {error && <div className="error">{error}</div>}

        <button className="btn block" onClick={save} disabled={saving}>
          {saving ? 'Speichern…' : task ? 'Änderungen speichern' : 'Aufgabe speichern'}
        </button>

        {task && (
          <div className="task-actions" style={{ marginTop: 14, justifyContent: 'space-between' }}>
            {(task.status === 'done') && (
              <button className="btn sm secondary" onClick={archive} disabled={saving}>
                Archivieren
              </button>
            )}
            {!confirmDelete ? (
              <button className="btn sm ghost" onClick={() => setConfirmDelete(true)} disabled={saving} style={{ marginLeft: 'auto', color: 'var(--red)' }}>
                Löschen
              </button>
            ) : (
              <button className="btn sm danger" onClick={remove} disabled={saving} style={{ marginLeft: 'auto' }}>
                Wirklich löschen?
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
