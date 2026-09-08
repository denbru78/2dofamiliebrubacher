import { useMemo, useState } from 'react'
import type { View } from '../App'
import type { Profile } from '../lib/types'
import { useStore } from '../lib/store'
import { Avatar } from '../components/Avatar'
import { MemberEditSheet } from '../components/MemberEditSheet'
import { IconChevron } from '../components/Icons'

interface Props {
  go: (v: View, personFilter?: string) => void
}

export function FamilyPage({ go }: Props) {
  const { allProfiles, tasks, isAdmin, achievements, settings, familyName } = useStore()
  const [editing, setEditing] = useState<Profile | null>(null)
  const open = useMemo(() => tasks.filter((t) => t.status === 'open' || t.status === 'claimed'), [tasks])
  const done = useMemo(() => tasks.filter((t) => t.status === 'done' || t.status === 'archived'), [tasks])
  const pool = open.filter((t) => t.is_pool)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{familyName}</h1>
          <p className="subtitle">
            {done.length} Aufgaben gemeinsam geschafft{settings.achievements_enabled ? ` · ${achievements.length} Erfolge` : ''}
          </p>
        </div>
      </div>

      <div className="member-grid">
        {allProfiles.map((p) => {
          const mineOpen = open.filter((t) => t.assignee_ids.includes(p.id)).length
          const mineDone = done.filter((t) => t.completed_by === p.id).length
          const inactive = p.active === false
          return (
            <div key={p.id} className={`member-card ${inactive ? 'inactive' : ''}`}>
              <button className="member-card-main" onClick={() => go('tasks', p.id)}>
                <Avatar profile={p} size="xl" />
                <span className="member-name">{p.display_name}</span>
                <span className="member-open">
                  {mineOpen} {mineOpen === 1 ? 'Aufgabe' : 'Aufgaben'} offen
                </span>
                <span className="muted small">
                  {inactive ? 'Deaktiviert' : p.role === 'admin' ? 'Elternteil' : 'Mitglied'} · {mineDone} erledigt
                </span>
              </button>
              {isAdmin && (
                <button className="btn sm secondary block" onClick={() => setEditing(p)}>
                  Mitglied verwalten
                </button>
              )}
            </div>
          )
        })}
      </div>

      <button className="card card-btn" onClick={() => go('pool')}>
        <div className="card-head" style={{ marginBottom: 0 }}>
          <div>
            <h2>Familien-Pool</h2>
            <span className="muted small">{pool.length} {pool.length === 1 ? 'Aufgabe' : 'Aufgaben'} zu vergeben</span>
          </div>
          <span className="muted">
            <IconChevron size={16} />
          </span>
        </div>
      </button>

      {settings.achievements_enabled && (
        <button className="card card-btn" onClick={() => go('achievements')}>
          <div className="card-head" style={{ marginBottom: 0 }}>
            <div>
              <h2>Erfolge</h2>
              <span className="muted small">{achievements.length} freigeschaltet</span>
            </div>
            <span className="muted">
              <IconChevron size={16} />
            </span>
          </div>
        </button>
      )}

      {isAdmin && (
        <div className="muted small" style={{ padding: '4px 4px 0' }}>
          Neue Mitglieder legst du in Supabase unter Authentication → Users an (siehe README). Sie erscheinen hier automatisch.
        </div>
      )}

      {editing && <MemberEditSheet member={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
