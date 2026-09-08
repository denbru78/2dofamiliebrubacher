import { useMemo } from 'react'
import type { View } from '../App'
import type { Task } from '../lib/types'
import { useStore } from '../lib/store'
import { dueState } from '../lib/dates'
import { Avatar } from '../components/Avatar'
import { ProgressCard } from '../components/ProgressCard'
import { TaskCard } from '../components/TaskCard'
import { IconChevron, IconPlus } from '../components/Icons'

interface Props {
  go: (v: View, personFilter?: string) => void
  onNew: () => void
  onEdit: (t: Task) => void
}

function relevance(t: Task): number {
  const ds = dueState(t.due_kind, t.due_date)
  let score = 0
  if (t.priority === 'urgent') score += 1000
  if (ds === 'overdue') score += 500
  if (ds === 'today') score += 400
  if (t.priority === 'important') score += 200
  if (ds === 'tomorrow') score += 100
  if (t.priority === 'normal') score += 50
  if (ds === 'soon') score += 20
  return score
}

export function StartPage({ go, onNew, onEdit }: Props) {
  const { profile, profiles, tasks, isAdmin, settings, achievements } = useStore()
  const open = useMemo(() => tasks.filter((t) => t.status === 'open' || t.status === 'claimed'), [tasks])
  const mine = open.filter((t) => profile && t.assignee_ids.includes(profile.id))
  const pool = open.filter((t) => t.is_pool)
  const important = useMemo(() => {
    const prio = settings.priorities_enabled
    return open
      .map((t) => ({ t, s: relevance(prio ? t : { ...t, priority: 'none' }) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (a.t.due_date ?? '9').localeCompare(b.t.due_date ?? '9'))
      .slice(0, 5)
      .map((x) => x.t)
  }, [open, settings.priorities_enabled])
  const countFor = (id: string) => open.filter((t) => t.assignee_ids.includes(id)).length
  const unlockedCount = achievements.length

  return (
    <div className="page">
      <div className="hero">
        <h1>Unsere Familie</h1>
        <p className="subtitle">
          {open.length === 0 ? 'Alles erledigt – wow!' : `${open.length} offene ${open.length === 1 ? 'Aufgabe' : 'Aufgaben'} · Gemeinsam mehr schaffen ♡`}
        </p>
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

      <div className="tiles">
        <button className="tile" onClick={() => go('tasks', profile?.id)}>
          <span className="tile-icon bg-blue">👤</span>
          <span className="tile-label">Meine Aufgaben</span>
          <span className="tile-sub">{mine.length} offen</span>
        </button>
        <button className="tile" onClick={() => go('pool')}>
          <span className="tile-icon bg-sage">🙋</span>
          <span className="tile-label">Familien-Pool</span>
          <span className="tile-sub">{pool.length} zu vergeben</span>
        </button>
        <button className="tile" onClick={() => go('tasks', 'all')}>
          <span className="tile-icon bg-coral">📋</span>
          <span className="tile-label">Alle Aufgaben</span>
          <span className="tile-sub">{open.length} offen</span>
        </button>
        <button className="tile" onClick={() => go('achievements')}>
          <span className="tile-icon bg-amber">🏆</span>
          <span className="tile-label">Erfolge</span>
          <span className="tile-sub">{unlockedCount} freigeschaltet</span>
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Jetzt wichtig</h2>
          <button className="link-btn" onClick={() => go('tasks', 'all')}>
            Alle anzeigen <IconChevron size={14} />
          </button>
        </div>
        {important.length === 0 ? (
          <div className="empty">
            <div className="empty-emoji">🌤️</div>
            Nichts Dringendes – genieß den Tag.
          </div>
        ) : (
          <div className="task-list">
            {important.map((t) => (
              <TaskCard key={t.id} task={t} compact onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Familien-Pool</h2>
            <div className="muted small">Aufgaben, die noch jemand übernehmen kann</div>
          </div>
          <button className="link-btn" onClick={() => go('pool')}>
            Alle anzeigen <IconChevron size={14} />
          </button>
        </div>
        {pool.length === 0 ? (
          <div className="empty">
            <div className="empty-emoji">🧺</div>
            Der Pool ist leer.
          </div>
        ) : (
          <div className="task-list">
            {pool.slice(0, 4).map((t) => (
              <TaskCard key={t.id} task={t} compact onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>

      <ProgressCard />
    </div>
  )
}
