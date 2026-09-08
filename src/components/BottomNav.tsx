import type { ReactNode } from 'react'
import type { View } from '../App'
import { IconHome, IconList, IconPool, IconTrophy, IconUser } from './Icons'

interface Props {
  view: View
  onChange: (v: View) => void
  poolCount: number
}

export function BottomNav({ view, onChange, poolCount }: Props) {
  const items: { key: View; label: string; icon: ReactNode }[] = [
    { key: 'start', label: 'Start', icon: <IconHome /> },
    { key: 'tasks', label: 'Aufgaben', icon: <IconList /> },
    { key: 'pool', label: 'Pool', icon: <IconPool /> },
    { key: 'achievements', label: 'Erfolge', icon: <IconTrophy /> },
    { key: 'profile', label: 'Profil', icon: <IconUser /> },
  ]
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      <div className="bottom-nav-inner">
        {items.map((it) => (
          <button
            key={it.key}
            className={`nav-item ${view === it.key ? 'active' : ''}`}
            onClick={() => onChange(it.key)}
            aria-current={view === it.key ? 'page' : undefined}
          >
            <span className="nav-icon">{it.icon}</span>
            {it.key === 'pool' && poolCount > 0 && <span className="badge">{poolCount}</span>}
            <span>{it.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
