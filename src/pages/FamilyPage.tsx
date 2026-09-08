import { useMemo, useState } from 'react'
import type { View } from '../App'
import type { Profile } from '../lib/types'
import { useStore } from '../lib/store'
import { Avatar } from '../components/Avatar'
import { MemberEditSheet } from '../components/MemberEditSheet'
import { IconChevron, IconEdit } from '../components/Icons'

interface Props {
  go: (v: View, personFilter?: string) => void
}

export function FamilyPage({ go }: Props) {
  const { allProfiles, tasks, isAdmin, achievements } = useStore()
  const [editing, setEditing] = useState<Profile | null>(null)
  const open = useMemo(() => tasks.filter((t) => t.status === 'open' || t.status === 'claimed'), [tasks])
  const done = useMemo(() => tasks.filter((t) => t.status === 'done' || t.status === 'archived'), [tasks])
  const pool = open.filter((t) => t.is_pool)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Familie</h1>
          <p className="subtitle">
            {done.length} Aufgaben gemeinsam geschafft · {achievements.length} Erfolge
          </p>
        </div>
      </div>

      <div className="card">
        {isAdmin && <div className="muted small" style={{ marginBottom: 8 }}>Als Elternteil kannst du Name, Avatar und Rolle aller Mitglieder ändern (Stift).</div>}
        {allProfiles.map((p) => {
          const mineOpen = open.filter((t) => t.assignee_ids.includes(p.id)).length
          const mineDone = done.filter((t) => t.completed_by === p.id).length
          return (
            <div key={p.id} className="member-row">
              <button className="member-main" onClick={() => go('tasks', p.id)}>
                <Avatar profile={p} size="md" />
                <span>
                  <span style={{ fontWeight: 700 }}>{p.display_name}</span>
                  <span className="muted small" style={{ display: 'block' }}>
                    {p.active === false ? 'Deaktiviert · ' : ''}{p.role === 'admin' ? 'Elternteil' : 'Mitglied'} · {mineOpen} offen · {mineDone} erledigt
                  </span>
                </span>
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  <IconChevron size={16} />
                </span>
              </button>
              {isAdmin && (
                <button className="icon-btn" onClick={() => setEditing(p)} aria-label={`${p.display_name} bearbeiten`}>
                  <IconEdit />
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

      {editing && <MemberEditSheet member={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
