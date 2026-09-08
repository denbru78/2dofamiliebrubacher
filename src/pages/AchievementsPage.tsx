import { useStore } from '../lib/store'
import { ACHIEVEMENT_DEFS, weeklyStats } from '../lib/achievements'
import { Avatar } from '../components/Avatar'
import { formatDate } from '../lib/dates'
import { useMemo } from 'react'
import { IconBack } from '../components/Icons'
import { AppIcon } from '../components/AppIcon'

export function AchievementsPage({ onBack }: { onBack: () => void }) {
  const { achievements, profiles, profile, tasks, weeklyResults, weekProgress } = useStore()
  const doneTasks = useMemo(() => tasks.filter((t) => (t.status === 'done' || t.status === 'archived') && t.completed_at), [tasks])
  const doneTotal = doneTasks.length

  const { reachedCount, streak } = useMemo(() => weeklyStats(weeklyResults), [weeklyResults])
  const personal = ACHIEVEMENT_DEFS.filter((d) => d.scope === 'personal')
  const family = ACHIEVEMENT_DEFS.filter((d) => d.scope === 'family')

  const unlockedBy = (key: string) => achievements.filter((a) => a.key === key && a.profile_id).map((a) => a.profile_id as string)
  const familyUnlocked = (key: string) => achievements.find((a) => a.key === key && !a.profile_id)

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>
        <IconBack /> Unser Plan
      </button>
      <div className="page-head">
        <div>
          <h1>Erfolge</h1>
          <p className="subtitle">{doneTotal} Aufgaben hat die Familie schon geschafft.</p>
        </div>
      </div>

      <div className="stats-grid four">
        <div className="stat">
          <span className="stat-value">{weekProgress.done}</span>
          <span className="stat-label">diese Woche erledigt</span>
        </div>
        <div className="stat">
          <span className="stat-value">{streak}</span>
          <span className="stat-label">{streak === 1 ? 'Woche' : 'Wochen'} in Folge Wochenziel</span>
        </div>
        <div className="stat">
          <span className="stat-value">{reachedCount}</span>
          <span className="stat-label">Wochenziele insgesamt</span>
        </div>
        <div className="stat">
          <span className="stat-value">{doneTotal}</span>
          <span className="stat-label">insgesamt geschafft</span>
        </div>
      </div>

      <div className="progress-card card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h2>Diese Woche</h2>
          <span className="muted small">
            {weekProgress.done} von {weekProgress.goal}
          </span>
        </div>
        <div className="progress-bar" role="progressbar" aria-valuenow={weekProgress.done} aria-valuemin={0} aria-valuemax={weekProgress.goal}>
          <span style={{ width: `${Math.min(100, Math.round((weekProgress.done / Math.max(1, weekProgress.goal)) * 100))}%` }} />
        </div>
        <div className="muted small">Montag bis Sonntag · jede erledigte Aufgabe zählt einen Punkt · gemeinsam, ohne Rangliste</div>
      </div>

      <h2 style={{ margin: '4px 0 10px' }}>Gemeinsam geschafft</h2>
      <div className="ach-grid" style={{ marginBottom: 20 }}>
        {family.map((d) => {
          const u = familyUnlocked(d.key)
          return (
            <div key={d.key} className={`ach ${u ? '' : 'locked'}`}>
              <span className="ach-icon">
                <AppIcon name={d.emoji} size={24} />
              </span>
              <span className="ach-title">{d.title}</span>
              <span className="ach-desc">{d.description}</span>
              {u && <span className="muted small ach-people">Erreicht am {formatDate(u.unlocked_at)}</span>}
            </div>
          )
        })}
      </div>

      <h2 style={{ margin: '4px 0 10px' }}>Jede und jeder</h2>
      <div className="ach-grid">
        {personal.map((d) => {
          const ids = unlockedBy(d.key)
          const mine = !!profile && ids.includes(profile.id)
          return (
            <div key={d.key} className={`ach ${ids.length ? '' : 'locked'}`}>
              <span className="ach-icon">
                <AppIcon name={d.emoji} size={24} />
              </span>
              <span className="ach-title">
                {d.title}
                {mine && (
                  <span className="ach-mine">
                    <AppIcon name="check" size={14} />
                  </span>
                )}
              </span>
              <span className="ach-desc">{d.description}</span>
              {mine && (() => {
                const a = achievements.find((x) => x.key === d.key && x.profile_id === profile?.id)
                return a ? <span className="muted small">Erreicht am {formatDate(a.unlocked_at)}</span> : null
              })()}
              <span className="avatar-stack ach-people">
                {ids.map((id) => {
                  const p = profiles.find((x) => x.id === id)
                  return p ? <Avatar key={id} profile={p} size="sm" /> : null
                })}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
