import type { Task } from '../lib/types'
import { useStore } from '../lib/store'
import { priorityLabel, recurrenceLabel } from '../lib/constants'
import { dueLabel, dueLabelShort, dueState, formatDateTime } from '../lib/dates'
import { Avatar } from './Avatar'
import { IconCheck, IconEdit } from './Icons'
import { AppIcon } from './AppIcon'
import { memberColor } from '../lib/colors'
import { reminderLabel } from '../lib/reminders'
import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  task: Task
  onEdit?: (task: Task) => void
  compact?: boolean
  showHistory?: boolean
  showClaim?: boolean
}

export function TaskCard({ task, onEdit, compact = false, showHistory = false, showClaim = false }: Props) {
  const { profile, isAdmin, settings, profileById, categoryIcon, completeTask, reopenTask, claimTask, releaseTask, openTask, bonusInterest, toast } = useStore()
  const isDone = task.status === 'done' || task.status === 'archived'
  const isMine = !!profile && task.assignee_ids.includes(profile.id)
  const canComplete = !isDone && (isAdmin || isMine)
  const UNDO_MS = 5 * 60 * 1000
  const canUndo = isDone && !!profile && task.completed_by === profile.id && !!task.completed_at && Date.now() - new Date(task.completed_at).getTime() < UNDO_MS
  const holdActive = !!task.pool_hold_until && new Date(task.pool_hold_until).getTime() > Date.now()
  const canClaim = !isDone && task.is_pool && (isAdmin || settings.kids_can_claim_pool) && !(holdActive && !isAdmin)
  const canInterest = !isDone && task.is_pool && !isAdmin && holdActive && settings.kids_can_claim_pool
  const interested = !!profile && task.interested_ids.includes(profile.id)
  const bonus = settings.bonus_enabled && task.bonus_points > 0
  const assignees = task.assignee_ids.map((id) => profileById(id)).filter((p): p is NonNullable<typeof p> => !!p)
  const ds = dueState(task.due_kind, task.due_date)
  const due = dueLabel(task.due_kind, task.due_date)

  const [busy, setBusy] = useState(false)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const run = async (fn: () => Promise<string | null>) => {
    if (busy) return
    setBusy(true)
    try {
      const err = await fn()
      if (err) toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  const onCheck = () => {
    if (isDone) {
      if (isAdmin || canUndo) run(() => reopenTask(task.id))
      else toast('Nur Mama oder Papa können das wieder öffnen.', 'info')
      return
    }
    if (canComplete) run(() => completeTask(task.id))
    else if (canClaim) toast('Bitte zuerst „Ich übernehme“ antippen.', 'info')
    else if (task.is_pool) toast('Pool-Aufgaben verteilen gerade nur Mama oder Papa.', 'info')
    else toast('Diese Aufgabe gehört jemand anderem.', 'info')
  }

  const completer = profileById(task.completed_by)

  return (
    <div className={`task-row ${compact ? 'compact' : ''} ${task.status === 'archived' ? 'archived' : ''}`}>
      <button
        className={`check ${isDone ? 'done' : ''}`}
        onClick={onCheck}
        aria-label={isDone ? 'Erledigt' : 'Als erledigt markieren'}
        disabled={busy || (isDone && !isAdmin && !canUndo)}
      >
        {isDone && <IconCheck />}
      </button>
      <div className="task-main">
        <div className="task-title-row">
          <span className="task-cat" aria-hidden="true">
            <AppIcon name={categoryIcon(task.category)} size={20} />
          </span>
          <button className={`task-title ${isDone ? 'done' : ''}`} onClick={() => openTask(task.id)}>
            {task.title}
          </button>

          {isAdmin && onEdit && !compact && (
            <button className="icon-btn" onClick={() => onEdit(task)} aria-label="Aufgabe bearbeiten" style={{ marginLeft: 'auto' }}>
              <IconEdit />
            </button>
          )}
        </div>
        {compact && (
          <div className="task-meta-compact">
            {assignees.length > 0 && (
              <span className="avatar-stack">
                {assignees.slice(0, 3).map((p) => (
                  <Avatar key={p.id} profile={p} size="sm" />
                ))}
              </span>
            )}
            {bonus && <span className="tag bonus">{task.bonus_points} P{task.bonus_status === 'pending' ? ' · wartet' : task.bonus_status === 'confirmed' ? ' ✓' : ''}</span>}
            {task.is_pool && !isDone && <span className="tag pool">Pool</span>}
            {!isDone && due && <span className={`tag ${ds === 'today' ? 'today' : ds === 'overdue' ? 'overdue' : ''}`}>{dueLabelShort(task.due_kind, task.due_date)}</span>}
            {settings.priorities_enabled && task.priority === 'urgent' && <span className="tag urgent">Dringend</span>}
            {settings.priorities_enabled && task.priority === 'important' && <span className="tag important">Wichtig</span>}
          </div>
        )}
        {!compact && task.description && <div className="task-desc">{task.description}</div>}
        {!compact && (
        <div className="task-meta">
          {bonus && <span className="tag bonus">{task.bonus_points} Punkte{task.bonus_status === 'pending' ? ' · Bonus wartet' : task.bonus_status === 'confirmed' ? ' · bestätigt' : task.bonus_status === 'rejected' ? ' · zurückgegeben' : ''}</span>}
          {task.is_pool && !isDone && <span className="tag pool">Familien-Pool</span>}
          {holdActive && task.is_pool && !isDone && <span className="tag">Bedenkzeit bis {new Date(task.pool_hold_until as string).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}{task.interested_ids.length ? ` · ${task.interested_ids.length} interessiert` : ''}</span>}
          {!isDone && due && <span className={`tag ${ds === 'today' ? 'today' : ds === 'overdue' ? 'overdue' : ''}`}>{due}</span>}
          {settings.priorities_enabled && task.priority !== 'none' && (
            <span className={`tag ${task.priority}`}>{priorityLabel(task.priority)}</span>
          )}
          {!compact && !isDone && task.reminder_type !== 'none' && (
            <span className="tag">
              <AppIcon name="bell" size={12} /> {reminderLabel(task)}
            </span>
          )}
          {!compact && task.recurrence !== 'none' && (
            <span className="tag">
              <AppIcon name="repeat" size={12} /> {recurrenceLabel(task.recurrence, task.recurrence_interval)}
            </span>
          )}
          {!compact && task.cost !== null && <span className="tag">{task.cost.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>}
          {!compact && task.link && (
            <a className="tag" href={task.link} target="_blank" rel="noreferrer">
              <AppIcon name="link" size={12} /> Link
            </a>
          )}
          {assignees.length > 0 && (
            <span className="assignees" style={{ marginLeft: 'auto' }}>
              {assignees.map((p) => (
                <span key={p.id} className="assignee">
                  <span className="dot" style={{ background: memberColor(p).dot }} />
                  <Avatar profile={p} size="sm" />
                </span>
              ))}
            </span>
          )}
        </div>
        )}
        {(isDone || showHistory) && task.completed_at && (
          <div className="task-desc small">
            Erledigt von {completer?.display_name ?? 'unbekannt'} am {formatDateTime(task.completed_at)}
            {task.status === 'archived' ? ' · archiviert' : ''}
          </div>
        )}
        {compact && showClaim && canInterest && (
          <div className="task-actions">
            <button className={`btn sm ${interested ? 'secondary' : ''}`} onClick={() => run(() => bonusInterest(task.id))} disabled={busy}>
              {interested ? 'Ich möchte ✓' : 'Ich möchte'}
            </button>
          </div>
        )}
        {compact && showClaim && canClaim && (
          <div className="task-actions">
            <button className="btn sm" onClick={() => run(() => claimTask(task.id))} disabled={busy}>
              {busy ? 'Übernehmen…' : 'Ich übernehme'}
            </button>
          </div>
        )}
        {!compact && !isDone && (canClaim || canInterest || (isAdmin && !task.is_pool)) && (
          <div className="task-actions">
            {canInterest && (
              <button className={`btn sm ${interested ? 'secondary' : ''}`} onClick={() => run(() => bonusInterest(task.id))} disabled={busy}>
                {interested ? 'Ich möchte ✓ (wird nach der Bedenkzeit verteilt)' : 'Ich möchte'}
              </button>
            )}
            {canClaim && (
              <button className="btn sm" onClick={() => run(() => claimTask(task.id))} disabled={busy}>
                {busy ? 'Übernehmen…' : 'Ich übernehme'}
              </button>
            )}
            {isAdmin && !task.is_pool && (
              <button className="btn sm secondary" onClick={() => setConfirmRelease(true)} disabled={busy}>
                Zurück in den Pool
              </button>
            )}
          </div>
        )}
        {!compact && isDone && (isAdmin || canUndo) && (
          <div className="task-actions">
            <button className="btn sm secondary" onClick={() => run(() => reopenTask(task.id))}>
              {isAdmin ? 'Wieder öffnen' : 'Rückgängig'}
            </button>
          </div>
        )}
      </div>
      {confirmRelease && (
        <ConfirmDialog
          title="Aufgabe wieder für alle freigeben?"
          text="Die Aufgabe geht zurück in den Familien-Pool."
          confirmLabel="Freigeben"
          onConfirm={() => run(() => releaseTask(task.id))}
          onCancel={() => setConfirmRelease(false)}
        />
      )}
    </div>
  )
}
