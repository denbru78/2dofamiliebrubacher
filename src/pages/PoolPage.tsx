import { useMemo } from 'react'
import type { Task } from '../lib/types'
import { useStore } from '../lib/store'
import { TaskCard } from '../components/TaskCard'
import { IconBack } from '../components/Icons'
import { AppIcon } from '../components/AppIcon'

interface Props {
  onEdit: (t: Task) => void
  onBack: () => void
}

export function PoolPage({ onEdit, onBack }: Props) {
  const { tasks } = useStore()
  const pool = useMemo(() => tasks.filter((t) => t.is_pool && (t.status === 'open' || t.status === 'claimed')), [tasks])

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>
        <IconBack /> Unser Plan
      </button>
      <div className="page-head">
        <div>
          <h1>Familien-Pool</h1>
          <p className="subtitle">Wer mag, übernimmt. {pool.length} {pool.length === 1 ? 'Aufgabe' : 'Aufgaben'} zu vergeben.</p>
        </div>
      </div>
      <div className="card">
        {pool.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <AppIcon name="basket" size={30} />
            </div>
            Im Familien-Pool wartet aktuell keine Aufgabe.
          </div>
        ) : (
          <div className="task-list">
            {pool.map((t) => (
              <TaskCard key={t.id} task={t} onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
