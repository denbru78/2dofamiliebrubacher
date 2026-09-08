import { useCallback, useState } from 'react'
import { useStore } from './lib/store'
import type { Task } from './lib/types'
import { BottomNav } from './components/BottomNav'
import { Toasts } from './components/Toasts'
import { TaskForm } from './components/TaskForm'
import { TaskDetail } from './components/TaskDetail'
import { IconPlus } from './components/Icons'
import { LoginPage } from './pages/LoginPage'
import { StartPage } from './pages/StartPage'
import { TasksPage } from './pages/TasksPage'
import { PoolPage } from './pages/PoolPage'
import { AchievementsPage } from './pages/AchievementsPage'
import { FamilyPage } from './pages/FamilyPage'
import { SettingsPage } from './pages/SettingsPage'

export type View = 'start' | 'tasks' | 'pool' | 'achievements' | 'family' | 'settings'

export default function App() {
  const { session, authLoading, profile, dataLoading, dataError, isAdmin, reload, signOut, tasks, detailTaskId, closeTask } = useStore()
  const [view, setView] = useState<View>('start')
  const [personFilter, setPersonFilter] = useState('all')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)

  const go = useCallback((v: View, pf?: string, urgent?: boolean) => {
    if (pf) setPersonFilter(pf)
    if (v === 'tasks') setUrgentOnly(!!urgent)
    setView(v)
    window.scrollTo({ top: 0 })
  }, [])

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (t: Task) => {
    closeTask()
    setEditing(t)
    setFormOpen(true)
  }
  const detailTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) ?? null : null
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

  if (profile && profile.active === false) {
    return (
      <div className="login">
        <div className="login-card">
          <h2>Konto deaktiviert</h2>
          <p className="muted">Dieses Familienmitglied wurde von Mama oder Papa deaktiviert.</p>
          <button className="btn secondary block" onClick={signOut}>
            Abmelden
          </button>
        </div>
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

  return (
    <div className="app">
      {dataError && <div className="error">{dataError}</div>}
      {view === 'start' && <StartPage go={go} onNew={openNew} onEdit={openEdit} />}
      {view === 'tasks' && (
        <TasksPage personFilter={personFilter} setPersonFilter={setPersonFilter} urgentOnly={urgentOnly} setUrgentOnly={setUrgentOnly} onEdit={openEdit} />
      )}
      {view === 'pool' && <PoolPage onEdit={openEdit} onBack={() => go('start')} />}
      {view === 'achievements' && <AchievementsPage onBack={() => go('start')} />}
      {view === 'family' && <FamilyPage go={go} />}
      {view === 'settings' && <SettingsPage />}

      {isAdmin && !formOpen && (
        <button className="fab" onClick={openNew} aria-label="Neue Aufgabe">
          <IconPlus /> Aufgabe
        </button>
      )}
      <BottomNav view={view} onChange={(v) => go(v)} />
      {detailTask && !formOpen && <TaskDetail task={detailTask} onClose={closeTask} onEdit={openEdit} />}
      {formOpen && <TaskForm task={editing} onClose={closeForm} onGoToTasks={() => go('tasks', 'all')} />}
      <Toasts />
    </div>
  )
}
