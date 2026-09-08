import type { Achievement, Activity, Profile, Settings, Task, WeeklyResult } from './types'
import { sameDay, startOfWeek, weekKey } from './dates'

export interface AchievementDef {
  key: string
  title: string
  description: string
  emoji: string // Icon-Schlüssel der App-Icon-Familie
  scope: 'personal' | 'family'
}

/** Persönliche Erfolge – keine Rangliste, jede Person sammelt für sich */
export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { key: 'first_done', title: 'Erste Aufgabe', description: 'Die erste Aufgabe ist geschafft.', emoji: 'check', scope: 'personal' },
  { key: 'five_done', title: '5 geschafft', description: '5 Aufgaben erledigt.', emoji: 'star', scope: 'personal' },
  { key: 'ten_done', title: '10 geschafft', description: '10 Aufgaben erledigt.', emoji: 'star', scope: 'personal' },
  { key: 'twentyfive_done', title: '25 geschafft', description: '25 Aufgaben erledigt.', emoji: 'sparkle', scope: 'personal' },
  { key: 'fifty_done', title: '50 geschafft', description: '50 Aufgaben erledigt.', emoji: 'trophy', scope: 'personal' },
  { key: 'five_pool', title: 'Ich mach das', description: '5 Pool-Aufgaben übernommen.', emoji: 'hand', scope: 'personal' },
  { key: 'ten_pool', title: 'Pool-Held', description: '10 Pool-Aufgaben übernommen.', emoji: 'hand', scope: 'personal' },
  { key: 'garden_pro', title: 'Garten-Profi', description: '5 Gartenaufgaben erledigt.', emoji: 'leaf', scope: 'personal' },
  { key: 'tidy_champ', title: 'Aufräum-Champ', description: '5 Haus-&-Haushalt-Aufgaben erledigt.', emoji: 'home', scope: 'personal' },
  { key: 'car_helper', title: 'Auto-Helfer', description: '5 Auto-Aufgaben erledigt.', emoji: 'car', scope: 'personal' },
  { key: 'same_day', title: 'Sofort erledigt', description: 'Eine Aufgabe noch am selben Tag erledigt.', emoji: 'bolt', scope: 'personal' },
  // Gemeinsam geschafft
  { key: 'first_weekly_goal', title: 'Erstes Wochenziel', description: 'Das erste Wochenziel ist geschafft.', emoji: 'flag', scope: 'family' },
  { key: 'three_weekly_goals', title: '3 Wochenziele', description: 'Drei Wochenziele erreicht.', emoji: 'trophy', scope: 'family' },
  { key: 'three_in_row', title: '3 Wochen in Folge', description: 'Drei Wochenziele hintereinander erreicht.', emoji: 'trophy', scope: 'family' },
  { key: 'family_25', title: '25 gemeinsam', description: '25 Aufgaben als Familie erledigt.', emoji: 'family', scope: 'family' },
  { key: 'family_50', title: '50 gemeinsam', description: '50 Aufgaben als Familie erledigt.', emoji: 'family', scope: 'family' },
  { key: 'family_100', title: '100 gemeinsam', description: '100 Aufgaben als Familie erledigt.', emoji: 'home', scope: 'family' },
]

// Ältere Schlüssel weiterhin anzeigen können
const LEGACY: Record<string, AchievementDef> = {
  twenty_done: { key: 'twenty_done', title: '20 geschafft', description: '20 Aufgaben erledigt.', emoji: 'star', scope: 'personal' },
  weekly_goal: { key: 'weekly_goal', title: 'Erstes Wochenziel', description: 'Das erste Wochenziel ist geschafft.', emoji: 'flag', scope: 'family' },
  five_garden: { key: 'five_garden', title: 'Garten-Profi', description: '5 Gartenaufgaben erledigt.', emoji: 'leaf', scope: 'personal' },
  fifty_family: { key: 'fifty_family', title: '50 gemeinsam', description: '50 Aufgaben als Familie erledigt.', emoji: 'family', scope: 'family' },
  hundred_family: { key: 'hundred_family', title: '100 gemeinsam', description: '100 Aufgaben als Familie erledigt.', emoji: 'home', scope: 'family' },
}

export function achievementDef(key: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find((d) => d.key === key) ?? LEGACY[key]
}

/** Anzeige-Daten eines gespeicherten Erfolgs (Tabelle hat Vorrang, sonst Definition) */
export function achievementView(a: Achievement): { title: string; description: string; icon: string } {
  const d = achievementDef(a.key)
  return {
    title: a.title ?? d?.title ?? a.key,
    description: a.description ?? d?.description ?? '',
    icon: a.icon_key ?? d?.emoji ?? 'star',
  }
}

export interface Unlock {
  key: string
  profile_id: string | null
  title: string
  description: string
  icon_key: string
}

/** Wochenstatistik aus der serverseitigen Wochen-Historie (weekly_results) */
export function weeklyStats(results: WeeklyResult[]): { reachedCount: number; streak: number } {
  const reached = new Set(results.filter((r) => r.reached).map((r) => r.week_start))
  let streak = 0
  const cursor = startOfWeek(new Date())
  if (reached.has(weekKey(cursor))) streak++
  cursor.setDate(cursor.getDate() - 7)
  for (let i = 0; i < 260; i++) {
    if (reached.has(weekKey(cursor))) streak++
    else break
    cursor.setDate(cursor.getDate() - 7)
  }
  return { reachedCount: reached.size, streak }
}

/** Fallback: Wochen mit erreichtem Ziel aus den Aufgaben (falls Historie fehlt) */
export function weeklyGoalStats(doneTasks: Task[], goal: number): { reachedWeeks: number; streak: number } {
  const counts = new Map<string, number>()
  for (const t of doneTasks) {
    if (!t.completed_at) continue
    const k = weekKey(new Date(t.completed_at))
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const g = Math.max(1, goal)
  let reachedWeeks = 0
  for (const v of counts.values()) if (v >= g) reachedWeeks++
  let streak = 0
  const cursor = startOfWeek(new Date())
  if ((counts.get(weekKey(cursor)) ?? 0) >= g) streak++
  cursor.setDate(cursor.getDate() - 7)
  for (let i = 0; i < 260; i++) {
    if ((counts.get(weekKey(cursor)) ?? 0) >= g) streak++
    else break
    cursor.setDate(cursor.getDate() - 7)
  }
  return { reachedWeeks, streak }
}

/** Berechnet, welche Erfolge neu freigeschaltet werden sollten. */
export function computeNewUnlocks(
  tasks: Task[],
  activities: Activity[],
  profiles: Profile[],
  settings: Settings,
  existing: Achievement[],
  weeklyResults: WeeklyResult[] = [],
): Unlock[] {
  const has = (key: string, pid: string | null) => existing.some((a) => a.key === key && (a.profile_id ?? null) === pid)
  const result: Unlock[] = []
  const push = (key: string, pid: string | null) => {
    const d = achievementDef(key)
    if (!d || has(key, pid)) return
    result.push({ key, profile_id: pid, title: d.title, description: d.description, icon_key: d.emoji })
  }
  const doneTasks = tasks.filter((t) => t.status === 'done' || t.status === 'archived')

  for (const p of profiles) {
    const mine = doneTasks.filter((t) => t.completed_by === p.id)
    const byCat = (name: string) => mine.filter((t) => t.category === name).length
    const claimed = activities.filter((a) => a.actor_id === p.id && (a.action === 'claimed' || a.action === 'taken_from_pool')).length
    const checks: [string, boolean][] = [
      ['first_done', mine.length >= 1],
      ['five_done', mine.length >= 5],
      ['ten_done', mine.length >= 10],
      ['twentyfive_done', mine.length >= 25],
      ['fifty_done', mine.length >= 50],
      ['five_pool', claimed >= 5],
      ['ten_pool', claimed >= 10],
      ['garden_pro', byCat('Garten') >= 5],
      ['tidy_champ', byCat('Haus & Haushalt') >= 5],
      ['car_helper', byCat('Auto & Mobilität') >= 5],
      ['same_day', mine.some((t) => sameDay(t.created_at, t.completed_at))],
    ]
    for (const [key, ok] of checks) if (ok) push(key, p.id)
  }

  const stats = weeklyResults.length
    ? weeklyStats(weeklyResults)
    : (() => {
        const f = weeklyGoalStats(doneTasks, settings.weekly_goal)
        return { reachedCount: f.reachedWeeks, streak: f.streak }
      })()
  const familyChecks: [string, boolean][] = [
    ['first_weekly_goal', stats.reachedCount >= 1],
    ['three_weekly_goals', stats.reachedCount >= 3],
    ['three_in_row', stats.streak >= 3],
    ['family_25', doneTasks.length >= 25],
    ['family_50', doneTasks.length >= 50],
    ['family_100', doneTasks.length >= 100],
  ]
  for (const [key, ok] of familyChecks) if (ok) push(key, null)
  return result
}
