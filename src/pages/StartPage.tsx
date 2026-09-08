import { useEffect, useMemo, useState } from 'react'
import type { View } from '../App'
import type { Task } from '../lib/types'
import { useStore } from '../lib/store'
import { dueState } from '../lib/dates'
import { achievementView } from '../lib/achievements'
import { Avatar } from '../components/Avatar'
import { HeroIllustration } from '../components/HeroIllustration'
import { QuickCapture } from '../components/QuickCapture'
import { TaskCard } from '../components/TaskCard'
import { IconChevron, IconPlus } from '../components/Icons'
import { AppIcon } from '../components/AppIcon'
import { NotificationsSheet } from '../components/NotificationsSheet'
import { alreadyShown, dueReminders, markShown, showLocalNotification } from '../lib/reminders'
import { todayISO } from '../lib/dates'

interface Props {
  go: (v: View, personFilter?: string, urgentOnly?: boolean) => void
  onNew: () => void
  onEdit: (t: Task) => void
}

/** Ist die Aufgabe „heute wichtig“? (heute fällig, überfällig oder dringend) */
export function isImportantNow(t: Task, prioritiesEnabled: boolean): boolean {
  const ds = dueState(t.due_kind, t.due_date)
  return ds === 'today' || ds === 'overdue' || (prioritiesEnabled && t.priority === 'urgent')
}

function relevance(t: Task, prioritiesEnabled: boolean): number {
  const ds = dueState(t.due_kind, t.due_date)
  let score = 0
  if (prioritiesEnabled && t.priority === 'urgent') score += 1000
  if (ds === 'overdue') score += 500
  if (ds === 'today') score += 400
  if (prioritiesEnabled && t.priority === 'important') score += 200
  return score
}

export function StartPage({ go, onNew, onEdit }: Props) {
  const { profile, profiles, tasks, isAdmin, settings, achievements, weekProgress, profileById, unreadCount } = useStore()
  const [notifOpen, setNotifOpen] = useState(false)
  const prio = settings.priorities_enabled
  const open = useMemo(() => tasks.filter((t) => t.status === 'open' || t.status === 'claimed'), [tasks])
  const mine = useMemo(() => open.filter((t) => profile && t.assignee_ids.includes(profile.id)), [open, profile])
  const pool = useMemo(() => open.filter((t) => t.is_pool), [open])
  const important = useMemo(() => {
    const list = open.filter((t) => isImportantNow(t, prio))
    return list.sort((a, b) => relevance(b, prio) - relevance(a, prio) || (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
  }, [open, prio])

  const { done, goal } = weekProgress
  const pct = Math.min(100, Math.round((done / Math.max(1, goal)) * 100))
  const remaining = Math.max(0, goal - done)
  const progressText =
    done === 0
      ? 'Los geht’s – die Woche ist noch jung.'
      : done >= goal
        ? 'Wochenziel geschafft – stark gemacht!'
        : remaining <= 3
          ? `Nur noch ${remaining} bis zum Wochenziel`
          : pct >= 50
            ? 'Diese Woche schon richtig was geschafft'
            : 'Stark gemacht!'

  const latest = useMemo(() => {
    const sorted = achievements.slice().sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at))
    return sorted[0]
  }, [achievements])
  const latestDef = latest ? achievementView(latest) : undefined
  const latestWho = latest?.profile_id ? profileById(latest.profile_id) : undefined
  const goalReached = done >= goal

  const countFor = (id: string) => open.filter((t) => t.assignee_ids.includes(id)).length

  // Tageszusammenfassung + lokale Erinnerungen (einmal pro Tag, keine Flut)
  const myDueToday = useMemo(
    () => mine.filter((t) => ['today', 'overdue'].includes(dueState(t.due_kind, t.due_date))),
    [mine],
  )
  useEffect(() => {
    if (!profile || !settings.reminders_enabled) return
    const stamp = todayISO()
    const rem = dueReminders(tasks, profile.id).filter((t) => !alreadyShown(`r:${t.id}`, stamp))
    if (rem.length > 0) {
      showLocalNotification(rem.length === 1 ? 'Erinnerung' : `${rem.length} Erinnerungen`, rem.map((t) => t.title).join(' · '))
      rem.forEach((t) => markShown(`r:${t.id}`, stamp))
    }
    if (myDueToday.length > 0 && !alreadyShown('digest', stamp)) {
      showLocalNotification('Familien-Liste', `Heute ${myDueToday.length === 1 ? 'ist 1 Aufgabe' : `sind ${myDueToday.length} Aufgaben`} offen.`)
      markShown('digest', stamp)
    }
  }, [profile, settings.reminders_enabled, tasks, myDueToday])

  return (
    <div className="page">
      <div className="hero">
        <HeroIllustration />
        <button className="bell-btn" onClick={() => setNotifOpen(true)} aria-label="Mitteilungen">
          <AppIcon name="bell" size={20} />
          {unreadCount > 0 && <span className="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>
        <h1>Unser Plan</h1>
        <p className="subtitle">Gemeinsam mehr schaffen ♡</p>
        <div className="family-row">
          {profiles.map((p) => (
            <button key={p.id} className="family-member" onClick={() => go('tasks', p.id)}>
              <Avatar profile={p} size="lg" />
              <span className="name">{p.display_name}</span>
              <span className="count">{countFor(p.id)} offen</span>
            </button>
          ))}
          {isAdmin && (
            <button className="family-member add" onClick={onNew}>
              <span className="avatar lg">
                <IconPlus size={26} />
              </span>
              <span className="name">Aufgabe</span>
              <span className="count">hinzufügen</span>
            </button>
          )}
        </div>
      </div>

      {isAdmin && <QuickCapture />}

      {myDueToday.length > 0 && (
        <button className="digest-banner" onClick={() => setNotifOpen(true)}>
          <AppIcon name="sun" size={18} />
          <span>
            Heute {myDueToday.length === 1 ? 'ist 1 Aufgabe' : `sind ${myDueToday.length} Aufgaben`} für dich offen.
          </span>
        </button>
      )}

      <div className="card">
        <div className="card-head">
          <button className="card-title-btn" onClick={() => go('tasks', 'all', true)}>
            <h2>Heute wichtig</h2>
          </button>
          {important.length > 4 && (
            <button className="link-btn" onClick={() => go('tasks', 'all', true)}>
              Alle anzeigen <IconChevron size={14} />
            </button>
          )}
        </div>
        {important.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <AppIcon name="sun" size={30} />
            </div>
            Hier ist gerade nichts offen.
          </div>
        ) : (
          <div className="task-list">
            {important.slice(0, 4).map((t) => (
              <TaskCard key={t.id} task={t} compact onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <button className="card-title-btn" onClick={() => go('tasks', profile?.id)}>
            <h2>Meine Aufgaben</h2>
            <span className="muted small">{mine.length} offen</span>
          </button>
          {mine.length > 3 && (
            <button className="link-btn" onClick={() => go('tasks', profile?.id)}>
              Alle anzeigen <IconChevron size={14} />
            </button>
          )}
        </div>
        {mine.length === 0 ? (
          <div className="empty">Du hast heute schon alles geschafft.</div>
        ) : (
          <div className="task-list">
            {mine.slice(0, 3).map((t) => (
              <TaskCard key={t.id} task={t} compact onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <button className="card-title-btn" onClick={() => go('pool')}>
            <h2>Familien-Pool</h2>
            <span className="muted small">Aufgaben, die noch niemand übernommen hat</span>
          </button>
          {pool.length > 3 && (
            <button className="link-btn" onClick={() => go('pool')}>
              Alle anzeigen <IconChevron size={14} />
            </button>
          )}
        </div>
        {pool.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <AppIcon name="basket" size={30} />
            </div>
            Im Familien-Pool wartet aktuell keine Aufgabe.
          </div>
        ) : (
          <div className="task-list">
            {pool.slice(0, 3).map((t) => (
              <TaskCard key={t.id} task={t} compact showClaim onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>

      <button className={`card progress-card card-btn ${done >= goal && goal > 0 ? 'reached' : ''}`} onClick={() => go('achievements')}>
        <div className="card-head">
          <h2>Wochenfortschritt</h2>
          <span className="muted small">
            {done} von {goal} erledigt
          </span>
        </div>
        <div className="progress-bar" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={goal}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-foot">
          <span>{progressText}</span>
          <span className="pill">{done >= goal && goal > 0 ? 'Wochenziel geschafft' : `${pct} %`}</span>
        </div>
      </button>

      {settings.achievements_enabled && (
      <div className="card">
        <div className="card-head">
          <h2>Neu geschafft</h2>
          <button className="link-btn" onClick={() => go('achievements')}>
            Alle Erfolge ansehen <IconChevron size={14} />
          </button>
        </div>
        {latestDef ? (
          <div className="ach-inline">
            <span className="ach-icon">
              <AppIcon name={latestDef.icon} size={24} />
            </span>
            <div>
              <div style={{ fontWeight: 700 }}>{latestDef.title}</div>
              <div className="muted small">
                {latestWho ? `${latestWho.display_name} · ` : 'Gemeinsam · '}
                {latestDef.description}
              </div>
            </div>
          </div>
        ) : (
          <div className="muted small">Der erste Erfolg wartet – einfach eine Aufgabe abhaken.</div>
        )}
      </div>
      )}
      {notifOpen && <NotificationsSheet onClose={() => setNotifOpen(false)} />}
    </div>
  )
}
