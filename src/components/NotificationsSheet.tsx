import { useEffect, useMemo, useState } from 'react'
import type { Notification } from '../lib/types'
import { useStore } from '../lib/store'
import { dueState, formatDateTime } from '../lib/dates'
import { dueReminders } from '../lib/reminders'
import { openWhatsApp } from '../lib/whatsapp'
import { AppIcon } from './AppIcon'
import { Avatar } from './Avatar'
import { IconX } from './Icons'

interface Props {
  onClose: () => void
}

const TYPE_ICON: Record<string, string> = {
  assigned: 'clipboard',
  claimed: 'hand',
  weekly_goal: 'trophy',
  due_today: 'calendar',
  overdue: 'flag',
  digest: 'sun',
}

export function NotificationsSheet({ onClose }: Props) {
  const { profile, isAdmin, notifications, markNotificationsRead, tasks, openTask, settings, profileById } = useStore()
  const [showOthers, setShowOthers] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => markNotificationsRead(), 1500)
    return () => window.clearTimeout(t)
  }, [markNotificationsRead])

  const mine = useMemo(
    () => (profile ? tasks.filter((t) => (t.status === 'open' || t.status === 'claimed') && t.assignee_ids.includes(profile.id)) : []),
    [tasks, profile],
  )
  const todayOrOverdue = mine.filter((t) => ['today', 'overdue'].includes(dueState(t.due_kind, t.due_date)))
  const overdue = todayOrOverdue.filter((t) => dueState(t.due_kind, t.due_date) === 'overdue')
  const reminders = profile && settings.reminders_enabled ? dueReminders(tasks, profile.id) : []

  const digestText = () => {
    const lines = todayOrOverdue.map((t) => `• ${t.title}${dueState(t.due_kind, t.due_date) === 'overdue' ? ' (überfällig)' : ''}`)
    return `Unser Plan – heute ${todayOrOverdue.length === 1 ? 'ist 1 Aufgabe' : `sind ${todayOrOverdue.length} Aufgaben`} offen:\n${lines.join('\n')}\n${window.location.origin}`
  }

  // Gruppen: für mich · für die Familie · an andere (nur Eltern, eingeklappt); ungelesen zuerst, dann nach Zeit
  const sortNotifs = (list: Notification[]) =>
    list.slice().sort((a, b) => {
      const ua = profile && !a.read_by.includes(profile.id) ? 0 : 1
      const ub = profile && !b.read_by.includes(profile.id) ? 0 : 1
      return ua - ub || b.created_at.localeCompare(a.created_at)
    })
  const forMe = sortNotifs(notifications.filter((n) => profile && n.profile_id === profile.id))
  const forFamily = sortNotifs(notifications.filter((n) => n.profile_id === null))
  const forOthers = sortNotifs(notifications.filter((n) => n.profile_id && profile && n.profile_id !== profile.id))

  const row = (n: Notification, showTarget: boolean) => {
    const unread = !!profile && !n.read_by.includes(profile.id) && (n.profile_id === null || n.profile_id === profile.id)
    const target = n.profile_id ? profileById(n.profile_id) : null
    const task = n.task_id ? tasks.find((t) => t.id === n.task_id) : undefined
    const actorAvatars = task && !task.is_pool ? task.assignee_ids.map((id) => profileById(id)).filter((p): p is NonNullable<typeof p> => !!p) : []
    return (
      <button key={n.id} className={`notif-row ${unread ? 'unread' : ''}`} onClick={() => { if (n.task_id) { onClose(); openTask(n.task_id) } }}>
        <span className="notif-icon">
          <AppIcon name={TYPE_ICON[n.type] ?? 'bell'} size={18} />
        </span>
        <span style={{ minWidth: 0, flex: '1 1 auto' }}>
          <span style={{ fontWeight: 600, display: 'block' }}>{n.title}</span>
          {n.body && <span className="small" style={{ display: 'block', overflowWrap: 'anywhere' }}>{n.body}</span>}
          <span className="muted small">
            {formatDateTime(n.created_at)}
            {showTarget && target ? ` · für ${target.display_name}` : ''}
          </span>
        </span>
        <span className="assignees">
          {showTarget && target ? <Avatar profile={target} size="sm" /> : actorAvatars.slice(0, 3).map((p) => <Avatar key={p.id} profile={p} size="sm" />)}
        </span>
        {unread && <span className="dot" style={{ background: 'var(--sage)' }} />}
      </button>
    )
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Mitteilungen" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2>Mitteilungen</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <IconX />
          </button>
        </div>

        <div className="digest">
          <div className="digest-icon">
            <AppIcon name="sun" size={22} />
          </div>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>
              {todayOrOverdue.length === 0
                ? 'Heute ist nichts für dich fällig.'
                : `Heute ${todayOrOverdue.length === 1 ? 'ist 1 Aufgabe' : `sind ${todayOrOverdue.length} Aufgaben`} für dich offen.`}
            </div>
            {overdue.length > 0 && (
              <div className="small" style={{ color: 'var(--prio-urgent)' }}>
                {overdue.length === 1 ? '1 davon ist überfällig' : `${overdue.length} davon sind überfällig`}
              </div>
            )}
            {todayOrOverdue.length > 0 && (
              <div className="task-actions" style={{ marginTop: 8 }}>
                <button className="btn sm secondary" onClick={() => openWhatsApp(null, digestText())}>
                  Per WhatsApp teilen
                </button>
              </div>
            )}
          </div>
        </div>

        <h2 style={{ margin: '16px 0 6px', fontSize: 16 }}>Für mich</h2>
        {reminders.map((t) => (
          <button key={`r-${t.id}`} className="notif-row unread" onClick={() => { onClose(); openTask(t.id) }}>
            <span className="notif-icon">
              <AppIcon name="bell" size={18} />
            </span>
            <span style={{ minWidth: 0, flex: '1 1 auto' }}>
              <span style={{ fontWeight: 600, display: 'block' }}>{t.title}</span>
              <span className="muted small">Erinnerung · {t.due_date ? `fällig ${new Date(`${t.due_date}T12:00:00`).toLocaleDateString('de-DE')}` : ''}</span>
            </span>
          </button>
        ))}
        {forMe.length === 0 && reminders.length === 0 ? <div className="muted small">Nichts Neues für dich.</div> : forMe.slice(0, 20).map((n) => row(n, false))}

        <h2 style={{ margin: '16px 0 6px', fontSize: 16 }}>Für die Familie</h2>
        {forFamily.length === 0 ? <div className="muted small">Noch keine Familien-Mitteilungen.</div> : forFamily.slice(0, 15).map((n) => row(n, false))}

        {isAdmin && forOthers.length > 0 && (
          <>
            <button className="link-btn" style={{ margin: '14px 0 4px', padding: 0 }} onClick={() => setShowOthers(!showOthers)}>
              {showOthers ? '▾' : '▸'} An andere zugewiesen ({forOthers.length})
            </button>
            {showOthers && forOthers.slice(0, 20).map((n) => row(n, true))}
            {showOthers && <div className="muted small" style={{ marginTop: 4 }}>Nur zur Info – diese Mitteilungen zählen nicht an deiner Glocke.</div>}
          </>
        )}
      </div>
    </div>
  )
}
