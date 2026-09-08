import { useStore } from '../lib/store'
import { ACHIEVEMENT_DEFS } from '../lib/achievements'
import { Avatar } from '../components/Avatar'
import { formatDate, startOfWeek, weekKey } from '../lib/dates'
import { useMemo } from 'react'
import { IconBack } from '../components/Icons'
import { AppIcon } from '../components/AppIcon'

export function AchievementsPage({ onBack }: { onBack: () => void }) {
  const { achievements, profiles, profile, tasks, settings, weekProgress } = useStore()
  const doneTasks = useMemo(() => tasks.filter((t) => (t.status === 'done' || t.status === 'archived') && t.completed_at), [tasks])
  const doneTotal = doneTasks.length

  // Familienserie: aufeinanderfolgende Wochen mit erreichtem Wochenziel
  const streak = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of doneTasks) {
      const k = weekKey(new Date(t.completed_at as string))
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const goal = Math.max(1, settings.weekly_goal)
    let n = 0
    const cursor = startOfWeek(new Date())
    // Laufende Woche zählt nur, wenn das Ziel schon erreicht ist
    if ((counts.get(weekKey(cursor)) ?? 0) >= goal) n++
    cursor.setDate(cursor.getDate() - 7)
    for (let i = 0; i < 260; i++) {
      if ((counts.get(weekKey(cursor)) ?? 0) >= goal) n++
      else break
      cursor.setDate(cursor.getDate() - 7)
    }
    return n
  }, [doneTasks, settings.weekly_goal])
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

      <div className="stats-grid">
        <div className="stat">
          <span className="stat-value">{weekProgress.done}</span>
          <span className="stat-label">diese Woche erledigt</span>
        </div>
        <div className="stat">
          <span className="stat-value">{streak}</span>
          <span className="stat-label">{streak === 1 ? 'Woche' : 'Wochen'} in Folge Wochenziel</span>
        </div>
        <div className="stat">
          <span className="stat-value">{doneTotal}</span>
          <span className="stat-label">insgesamt geschafft</span>
        </div>
      </div>

      <h2 style={{ margin: '4px 0 10px' }}>Gemeinsam</h2>
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
