import { useState } from 'react'
import type { Task } from '../lib/types'
import { useStore } from '../lib/store'
import { priorityLabel, recurrenceLabel } from '../lib/constants'
import { dueLabel, formatDateTime } from '../lib/dates'
import { Avatar } from './Avatar'
import { IconX } from './Icons'
import { AppIcon } from './AppIcon'

interface Props {
  task: Task
  onClose: () => void
  onEdit: (t: Task) => void
}

const STATUS_LABEL: Record<Task['status'], string> = {
  open: 'Offen',
  claimed: 'Übernommen',
  done: 'Erledigt',
  archived: 'Archiviert',
}

export function TaskDetail({ task, onClose, onEdit }: Props) {
  const { profile, isAdmin, settings, profileById, categoryIcon, completeTask, reopenTask, claimTask, releaseTask, deleteTask, toast } = useStore()
  const isDone = task.status === 'done' || task.status === 'archived'
  const isMine = !!profile && task.assignee_ids.includes(profile.id)
  const canComplete = !isDone && (isAdmin || isMine)
  const canClaim = !isDone && task.is_pool && (isAdmin || settings.kids_can_claim_pool)
  const UNDO_MS = 5 * 60 * 1000
  const canUndo = isDone && !!profile && task.completed_by === profile.id && !!task.completed_at && Date.now() - new Date(task.completed_at).getTime() < UNDO_MS
  const assignees = task.assignee_ids.map((id) => profileById(id)).filter((p): p is NonNullable<typeof p> => !!p)
  const creator = profileById(task.created_by)
  const completer = profileById(task.completed_by)
  const due = dueLabel(task.due_kind, task.due_date)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const run = async (fn: () => Promise<string | null>, close = true) => {
    const err = await fn()
    if (err) toast(err, 'error')
    else if (close) onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Aufgabe" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head" style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
            <span className="detail-icon" aria-hidden="true">
              <AppIcon name={categoryIcon(task.category)} size={24} />
            </span>
            <h2 style={{ overflowWrap: 'anywhere' }}>{task.title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <IconX />
          </button>
        </div>

        <div className="detail-grid">
          <div className="detail-row">
            <span className="detail-label">Status</span>
            <span className={`tag ${task.status === 'claimed' ? 'claimed' : task.status === 'done' ? 'pool' : ''}`}>{STATUS_LABEL[task.status]}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Kategorie</span>
            <span>{task.category}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Zuständig</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {task.is_pool ? (
                <span className="tag pool">Familien-Pool</span>
              ) : assignees.length ? (
                assignees.map((p) => (
                  <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Avatar profile={p} size="sm" /> {p.display_name}
                  </span>
                ))
              ) : (
                <span className="muted">–</span>
              )}
            </span>
          </div>
          {settings.priorities_enabled && (
            <div className="detail-row">
              <span className="detail-label">Priorität</span>
              <span>{task.priority === 'none' ? <span className="muted">Keine</span> : <span className={`tag ${task.priority}`}>{priorityLabel(task.priority)}</span>}</span>
            </div>
          )}
          <div className="detail-row">
            <span className="detail-label">Fälligkeit</span>
            <span>{due || <span className="muted">Kein Termin</span>}</span>
          </div>
          {task.description && (
            <div className="detail-row col">
              <span className="detail-label">Beschreibung</span>
              <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{task.description}</span>
            </div>
          )}
          {task.link && (
            <div className="detail-row">
              <span className="detail-label">Link</span>
              <a href={task.link} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>
                {task.link}
              </a>
            </div>
          )}
          {task.cost !== null && (
            <div className="detail-row">
              <span className="detail-label">Kosten</span>
              <span>{task.cost.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>
            </div>
          )}
          {task.recurrence !== 'none' && (
            <div className="detail-row">
              <span className="detail-label">Wiederholung</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="repeat" size={16} /> {recurrenceLabel(task.recurrence, task.recurrence_interval)}
            </span>
            </div>
          )}
          <div className="detail-row">
            <span className="detail-label">Erstellt</span>
            <span className="muted small">
              {creator ? `von ${creator.display_name} · ` : ''}
              {formatDateTime(task.created_at)}
            </span>
          </div>
          {task.completed_at && (
            <div className="detail-row">
              <span className="detail-label">Erledigt</span>
              <span className="muted small">
                {completer ? `von ${completer.display_name} · ` : ''}
                {formatDateTime(task.completed_at)}
              </span>
            </div>
          )}
        </div>

        <div className="detail-actions">
          {canComplete && (
            <button className="btn block" onClick={() => run(() => completeTask(task.id))}>
              Erledigen
            </button>
          )}
          {canClaim && !isMine && (
            <button className="btn block" onClick={() => run(() => claimTask(task.id))}>
              Ich übernehme
            </button>
          )}
          {isDone && (isAdmin || canUndo) && (
            <button className="btn secondary block" onClick={() => run(() => reopenTask(task.id))}>
              {isAdmin ? 'Wieder öffnen' : 'Rückgängig'}
            </button>
          )}
          {isAdmin && (
            <div className="task-actions" style={{ marginTop: 4 }}>
              <button className="btn sm secondary" onClick={() => onEdit(task)}>
                Bearbeiten
              </button>
              {!task.is_pool && !isDone && (
                <button className="btn sm secondary" onClick={() => run(() => releaseTask(task.id))}>
                  Zurück in den Pool
                </button>
              )}
              {!confirmDelete ? (
                <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => (task.recurrence !== 'none' ? onEdit(task) : setConfirmDelete(true))}>
                  Löschen
                </button>
              ) : (
                <div className="confirm-box">
                  <div style={{ fontWeight: 600 }}>„{task.title}“ wirklich löschen?</div>
                  <div className="task-actions">
                    <button className="btn sm danger" onClick={() => run(() => deleteTask(task.id))}>
                      Ja, löschen
                    </button>
                    <button className="btn sm secondary" onClick={() => setConfirmDelete(false)}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
