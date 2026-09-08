import { useCallback, useState } from 'react'
import { useStore } from './lib/store'
import type { Task } from './lib/types'
import { BottomNav } from './components/BottomNav'
import { Toasts } from './components/Toasts'
import { TaskForm } from './components/TaskForm'
import { IconPlus } from './components/Icons'
import { LoginPage } from './pages/LoginPage'
import { StartPage } from './pages/StartPage'
import { TasksPage } from './pages/TasksPage'
import { PoolPage } from './pages/PoolPage'
import { AchievementsPage } from './pages/AchievementsPage'
import { ProfilePage } from './pages/ProfilePage'

export type View = 'start' | 'tasks' | 'pool' | 'achievements' | 'profile'

export default function App() {
  const { session, authLoading, profile, dataLoading, dataError, isAdmin, tasks, reload, signOut } = useStore()
  const [view, setView] = useState<View>('start')
  const [personFilter, setPersonFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)

  const go = useCallback((v: View, pf?: string) => {
    if (pf) setPersonFilter(pf)
    setView(v)
    window.scrollTo({ top: 0 })
  }, [])

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (t: Task) => {
    setEditing(t)
    setFormOpen(true)
  }
  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditing(null)
  }, [])

  if (authLoading) {
    return (
      <div className="loading">
        <span className="spinner" /> Lädt…
      </div>
    )
  }

  if (!session) {
    return (
      <>
        <LoginPage />
        <Toasts />
      </>
    )
  }

  if (dataLoading && !profile) {
    return (
      <div className="loading">
        <span className="spinner" /> Familie wird geladen…
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="login">
        <div className="login-card">
          <h2>Profil fehlt</h2>
          <p className="muted">{dataError ?? 'Für diesen Benutzer gibt es noch kein Familienprofil.'}</p>
          <p className="muted small">Bitte in Supabase den SQL-Block aus <strong>supabase/schema.sql</strong> ausführen und danach hier neu laden.</p>
          <button className="btn block" onClick={() => reload()} style={{ marginBottom: 8 }}>
            Neu laden
          </button>
          <button className="btn secondary block" onClick={signOut}>
            Abmelden
          </button>
        </div>
      </div>
    )
  }

  const poolCount = tasks.filter((t) => t.is_pool && (t.status === 'open' || t.status === 'claimed')).length

  return (
    <div className="app">
      {dataError && <div className="error">{dataError}</div>}
      {view === 'start' && <StartPage go={go} onNew={openNew} onEdit={openEdit} />}
      {view === 'tasks' && <TasksPage personFilter={personFilter} setPersonFilter={setPersonFilter} onEdit={openEdit} />}
      {view === 'pool' && <PoolPage onEdit={openEdit} />}
      {view === 'achievements' && <AchievementsPage />}
      {view === 'profile' && <ProfilePage />}

      {isAdmin && !formOpen && (
        <button className="fab" onClick={openNew} aria-label="Neue Aufgabe">
          <IconPlus /> Aufgabe
        </button>
      )}
      <BottomNav view={view} onChange={(v) => go(v)} poolCount={poolCount} />
      {formOpen && <TaskForm task={editing} onClose={closeForm} />}
      <Toasts />
    </div>
  )
}
