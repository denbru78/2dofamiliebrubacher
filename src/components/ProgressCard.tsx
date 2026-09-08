import { useStore } from '../lib/store'

export function ProgressCard() {
  const { weekProgress } = useStore()
  const { done, goal } = weekProgress
  const pct = Math.min(100, Math.round((done / Math.max(1, goal)) * 100))
  const msg =
    done === 0
      ? 'Los geht’s – die Woche ist noch jung.'
      : done >= goal
        ? 'Wochenziel geschafft!'
        : pct >= 50
          ? 'Stark gemacht! ☀️'
          : 'Gut dabei – weiter so.'
  return (
    <div className="card progress-card">
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
        <span>{msg}</span>
        <span className="pill">Gemeinsam klappt’s!</span>
      </div>
    </div>
  )
}
