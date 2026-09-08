import { useEffect, useRef, useState } from 'react'
import type { DueKind, Priority, ReminderType, Task, TaskInput } from '../lib/types'
import { REMINDER_TYPES } from '../lib/reminders'
import { useStore } from '../lib/store'
import {
  categoryShort,
  DUE_KINDS,
  PRIORITIES,
  RECURRENCE_CHOICES,
  fromRecurrenceChoice,
  toRecurrenceChoice,
  type RecurrenceChoice,
} from '../lib/constants'
import { Avatar } from './Avatar'
import { IconX } from './Icons'
import { AppIcon } from './AppIcon'

interface Props {
  task?: Task | null
  onClose: () => void
  onGoToTasks?: () => void
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
    recurrence_interval: 1,
    reminder_type: 'none',
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
    recurrence_interval: t.recurrence_interval ?? 1,
    reminder_type: t.reminder_type === 'custom' ? 'custom' : (t.reminder_type ?? 'none'),
  }
}

type WhoMode = 'pool' | 'single' | 'multi'

export function TaskForm({ task, onClose, onGoToTasks }: Props) {
  const { profiles, settings, categories, createTask, updateTask, deleteTask, archiveTask, toast } = useStore()
  const [input, setInput] = useState<TaskInput>(task ? fromTask(task) : emptyInput())
  const [whoMode, setWhoMode] = useState<WhoMode>(
    task && task.assignee_ids.length > 1 ? 'multi' : task && task.assignee_ids.length === 1 ? 'single' : 'pool',
  )
  const [recChoice, setRecChoice] = useState<RecurrenceChoice>(task ? toRecurrenceChoice(task.recurrence, task.recurrence_interval ?? 1) : 'none')
  const [recN, setRecN] = useState(String(task?.recurrence_interval && task.recurrence_interval > 1 ? task.recurrence_interval : 2))
  const [moreOpen, setMoreOpen] = useState(!!(task && (task.description || task.link || task.cost !== null || task.recurrence !== 'none')))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<0 | 1>(0)
  const [savedTitle, setSavedTitle] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => titleRef.current?.focus(), 80)
    return () => window.clearTimeout(t)
  }, [savedTitle])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setInput((i) => ({ ...i, [key]: value }))

  const choosePool = () => {
    setWhoMode('pool')
    set('assignee_ids', [])
  }
  const chooseMulti = () => setWhoMode('multi')
  const choosePerson = (id: string) => {
    if (whoMode === 'multi') {
      set('assignee_ids', input.assignee_ids.includes(id) ? input.assignee_ids.filter((x) => x !== id) : [...input.assignee_ids, id])
      return
    }
    const alreadyOnly = input.assignee_ids.length === 1 && input.assignee_ids[0] === id
    if (alreadyOnly) {
      setWhoMode('pool')
      set('assignee_ids', [])
    } else {
      setWhoMode('single')
      set('assignee_ids', [id])
    }
  }

  const buildInput = (): TaskInput => {
    const rec = fromRecurrenceChoice(recChoice, Number(recN))
    return { ...input, ...rec }
  }

  const save = async () => {
    if (saving) return
    if (!input.title.trim()) {
      setError('Bitte einen Titel eingeben.')
      titleRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    const data = buildInput()
    const err = task ? await updateTask(task.id, data) : await createTask(data)
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    if (task) {
      toast('Gespeichert', 'info')
      onClose()
      return
    }
    setSavedTitle(data.title.trim())
  }

  const another = () => {
    setInput(emptyInput())
    setWhoMode('pool')
    setRecChoice('none')
    setRecN('2')
    setMoreOpen(false)
    setSavedTitle(null)
  }

  const remove = async (mode: 'single' | 'series') => {
    if (!task) return
    setSaving(true)
    const err = await deleteTask(task.id, mode)
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    toast(mode === 'single' && task.recurrence !== 'none' ? 'Gelöscht – nächster Termin bleibt' : 'Aufgabe gelöscht', 'info')
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

  const isPool = input.assignee_ids.length === 0 && whoMode !== 'multi'
  const hasDate = input.due_kind !== 'none' && input.due_kind !== 'someday' && (input.due_kind !== 'date' || !!input.due_date)
  const showN = recChoice === 'weeks_n' || recChoice === 'months_n'

  // ---- Erfolgsschritt nach dem Speichern ----------------------------------
  if (savedTitle !== null) {
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grab" />
          <div className="saved-state">
            <div className="saved-check">✓</div>
            <h2>Aufgabe gespeichert</h2>
            <p className="muted" style={{ margin: '4px 0 18px', overflowWrap: 'anywhere' }}>
              „{savedTitle}“
            </p>
            <button className="btn block" onClick={another} style={{ marginBottom: 10 }}>
              Noch eine Aufgabe
            </button>
            <button
              className="btn secondary block"
              onClick={() => {
                onClose()
                onGoToTasks?.()
              }}
            >
              Zur Übersicht
            </button>
          </div>
        </div>
      </div>
    )
  }

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
          <label htmlFor="title">Was ist zu tun?</label>
          <input
            id="title"
            ref={titleRef}
            className="input big"
            placeholder="z. B. Gartenhaus aufräumen"
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
        </div>

        <div className="field">
          <span className="label">Kategorie</span>
          <div className="chips wrap">
            {categories.map((c) => (
              <button key={c.id} className={`chip ${input.category === c.name ? 'active' : ''}`} onClick={() => set('category', c.name)}>
                <AppIcon name={c.icon} size={16} /> {categoryShort(c.name)}
              </button>
            ))}
            {task && !categories.some((c) => c.name === input.category) && (
              <button className="chip active" onClick={() => undefined}>
                {input.category}
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <span className="label">Wer macht’s?</span>
          <div className="chips wrap">
            {profiles.map((p) => (
              <button key={p.id} className={`chip ${input.assignee_ids.includes(p.id) ? 'active' : ''}`} onClick={() => choosePerson(p.id)}>
                <Avatar profile={p} size="sm" /> {p.display_name}
              </button>
            ))}
            <button className={`chip ${whoMode === 'multi' ? 'active' : ''}`} onClick={chooseMulti}>
              Mehrere
            </button>
            <button className={`chip ${isPool ? 'active sage' : ''}`} onClick={choosePool}>
              Familien-Pool
            </button>
          </div>
          {whoMode === 'multi' && <div className="muted small" style={{ marginTop: 6 }}>Mehrere Personen antippen – jede kann die Aufgabe abhaken.</div>}
          {isPool && <div className="muted small" style={{ marginTop: 6 }}>Liegt im Pool – wer mag, drückt „Ich übernehme“.</div>}
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

        <div className="field">
          <span className="label">Wann?</span>
          <div className="chips wrap">
            {DUE_KINDS.filter((d) => d.value !== 'none').map((d) => (
              <button
                key={d.value}
                className={`chip ${input.due_kind === d.value ? 'active' : ''}`}
                onClick={() => set('due_kind', input.due_kind === d.value ? 'none' : (d.value as DueKind))}
              >
                {d.label}
              </button>
            ))}
          </div>
          {input.due_kind === 'date' && (
            <input className="input" type="date" value={input.due_date} onChange={(e) => set('due_date', e.target.value)} style={{ marginTop: 10 }} />
          )}
          {hasDate && settings.reminders_enabled && (
            <div style={{ marginTop: 12 }}>
              <span className="label">Erinnerung</span>
              <div className="chips wrap">
                {REMINDER_TYPES.map((r) => (
                  <button key={r.value} className={`chip ${input.reminder_type === r.value ? 'active' : ''}`} onClick={() => set('reminder_type', r.value as ReminderType)}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        <button className="btn block" onClick={save} disabled={saving} style={{ minHeight: 52 }}>
          {saving ? 'Speichern…' : task ? 'Änderungen speichern' : 'Aufgabe speichern'}
        </button>

        {!moreOpen ? (
          <button className="btn ghost block" onClick={() => setMoreOpen(true)} style={{ marginTop: 6 }}>
            Weitere Angaben hinzufügen
          </button>
        ) : (
          <div className="more-box">
            <div className="field">
              <label htmlFor="desc">Notiz</label>
              <textarea id="desc" className="textarea" value={input.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="link">Link</label>
              <input id="link" className="input" type="url" inputMode="url" placeholder="https://…" value={input.link} onChange={(e) => set('link', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cost">Kosten (€)</label>
              <input id="cost" className="input" inputMode="decimal" placeholder="0,00" value={input.cost} onChange={(e) => set('cost', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rec">Wiederholen</label>
              <select id="rec" className="select" value={recChoice} onChange={(e) => setRecChoice(e.target.value as RecurrenceChoice)}>
                {RECURRENCE_CHOICES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {showN && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <span className="muted small">Alle</span>
                  <input className="input" style={{ width: 84, textAlign: 'center' }} inputMode="numeric" value={recN} onChange={(e) => setRecN(e.target.value)} aria-label="Intervall" />
                  <span className="muted small">{recChoice === 'weeks_n' ? 'Wochen' : 'Monate'}</span>
                </div>
              )}
              {recChoice !== 'none' && <div className="muted small" style={{ marginTop: 6 }}>Nach dem Erledigen wird automatisch der nächste Termin angelegt.</div>}
            </div>
          </div>
        )}

        {task && (
          <div className="delete-box">
            {task.status === 'done' && (
              <button className="btn sm secondary" onClick={archive} disabled={saving}>
                Archivieren
              </button>
            )}
            {deleteStep === 0 ? (
              <button className="btn sm ghost" onClick={() => setDeleteStep(1)} disabled={saving} style={{ marginLeft: 'auto', color: 'var(--red)' }}>
                Löschen
              </button>
            ) : task.recurrence !== 'none' ? (
              <div className="delete-choice">
                <div className="muted small">Diese Aufgabe wiederholt sich. Was soll gelöscht werden?</div>
                <button className="btn sm secondary" onClick={() => remove('single')} disabled={saving}>
                  Nur diese Aufgabe löschen
                </button>
                <button className="btn sm danger" onClick={() => remove('series')} disabled={saving}>
                  Diese und alle zukünftigen löschen
                </button>
                <button className="btn sm ghost" onClick={() => setDeleteStep(0)} disabled={saving}>
                  Abbrechen
                </button>
              </div>
            ) : (
              <button className="btn sm danger" onClick={() => remove('series')} disabled={saving} style={{ marginLeft: 'auto' }}>
                Wirklich löschen?
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
