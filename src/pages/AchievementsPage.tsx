import { useStore } from '../lib/store'
import { ACHIEVEMENT_DEFS } from '../lib/achievements'
import { Avatar } from '../components/Avatar'
import { formatDate } from '../lib/dates'
import { IconBack } from '../components/Icons'

export function AchievementsPage({ onBack }: { onBack: () => void }) {
  const { achievements, profiles, profile, tasks } = useStore()
  const doneTotal = tasks.filter((t) => t.status === 'done' || t.status === 'archived').length
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

      <h2 style={{ margin: '4px 0 10px' }}>Gemeinsam</h2>
      <div className="ach-grid" style={{ marginBottom: 20 }}>
        {family.map((d) => {
          const u = familyUnlocked(d.key)
          return (
            <div key={d.key} className={`ach ${u ? '' : 'locked'}`}>
              <span className="ach-emoji">{d.emoji}</span>
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
              <span className="ach-emoji">{d.emoji}</span>
              <span className="ach-title">
                {d.title}
                {mine ? ' ✓' : ''}
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
