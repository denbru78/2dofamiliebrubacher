import { useMemo } from 'react'
import type { Task } from '../lib/types'
import { useStore } from '../lib/store'
import { TaskCard } from '../components/TaskCard'

interface Props {
  onEdit: (t: Task) => void
}

export function PoolPage({ onEdit }: Props) {
  const { tasks } = useStore()
  const pool = useMemo(() => tasks.filter((t) => t.is_pool && (t.status === 'open' || t.status === 'claimed')), [tasks])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Familien-Pool</h1>
          <p className="subtitle">Wer mag, übernimmt. {pool.length} {pool.length === 1 ? 'Aufgabe' : 'Aufgaben'} zu vergeben.</p>
        </div>
      </div>
      <div className="card">
        {pool.length === 0 ? (
          <div className="empty">
            <div className="empty-emoji">🧺</div>
            Gerade ist nichts im Pool.
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
