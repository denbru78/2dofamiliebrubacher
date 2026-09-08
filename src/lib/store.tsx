import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Achievement, Activity, Category, Invite, InvitePreview, Notification, Profile, Role, Settings, Task, TaskInput, WeeklyResult } from './types'
import { clearPendingInvite, getPendingInvite } from './invites'
import { computeNewUnlocks } from './achievements'
import { CATEGORIES, categoryEmoji } from './constants'
import { nextDueDate, resolveDueDate, startOfWeek } from './dates'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastMsg {
  id: number
  text: string
  kind: 'success' | 'info' | 'error'
  action?: ToastAction
}

interface StoreValue {
  session: Session | null
  authLoading: boolean
  profile: Profile | null
  familyName: string
  updateFamilyName: (name: string) => Promise<string | null>
  notifications: Notification[]
  unreadCount: number
  markNotificationsRead: (ids?: string[]) => Promise<void>
  detailTaskId: string | null
  openTask: (id: string) => void
  closeTask: () => void
  profiles: Profile[]
  allProfiles: Profile[]
  settings: Settings
  categories: Category[]
  allCategories: Category[]
  categoryIcon: (name: string) => string
  addCategory: (name: string, icon: string) => Promise<string | null>
  updateCategory: (id: string, patch: Partial<Pick<Category, 'name' | 'icon' | 'sort_order' | 'is_active'>>) => Promise<string | null>
  deleteCategory: (id: string) => Promise<string | null>
  tasks: Task[]
  activities: Activity[]
  achievements: Achievement[]
  weeklyResults: WeeklyResult[]
  dataLoading: boolean
  dataError: string | null
  isAdmin: boolean
  toasts: ToastMsg[]
  toast: (text: string, kind?: ToastMsg['kind'], action?: ToastAction) => void
  reload: () => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirm: boolean }>
  invitePreview: (token: string) => Promise<InvitePreview>
  acceptInvite: (token: string, displayName?: string) => Promise<string | null>
  createFamily: (name: string, displayName?: string) => Promise<string | null>
  invites: Invite[]
  createInvite: (role: Role, label?: string) => Promise<{ token?: string; error?: string }>
  revokeInvite: (id: string) => Promise<string | null>
  inviteError: string | null
  signOut: () => Promise<void>
  createTask: (input: TaskInput) => Promise<string | null>
  updateTask: (id: string, input: TaskInput, scope?: 'single' | 'series') => Promise<string | null>
  deleteTask: (id: string, mode?: 'single' | 'series') => Promise<string | null>
  completeTask: (id: string) => Promise<string | null>
  reopenTask: (id: string) => Promise<string | null>
  claimTask: (id: string) => Promise<string | null>
  releaseTask: (id: string) => Promise<string | null>
  archiveTask: (id: string) => Promise<string | null>
  updateProfile: (patch: { display_name?: string; avatar?: string; color?: string; phone?: string | null }) => Promise<string | null>
  updateMemberProfile: (id: string, patch: { display_name?: string; avatar?: string; role?: Role; active?: boolean; color?: string; phone?: string | null }) => Promise<string | null>
  updateSettings: (patch: Partial<Pick<Settings, 'priorities_enabled' | 'weekly_goal' | 'kids_can_claim_pool' | 'achievements_enabled' | 'reminders_enabled'>>) => Promise<string | null>
  profileById: (id: string | null | undefined) => Profile | undefined
  weekProgress: { done: number; total: number; goal: number }
}

const StoreContext = createContext<StoreValue | null>(null)

const DEFAULT_SETTINGS: Settings = { family_id: '', priorities_enabled: true, weekly_goal: 10, kids_can_claim_pool: true, achievements_enabled: true, reminders_enabled: true }

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
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const profiles = useMemo(() => allProfiles.filter((p) => p.active !== false), [allProfiles])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [familyName, setFamilyName] = useState('Unsere Familie')
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteError, setInviteError] = useState<string | null>(null)
  const acceptingRef = useRef(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [weeklyResults, setWeeklyResults] = useState<WeeklyResult[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const toastId = useRef(0)
  const unlockingRef = useRef(false)
  const attemptedRef = useRef<Set<string>>(new Set())
  const archivedRef = useRef(false)

  const toast = useCallback((text: string, kind: ToastMsg['kind'] = 'success', action?: ToastAction) => {
    const id = ++toastId.current
    const wrapped = action ? { label: action.label, onClick: () => { action.onClick(); setToasts((t) => t.filter((x) => x.id !== id)) } } : undefined
    setToasts((t) => [...t, { id, text, kind, action: wrapped }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 2600)
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
      const [pRes, sRes, tRes, aRes, achRes, cRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('settings').select('*').limit(1),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('task_activity').select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('achievements').select('*'),
        supabase.from('categories').select('*').order('sort_order').order('name'),
      ])
      const wRes = await supabase.from('weekly_results').select('*').order('week_start', { ascending: false }).limit(200)
      if (!wRes.error) setWeeklyResults((wRes.data ?? []) as WeeklyResult[])
      const nRes = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)
      if (!nRes.error) setNotifications((nRes.data ?? []) as Notification[])
      const fRes = await supabase.from('families').select('name').limit(1)
      const iRes = await supabase.from('family_invites').select('*').order('created_at', { ascending: false })
      setInvites(iRes.error ? [] : ((iRes.data ?? []) as Invite[]))
      if (!fRes.error && fRes.data && fRes.data[0]) setFamilyName((fRes.data[0] as { name: string }).name)
      if (pRes.error) throw pRes.error
      if (sRes.error) throw sRes.error
      if (tRes.error) throw tRes.error
      if (aRes.error) throw aRes.error
      if (achRes.error) throw achRes.error
      if (cRes.error) throw cRes.error

      const ps = (pRes.data ?? []) as Profile[]
      const me = ps.find((p) => p.id === userId) ?? null
      setAllProfiles(ps)
      let taskRows = (tRes.data ?? []) as Task[]
      // Erledigt seit 30 Tagen → automatisch archivieren (einmal pro Sitzung, nur Eltern)
      if (me?.role === 'admin' && !archivedRef.current) {
        archivedRef.current = true
        const { data: n } = await supabase.rpc('archive_old_tasks')
        if (typeof n === 'number' && n > 0) {
          const again = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(2000)
          if (!again.error) taskRows = (again.data ?? []) as Task[]
        }
      }
      setProfile(me)
      const s = (sRes.data ?? [])[0] as Settings | undefined
      setSettings(s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS, family_id: me?.family_id ?? '' })
      setTasks(taskRows)
      setActivities((aRes.data ?? []) as Activity[])
      setAchievements((achRes.data ?? []) as Achievement[])
      setAllCategories((cRes.data ?? []) as Category[])
      if (!me) setDataError(null)
    } catch (e) {
      setDataError(errMsg(e))
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setAllProfiles([])
      setTasks([])
      setActivities([])
      setAchievements([])
      setAllCategories([])
      setNotifications([])
      setWeeklyResults([])
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_invites' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_results' }, () => reload())
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

  // ---- Offene Einladung nach Anmeldung automatisch annehmen ----------------
  useEffect(() => {
    if (!userId || dataLoading || acceptingRef.current) return
    const token = getPendingInvite()
    if (!token) return
    acceptingRef.current = true
    ;(async () => {
      const { data, error } = await supabase.rpc('accept_invite', { p_token: token })
      if (error) {
        setInviteError(errMsg(error))
        // Bereits Mitglied dieser Familie → Einladung einfach verwerfen
        if (profile) clearPendingInvite()
      } else {
        clearPendingInvite()
        setInviteError(null)
        const row = Array.isArray(data) ? (data[0] as { family_name?: string } | undefined) : undefined
        toast(`Willkommen bei ${row?.family_name ?? 'eurer Familie'}!`, 'success')
        await reload()
      }
      acceptingRef.current = false
    })()
  }, [userId, dataLoading, profile, reload, toast])

  // ---- Erfolge automatisch freischalten --------------------------------
  useEffect(() => {
    if (!profile || unlockingRef.current || dataLoading || !settings.achievements_enabled) return
    const unlocks = computeNewUnlocks(tasks, activities, profiles, settings, achievements, weeklyResults)
    // Mitglieder dürfen nur eigene und Familien-Erfolge eintragen
    const allowed = unlocks
      .filter((u) => profile.role === 'admin' || u.profile_id === null || u.profile_id === profile.id)
      .filter((u) => !attemptedRef.current.has(`${u.key}:${u.profile_id ?? ''}`))
    if (allowed.length === 0) return
    for (const u of allowed) attemptedRef.current.add(`${u.key}:${u.profile_id ?? ''}`)
    unlockingRef.current = true
    ;(async () => {
      try {
        const rows = allowed.map((u) => ({ family_id: profile.family_id, profile_id: u.profile_id, key: u.key, title: u.title, description: u.description, icon_key: u.icon_key }))
        const { data, error } = await supabase.from('achievements').insert(rows).select('*')
        if (!error && data) {
          setAchievements((a) => [...a, ...(data as Achievement[])])
          for (const u of allowed) {
            if (u.profile_id === null) toast(`Gemeinsam geschafft: ${u.title}`, 'info')
            else if (u.profile_id === profile.id) toast(`Neuer Erfolg: ${u.title}`, 'info')
          }
        } else if (error) {
          // Duplikat (z. B. gleichzeitig von einem anderen Gerät) – einfach neu laden
          await reload()
        }
      } finally {
        unlockingRef.current = false
      }
    })()
  }, [tasks, activities, profiles, settings, achievements, weeklyResults, profile, dataLoading, toast, reload])

  // ---- Helfer -----------------------------------------------------------
  const isAdmin = profile?.role === 'admin'

  const profileById = useCallback((id: string | null | undefined) => allProfiles.find((p) => p.id === id), [allProfiles])

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

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) return { error: errMsg(error), needsConfirm: false }
    return { error: null, needsConfirm: !data.session }
  }, [])

  const invitePreview = useCallback(async (token: string): Promise<InvitePreview> => {
    const { data, error } = await supabase.rpc('invite_preview', { p_token: token })
    if (error) return { family_name: null, invited_role: null, valid: false, reason: errMsg(error) }
    const row = Array.isArray(data) ? (data[0] as InvitePreview | undefined) : undefined
    return row ?? { family_name: null, invited_role: null, valid: false, reason: 'Einladung nicht gefunden' }
  }, [])

  const acceptInvite = useCallback(
    async (token: string, displayName?: string) => {
      const { error } = await supabase.rpc('accept_invite', { p_token: token, p_display_name: displayName ?? null })
      if (error) return errMsg(error)
      clearPendingInvite()
      setInviteError(null)
      await reload()
      return null
    },
    [reload],
  )

  const createFamily = useCallback(
    async (name: string, displayName?: string) => {
      const { error } = await supabase.rpc('create_family', { p_name: name, p_display_name: displayName ?? null })
      if (error) return errMsg(error)
      await reload()
      return null
    },
    [reload],
  )

  const createInvite = useCallback(async (role: Role, label?: string) => {
    const { data, error } = await supabase.rpc('create_invite', { p_role: role, p_days: 7, p_label: label ?? null })
    if (error) return { error: errMsg(error) }
    const row = Array.isArray(data) ? (data[0] as { token?: string } | undefined) : undefined
    if (!row?.token) return { error: 'Einladung konnte nicht erstellt werden.' }
    const iRes = await supabase.from('family_invites').select('*').order('created_at', { ascending: false })
    if (!iRes.error) setInvites((iRes.data ?? []) as Invite[])
    return { token: row.token }
  }, [])

  const revokeInvite = useCallback(async (id: string) => {
    const { error } = await supabase.from('family_invites').delete().eq('id', id)
    if (error) return errMsg(error)
    setInvites((all) => all.filter((i) => i.id !== id))
    return null
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
        recurrence_interval: input.recurrence === 'none' ? 1 : Math.max(1, input.recurrence_interval || 1),
        reminder_type: input.reminder_type,
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
      return null
    },
    [profile, inputToRow, applyTask],
  )

  const updateTask = useCallback(
    async (id: string, input: TaskInput, scope: 'single' | 'series' = 'series') => {
      if (!input.title.trim()) return 'Bitte einen Titel eingeben.'
      const old = tasks.find((t) => t.id === id)
      const row = inputToRow(input)
      let status = old?.status ?? 'open'
      if (status === 'claimed' && row.is_pool) status = 'open'
      // Serie: Vorlage neu aufbauen lassen (Folgeaufgaben übernehmen die Änderung); Einzelfall: Vorlage bleibt
      const seriesPatch = scope === 'series' && row.recurrence !== 'none' ? { series_template: null } : {}
      const { task, error } = await patchTask(id, { ...row, status, ...seriesPatch })
      if (error) return error
            return null
    },
    [tasks, inputToRow, patchTask],
  )

  const deleteTask = useCallback(
    async (id: string, mode: 'single' | 'series' = 'series') => {
      if (!profile) return 'Nicht angemeldet.'
      const old = tasks.find((t) => t.id === id)
      // „Nur diese Aufgabe löschen“ bei Wiederholung: nächsten Termin trotzdem anlegen
      if (mode === 'single' && old && old.recurrence !== 'none' && (old.status === 'open' || old.status === 'claimed')) {
        const next = {
          family_id: old.family_id,
          title: old.title,
          description: old.description,
          link: old.link,
          cost: old.cost,
          category: old.category,
          priority: old.priority,
          due_kind: 'date' as const,
          due_date: nextDueDate(old.due_date, old.recurrence, old.recurrence_interval),
          assignee_ids: old.assignee_ids,
          is_pool: old.is_pool,
          status: 'open' as const,
          recurrence: old.recurrence,
          recurrence_interval: old.recurrence_interval,
          reminder_type: old.reminder_type === 'custom' ? 'none' : old.reminder_type,
        }
        const { data, error: insErr } = await supabase.from('tasks').insert(next).select('*').single()
        if (insErr) return errMsg(insErr)
        if (data) applyTask(data as Task)
      }
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) return errMsg(error)
      setTasks((all) => all.filter((t) => t.id !== id))
      window.setTimeout(() => reload(), 500)
      return null
    },
    [profile, tasks, applyTask, reload],
  )

  const completeTask = useCallback(
    async (id: string) => {
      const { task, error } = await patchTask(id, { status: 'done' })
      if (error) return error
      if (task) {
        toast('Geschafft!', 'success', {
          label: 'Rückgängig',
          onClick: () => {
            void reopenTaskRef.current(id)
          },
        })
        window.setTimeout(() => reload(), 800) // Folgeaufgabe + Historie vom Server holen
      }
      return null
    },
    [patchTask, toast],
  )

  const reopenTask = useCallback(
    async (id: string) => {
      const old = tasks.find((t) => t.id === id)
      const status = old && !old.is_pool && old.assignee_ids.length > 0 && old.completed_by && old.assignee_ids.includes(old.completed_by) && profile?.role !== 'admin' ? 'claimed' : 'open'
      const { task, error } = await patchTask(id, { status })
      if (error) return error
      if (task) {
        toast('Wieder geöffnet', 'info')
      }
      return null
    },
    [tasks, profile, patchTask, toast],
  )
  const reopenTaskRef = useRef(reopenTask)
  reopenTaskRef.current = reopenTask

  const claimTask = useCallback(
    async (id: string) => {
      if (!profile) return 'Nicht angemeldet.'
      const { task, error } = await patchTask(id, { is_pool: false, status: 'claimed', assignee_ids: [profile.id] })
      if (error) return error
      if (task) {
        toast('Übernommen – viel Erfolg!', 'info')
      }
      return null
    },
    [profile, patchTask, toast],
  )

  const releaseTask = useCallback(
    async (id: string) => {
      const { task, error } = await patchTask(id, { is_pool: true, status: 'open', assignee_ids: [] })
      if (error) return error
      if (task) {
        toast('Zurück im Familien-Pool', 'info')
      }
      return null
    },
    [patchTask, toast],
  )

  const archiveTask = useCallback(
    async (id: string) => {
      const { task, error } = await patchTask(id, { status: 'archived' })
      if (error) return error
            return null
    },
    [patchTask],
  )

  const updateProfile = useCallback(
    async (patch: { display_name?: string; avatar?: string; color?: string; phone?: string | null }) => {
      if (!profile) return 'Nicht angemeldet.'
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', profile.id).select('*').single()
      if (error) return errMsg(error)
      const p = data as Profile
      setProfile(p)
      setAllProfiles((all) => all.map((x) => (x.id === p.id ? p : x)))
      return null
    },
    [profile],
  )

  const updateMemberProfile = useCallback(
    async (id: string, patch: { display_name?: string; avatar?: string; role?: Role; active?: boolean; color?: string; phone?: string | null }) => {
      if (!profile) return 'Nicht angemeldet.'
      if (profile.role !== 'admin') return 'Nur Eltern können andere Profile bearbeiten.'
      if (id === profile.id && patch.role && patch.role !== 'admin') return 'Du kannst dir selbst nicht die Admin-Rolle entziehen.'
      if (id === profile.id && patch.active === false) return 'Du kannst dich nicht selbst deaktivieren.'
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select('*').single()
      if (error) return errMsg(error)
      const p = data as Profile
      if (p.id === profile.id) setProfile(p)
      setAllProfiles((all) => all.map((x) => (x.id === p.id ? p : x)))
      return null
    },
    [profile],
  )

  // ---- Kategorien ---------------------------------------------------------
  const categories = useMemo(() => {
    if (allCategories.length === 0) {
      // Fallback, falls die Kategorien-Tabelle noch nicht angelegt ist
      return CATEGORIES.map((c, i) => ({ id: c.name, family_id: '', name: c.name, icon: c.emoji, sort_order: i, is_active: true, created_at: '' }))
    }
    return allCategories.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  }, [allCategories])

  const categoryIcon = useCallback(
    (name: string) => allCategories.find((c) => c.name === name)?.icon ?? categoryEmoji(name),
    [allCategories],
  )

  const addCategory = useCallback(
    async (name: string, icon: string) => {
      if (!profile) return 'Nicht angemeldet.'
      const n = name.trim()
      if (!n) return 'Bitte einen Namen eingeben.'
      if (allCategories.some((c) => c.name.toLowerCase() === n.toLowerCase())) return 'Diese Kategorie gibt es schon.'
      const maxSort = allCategories.reduce((m, c) => Math.max(m, c.sort_order), 0)
      const { data, error } = await supabase
        .from('categories')
        .insert({ family_id: profile.family_id, name: n, icon: icon.trim() || '✨', sort_order: maxSort + 10 })
        .select('*')
        .single()
      if (error) return errMsg(error)
      setAllCategories((all) => [...all, data as Category])
      return null
    },
    [profile, allCategories],
  )

  const updateCategory = useCallback(
    async (id: string, patch: Partial<Pick<Category, 'name' | 'icon' | 'sort_order' | 'is_active'>>) => {
      const old = allCategories.find((c) => c.id === id)
      const { data, error } = await supabase.from('categories').update(patch).eq('id', id).select('*').single()
      if (error) return errMsg(error)
      const c = data as Category
      setAllCategories((all) => all.map((x) => (x.id === c.id ? c : x)))
      if (old && patch.name && patch.name !== old.name) {
        // Aufgaben lokal mitziehen (in der Datenbank erledigt das ein Trigger)
        setTasks((all) => all.map((t) => (t.category === old.name ? { ...t, category: c.name } : t)))
      }
      return null
    },
    [allCategories],
  )

  const deleteCategory = useCallback(
    async (id: string) => {
      const old = allCategories.find((c) => c.id === id)
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) return errMsg(error)
      setAllCategories((all) => all.filter((x) => x.id !== id))
      if (old) setTasks((all) => all.map((t) => (t.category === old.name ? { ...t, category: 'Sonstiges' } : t)))
      return null
    },
    [allCategories],
  )

  const updateFamilyName = useCallback(
    async (name: string) => {
      if (!profile) return 'Nicht angemeldet.'
      const n = name.trim()
      if (!n) return 'Bitte einen Namen eingeben.'
      const { error } = await supabase.from('families').update({ name: n }).eq('id', profile.family_id)
      if (error) return errMsg(error)
      setFamilyName(n)
      return null
    },
    [profile],
  )

  const unreadCount = useMemo(() => (profile ? notifications.filter((n) => !n.read_by.includes(profile.id)).length : 0), [notifications, profile])

  const markNotificationsRead = useCallback(
    async (ids?: string[]) => {
      if (!profile) return
      const targets = notifications.filter((n) => !n.read_by.includes(profile.id) && (!ids || ids.includes(n.id)))
      if (targets.length === 0) return
      setNotifications((all) => all.map((n) => (targets.some((t) => t.id === n.id) ? { ...n, read_by: [...n.read_by, profile.id] } : n)))
      await Promise.all(targets.map((n) => supabase.from('notifications').update({ read_by: [...n.read_by, profile.id] }).eq('id', n.id)))
    },
    [profile, notifications],
  )

  const openTask = useCallback((id: string) => setDetailTaskId(id), [])
  const closeTask = useCallback(() => setDetailTaskId(null), [])

  const updateSettings = useCallback(
    async (patch: Partial<Pick<Settings, 'priorities_enabled' | 'weekly_goal' | 'kids_can_claim_pool' | 'achievements_enabled' | 'reminders_enabled'>>) => {
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
    familyName,
    updateFamilyName,
    notifications,
    unreadCount,
    markNotificationsRead,
    detailTaskId,
    openTask,
    closeTask,
    profiles,
    allProfiles,
    settings,
    categories,
    allCategories,
    categoryIcon,
    addCategory,
    updateCategory,
    deleteCategory,
    tasks,
    activities,
    achievements,
    weeklyResults,
    dataLoading,
    dataError,
    isAdmin,
    toasts,
    toast,
    reload,
    signIn,
    signUp,
    invitePreview,
    acceptInvite,
    createFamily,
    invites,
    createInvite,
    revokeInvite,
    inviteError,
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
    updateMemberProfile,
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
