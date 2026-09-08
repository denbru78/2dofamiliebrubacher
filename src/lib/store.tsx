import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Achievement, Activity, Profile, Settings, Task, TaskInput } from './types'
import { computeNewUnlocks, achievementDef } from './achievements'
import { resolveDueDate, startOfWeek } from './dates'

export interface ToastMsg {
  id: number
  text: string
  kind: 'success' | 'info' | 'error'
}

interface StoreValue {
  session: Session | null
  authLoading: boolean
  profile: Profile | null
  profiles: Profile[]
  settings: Settings
  tasks: Task[]
  activities: Activity[]
  achievements: Achievement[]
  dataLoading: boolean
  dataError: string | null
  isAdmin: boolean
  toasts: ToastMsg[]
  toast: (text: string, kind?: ToastMsg['kind']) => void
  reload: () => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  createTask: (input: TaskInput) => Promise<string | null>
  updateTask: (id: string, input: TaskInput) => Promise<string | null>
  deleteTask: (id: string) => Promise<string | null>
  completeTask: (id: string) => Promise<string | null>
  reopenTask: (id: string) => Promise<string | null>
  claimTask: (id: string) => Promise<string | null>
  releaseTask: (id: string) => Promise<string | null>
  archiveTask: (id: string) => Promise<string | null>
  updateProfile: (patch: { display_name?: string; avatar?: string }) => Promise<string | null>
  updateSettings: (patch: Partial<Pick<Settings, 'priorities_enabled' | 'weekly_goal'>>) => Promise<string | null>
  profileById: (id: string | null | undefined) => Profile | undefined
  weekProgress: { done: number; total: number; goal: number }
}

const StoreContext = createContext<StoreValue | null>(null)

const DEFAULT_SETTINGS: Settings = { family_id: '', priorities_enabled: true, weekly_goal: 10 }

function errMsg(e: unknown): string {
  if (!e) return 'Unbekannter Fehler'
  if (typeof e === 'string') return e
  if (typeof e === 'object' && e && 'message' in e) {
    const m = String((e as { message?: unknown }).message ?? '')
    if (m.includes('Keine Berechtigung') || m.includes('Nur Eltern') || m.includes('Mitglieder dürfen')) return 'Dafür fehlt dir die Berechtigung.'
    if (m.includes('Invalid login credentials')) return 'E-Mail oder Passwort ist falsch.'
    if (m.includes('Email not confirmed')) return 'Die E-Mail-Adresse ist noch nicht bestätigt.'
    if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Keine Verbindung. Bitte Internet prüfen.'
    return m
  }
  return 'Unbekannter Fehler'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [tasks, setTasks] = useState<Task[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const toastId = useRef(0)
  const unlockingRef = useRef(false)
  const attemptedRef = useRef<Set<string>>(new Set())

  const toast = useCallback((text: string, kind: ToastMsg['kind'] = 'success') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, text, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  // ---- Auth -------------------------------------------------------------
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setAuthLoading(false)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id ?? null

  // ---- Daten laden ------------------------------------------------------
  const reload = useCallback(async () => {
    if (!userId) return
    setDataError(null)
    try {
      const [pRes, sRes, tRes, aRes, achRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('settings').select('*').limit(1),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('task_activity').select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('achievements').select('*'),
      ])
      if (pRes.error) throw pRes.error
      if (sRes.error) throw sRes.error
      if (tRes.error) throw tRes.error
      if (aRes.error) throw aRes.error
      if (achRes.error) throw achRes.error

      const ps = (pRes.data ?? []) as Profile[]
      const me = ps.find((p) => p.id === userId) ?? null
      setProfiles(ps)
      setProfile(me)
      const s = (sRes.data ?? [])[0] as Settings | undefined
      setSettings(s ?? { ...DEFAULT_SETTINGS, family_id: me?.family_id ?? '' })
      setTasks((tRes.data ?? []) as Task[])
      setActivities((aRes.data ?? []) as Activity[])
      setAchievements((achRes.data ?? []) as Achievement[])
      if (!me) setDataError('Für diesen Benutzer gibt es noch kein Familienprofil. Bitte den SQL-Block in Supabase (erneut) ausführen.')
    } catch (e) {
      setDataError(errMsg(e))
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setProfiles([])
      setTasks([])
      setActivities([])
      setAchievements([])
      setSettings(DEFAULT_SETTINGS)
      return
    }
    setDataLoading(true)
    reload().finally(() => setDataLoading(false))
  }, [userId, reload])

  // Realtime + Aktualisierung beim Zurückkehren in die App
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('familie-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'achievements' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => reload())
      .subscribe()
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [userId, reload])

  // ---- Erfolge automatisch freischalten --------------------------------
  useEffect(() => {
    if (!profile || unlockingRef.current || dataLoading) return
    const unlocks = computeNewUnlocks(tasks, activities, profiles, settings, achievements)
    // Mitglieder dürfen nur eigene und Familien-Erfolge eintragen
    const allowed = unlocks
      .filter((u) => profile.role === 'admin' || u.profile_id === null || u.profile_id === profile.id)
      .filter((u) => !attemptedRef.current.has(`${u.key}:${u.profile_id ?? ''}`))
    if (allowed.length === 0) return
    for (const u of allowed) attemptedRef.current.add(`${u.key}:${u.profile_id ?? ''}`)
    unlockingRef.current = true
    ;(async () => {
      try {
        const rows = allowed.map((u) => ({ family_id: profile.family_id, profile_id: u.profile_id, key: u.key }))
        const { data, error } = await supabase.from('achievements').insert(rows).select('*')
        if (!error && data) {
          setAchievements((a) => [...a, ...(data as Achievement[])])
          for (const u of allowed) {
            if (u.profile_id === null || u.profile_id === profile.id) {
              const def = achievementDef(u.key)
              if (def) toast(`${def.emoji} Neuer Erfolg: ${def.title}`, 'info')
            }
          }
        } else if (error) {
          // Duplikat (z. B. gleichzeitig von einem anderen Gerät) – einfach neu laden
          await reload()
        }
      } finally {
        unlockingRef.current = false
      }
    })()
  }, [tasks, activities, profiles, settings, achievements, profile, dataLoading, toast, reload])

  // ---- Helfer -----------------------------------------------------------
  const isAdmin = profile?.role === 'admin'

  const profileById = useCallback((id: string | null | undefined) => profiles.find((p) => p.id === id), [profiles])

  const logActivity = useCallback(
    async (task_id: string | null, action: string, task_title: string) => {
      if (!profile) return
      const row: Omit<Activity, 'id' | 'created_at'> = { family_id: profile.family_id, task_id, actor_id: profile.id, action, task_title }
      const { data } = await supabase.from('task_activity').insert(row).select('*').single()
      if (data) setActivities((a) => [data as Activity, ...a])
    },
    [profile],
  )

  const applyTask = useCallback((t: Task) => {
    setTasks((all) => {
      const idx = all.findIndex((x) => x.id === t.id)
      if (idx === -1) return [t, ...all]
      const copy = all.slice()
      copy[idx] = t
      return copy
    })
  }, [])

  const patchTask = useCallback(
    async (id: string, patch: Partial<Task>): Promise<{ task?: Task; error?: string }> => {
      const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select('*').single()
      if (error) return { error: errMsg(error) }
      const t = data as Task
      applyTask(t)
      return { task: t }
    },
    [applyTask],
  )

  // ---- Auth-Aktionen ----------------------------------------------------
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? errMsg(error) : null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // ---- Aufgaben-Aktionen ------------------------------------------------
  const inputToRow = useCallback(
    (input: TaskInput) => {
      const assignees = input.assignee_ids.filter((id) => profiles.some((p) => p.id === id))
      const cost = input.cost.trim() === '' ? null : Number(input.cost.replace(',', '.'))
      return {
        title: input.title.trim(),
        description: input.description.trim() || null,
        link: input.link.trim() || null,
        cost: cost !== null && Number.isFinite(cost) ? cost : null,
        category: input.category || 'Sonstiges',
        priority: input.priority,
        due_kind: input.due_kind === 'date' && !input.due_date ? 'none' : input.due_kind,
        due_date: resolveDueDate(input.due_kind, input.due_date),
        assignee_ids: assignees,
        is_pool: assignees.length === 0,
        recurrence: input.recurrence,
      }
    },
    [profiles],
  )

  const createTask = useCallback(
    async (input: TaskInput) => {
      if (!profile) return 'Nicht angemeldet.'
      if (!input.title.trim()) return 'Bitte einen Titel eingeben.'
      const row = { ...inputToRow(input), family_id: profile.family_id, status: 'open' as const }
      const { data, error } = await supabase.from('tasks').insert(row).select('*').single()
      if (error) return errMsg(error)
      const t = data as Task
      applyTask(t)
      await logActivity(t.id, 'created', t.title)
      return null
    },
    [profile, inputToRow, applyTask, logActivity],
  )

  const updateTask = useCallback(
    async (id: string, input: TaskInput) => {
      if (!input.title.trim()) return 'Bitte einen Titel eingeben.'
      const old = tasks.find((t) => t.id === id)
      const row = inputToRow(input)
      // Wenn eine Pool-Aufgabe jemandem zugewiesen wird (oder umgekehrt), Status anpassen
      let status = old?.status ?? 'open'
      if (status === 'claimed' && row.is_pool) status = 'open'
      const { task, error } = await patchTask(id, { ...row, status })
      if (error) return error
      if (task) await logActivity(task.id, 'updated', task.title)
      return null
    },
    [tasks, inputToRow, patchTask, logActivity],
  )

  const deleteTask = useCallback(
    async (id: string) => {
      const old = tasks.find((t) => t.id === id)
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) return errMsg(error)
      setTasks((all) => all.filter((t) => t.id !== id))
      await logActivity(null, 'deleted', old?.title ?? '')
      return null
    },
    [tasks, logActivity],
  )

  const completeTask = useCallback(
    async (id: string) => {
      const { task, error } = await patchTask(id, { status: 'done' })
      if (error) return error
      if (task) {
        toast('Geschafft! 🎉')
        await logActivity(task.id, 'done', task.title)
      }
      return null
    },
    [patchTask, logActivity, toast],
  )

  const reopenTask = useCallback(
    async (id: string) => {
      const { task, error } = await patchTask(id, { status: 'open' })
      if (error) return error
      if (task) {
        toast('Wieder geöffnet', 'info')
        await logActivity(task.id, 'reopened', task.title)
      }
      return null
    },
    [patchTask, logActivity, toast],
  )

  const claimTask = useCallback(
    async (id: string) => {
      if (!profile) return 'Nicht angemeldet.'
      const { task, error } = await patchTask(id, { is_pool: false, status: 'claimed', assignee_ids: [profile.id] })
      if (error) return error
      if (task) {
        toast('Übernommen – viel Erfolg!', 'info')
        await logActivity(task.id, 'claimed', task.title)
      }
      return null
    },
    [profile, patchTask, logActivity, toast],
  )

  const releaseTask = useCallback(
    async (id: string) => {
      const { task, error } = await patchTask(id, { is_pool: true, status: 'open', assignee_ids: [] })
      if (error) return error
      if (task) {
        toast('Zurück im Familien-Pool', 'info')
        await logActivity(task.id, 'released', task.title)
      }
      return null
    },
    [patchTask, logActivity, toast],
  )

  const archiveTask = useCallback(
    async (id: string) => {
      const { task, error } = await patchTask(id, { status: 'archived' })
      if (error) return error
      if (task) await logActivity(task.id, 'archived', task.title)
      return null
    },
    [patchTask, logActivity],
  )

  const updateProfile = useCallback(
    async (patch: { display_name?: string; avatar?: string }) => {
      if (!profile) return 'Nicht angemeldet.'
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', profile.id).select('*').single()
      if (error) return errMsg(error)
      const p = data as Profile
      setProfile(p)
      setProfiles((all) => all.map((x) => (x.id === p.id ? p : x)))
      return null
    },
    [profile],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Pick<Settings, 'priorities_enabled' | 'weekly_goal'>>) => {
      if (!profile) return 'Nicht angemeldet.'
      const { data, error } = await supabase
        .from('settings')
        .upsert({ family_id: profile.family_id, ...patch, updated_at: new Date().toISOString() })
        .select('*')
        .single()
      if (error) return errMsg(error)
      setSettings(data as Settings)
      return null
    },
    [profile],
  )

  // ---- Wochenfortschritt ------------------------------------------------
  const weekProgress = useMemo(() => {
    const ws = startOfWeek().getTime()
    const done = tasks.filter(
      (t) => (t.status === 'done' || t.status === 'archived') && t.completed_at && new Date(t.completed_at).getTime() >= ws,
    ).length
    const open = tasks.filter((t) => t.status === 'open' || t.status === 'claimed').length
    return { done, total: done + open, goal: settings.weekly_goal }
  }, [tasks, settings.weekly_goal])

  const value: StoreValue = {
    session,
    authLoading,
    profile,
    profiles,
    settings,
    tasks,
    activities,
    achievements,
    dataLoading,
    dataError,
    isAdmin,
    toasts,
    toast,
    reload,
    signIn,
    signOut,
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    reopenTask,
    claimTask,
    releaseTask,
    archiveTask,
    updateProfile,
    updateSettings,
    profileById,
    weekProgress,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore außerhalb des StoreProvider verwendet')
  return ctx
}
