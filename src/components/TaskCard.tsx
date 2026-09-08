import type { Task } from '../lib/types'
import { useStore } from '../lib/store'
import { categoryEmoji, priorityLabel } from '../lib/constants'
import { dueLabel, dueState, formatDateTime } from '../lib/dates'
import { Avatar } from './Avatar'
import { IconCheck, IconEdit } from './Icons'

interface Props {
  task: Task
  onEdit?: (task: Task) => void
  compact?: boolean
  showHistory?: boolean
}

export function TaskCard({ task, onEdit, compact = false, showHistory = false }: Props) {
  const { profile, isAdmin, settings, profileById, completeTask, reopenTask, claimTask, releaseTask, toast } = useStore()
  const isDone = task.status === 'done' || task.status === 'archived'
  const isMine = !!profile && task.assignee_ids.includes(profile.id)
  const canComplete = !isDone && (isAdmin || isMine)
  const canClaim = !isDone && task.is_pool
  const assignees = task.assignee_ids.map((id) => profileById(id)).filter((p): p is NonNullable<typeof p> => !!p)
  const ds = dueState(task.due_kind, task.due_date)
  const due = dueLabel(task.due_kind, task.due_date)

  const run = async (fn: () => Promise<string | null>) => {
    const err = await fn()
    if (err) toast(err, 'error')
  }

  const onCheck = () => {
    if (isDone) {
      if (isAdmin) run(() => reopenTask(task.id))
      return
    }
    if (canComplete) run(() => completeTask(task.id))
    else if (canClaim) toast('Bitte zuerst „Ich übernehme“ antippen.', 'info')
    else toast('Diese Aufgabe gehört jemand anderem.', 'info')
  }

  const completer = profileById(task.completed_by)

  return (
    <div className="task-row">
      <button
        className={`check ${isDone ? 'done' : ''}`}
        onClick={onCheck}
        aria-label={isDone ? 'Erledigt' : 'Als erledigt markieren'}
        disabled={isDone && !isAdmin}
      >
        {isDone && <IconCheck />}
      </button>
      <div className="task-main">
        <div className="task-title-row">
          <span className="task-cat" aria-hidden="true">
            {categoryEmoji(task.category)}
          </span>
          <span className={`task-title ${isDone ? 'done' : ''}`}>{task.title}</span>
          {isAdmin && onEdit && (
            <button className="icon-btn" onClick={() => onEdit(task)} aria-label="Aufgabe bearbeiten" style={{ marginLeft: 'auto' }}>
              <IconEdit />
            </button>
          )}
        </div>
        {!compact && task.description && <div className="task-desc">{task.description}</div>}
        <div className="task-meta">
          {task.is_pool && !isDone && <span className="tag pool">Familien-Pool</span>}
          {!isDone && due && <span className={`tag ${ds === 'today' ? 'today' : ds === 'overdue' ? 'overdue' : ''}`}>{due}</span>}
          {settings.priorities_enabled && task.priority !== 'none' && (
            <span className={`tag ${task.priority}`}>{priorityLabel(task.priority)}</span>
          )}
          {!compact && task.recurrence !== 'none' && <span className="tag">↻ {task.recurrence === 'daily' ? 'täglich' : task.recurrence === 'weekly' ? 'wöchentlich' : 'monatlich'}</span>}
          {!compact && task.cost !== null && <span className="tag">{task.cost.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>}
          {!compact && task.link && (
            <a className="tag" href={task.link} target="_blank" rel="noreferrer">
              🔗 Link
            </a>
          )}
          {assignees.length > 0 && (
            <span className="avatar-stack" style={{ marginLeft: 'auto' }}>
              {assignees.map((p) => (
                <Avatar key={p.id} profile={p} size="sm" />
              ))}
            </span>
          )}
        </div>
        {(isDone || showHistory) && task.completed_at && (
          <div className="task-desc small">
            Erledigt von {completer?.display_name ?? 'unbekannt'} am {formatDateTime(task.completed_at)}
          </div>
        )}
        {!compact && !isDone && (canClaim || (isAdmin && !task.is_pool)) && (
          <div className="task-actions">
            {canClaim && (
              <button className="btn sm" onClick={() => run(() => claimTask(task.id))}>
                Ich übernehme
              </button>
            )}
            {isAdmin && !task.is_pool && (
              <button className="btn sm secondary" onClick={() => run(() => releaseTask(task.id))}>
                Zurück in den Pool
              </button>
            )}
          </div>
        )}
        {!compact && isDone && isAdmin && (
          <div className="task-actions">
            <button className="btn sm secondary" onClick={() => run(() => reopenTask(task.id))}>
              Wieder öffnen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
