import { useEffect, useMemo } from 'react'
import { useStore } from '../lib/store'
import { dueState, formatDateTime } from '../lib/dates'
import { dueReminders } from '../lib/reminders'
import { openWhatsApp } from '../lib/whatsapp'
import { AppIcon } from './AppIcon'
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
  const { profile, notifications, markNotificationsRead, tasks, openTask, settings, profileById } = useStore()

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

        {/* Tageszusammenfassung – eine Meldung statt vieler */}
        <div className="digest">
          <div className="digest-icon">
            <AppIcon name="sun" size={22} />
          </div>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>
              {todayOrOverdue.length === 0
                ? 'Heute ist nichts für dich fällig.'
                : `Heute ${todayOrOverdue.length === 1 ? 'ist 1 Aufgabe' : `sind ${todayOrOverdue.length} Aufgaben`} offen.`}
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

        {reminders.length > 0 && (
          <>
            <h2 style={{ margin: '14px 0 8px', fontSize: 16 }}>Erinnerungen</h2>
            {reminders.map((t) => (
              <button key={t.id} className="notif-row" onClick={() => { onClose(); openTask(t.id) }}>
                <span className="notif-icon">
                  <AppIcon name="bell" size={18} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: 'block' }}>{t.title}</span>
                  <span className="muted small">Erinnerung · {t.due_date ? `fällig ${new Date(`${t.due_date}T12:00:00`).toLocaleDateString('de-DE')}` : ''}</span>
                </span>
              </button>
            ))}
          </>
        )}

        <h2 style={{ margin: '14px 0 8px', fontSize: 16 }}>Neuigkeiten</h2>
        {notifications.length === 0 ? (
          <div className="muted small">Noch keine Mitteilungen.</div>
        ) : (
          notifications.slice(0, 30).map((n) => {
            const unread = !!profile && !n.read_by.includes(profile.id)
            const target = n.profile_id ? profileById(n.profile_id) : null
            return (
              <button key={n.id} className={`notif-row ${unread ? 'unread' : ''}`} onClick={() => { if (n.task_id) { onClose(); openTask(n.task_id) } }}>
                <span className="notif-icon">
                  <AppIcon name={TYPE_ICON[n.type] ?? 'bell'} size={18} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: 'block' }}>{n.title}</span>
                  {n.body && <span className="small" style={{ display: 'block', overflowWrap: 'anywhere' }}>{n.body}</span>}
                  <span className="muted small">
                    {formatDateTime(n.created_at)}
                    {target && target.id !== profile?.id ? ` · für ${target.display_name}` : ''}
                  </span>
                </span>
                {unread && <span className="dot" style={{ background: 'var(--sage)', marginLeft: 'auto' }} />}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
