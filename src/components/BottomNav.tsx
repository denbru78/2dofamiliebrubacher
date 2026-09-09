import type { ReactNode } from 'react'
import type { View } from '../App'
import { AppIcon } from './AppIcon'

interface Props {
  view: View
  onChange: (v: View) => void
}

export function BottomNav({ view, onChange }: Props) {
  const items: { key: View; label: string; icon: ReactNode; matches: View[] }[] = [
    { key: 'start', label: 'Unser Plan', icon: <AppIcon name="home" />, matches: ['start', 'pool', 'achievements'] },
    { key: 'tasks', label: 'Aufgaben', icon: <AppIcon name="clipboard" />, matches: ['tasks'] },
    { key: 'family', label: 'Familie', icon: <AppIcon name="family" />, matches: ['family', 'bonus'] },
    { key: 'settings', label: 'Einstellungen', icon: <AppIcon name="gear" />, matches: ['settings'] },
  ]
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      <div className="bottom-nav-inner">
        {items.map((it) => {
          const active = it.matches.includes(view)
          return (
            <button key={it.key} className={`nav-item ${active ? 'active' : ''}`} onClick={() => onChange(it.key)} aria-current={active ? 'page' : undefined}>
              <span className="nav-icon">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
