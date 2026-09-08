import type { Achievement, Activity, Profile, Settings, Task } from './types'
import { sameDay, startOfWeek } from './dates'

export interface AchievementDef {
  key: string
  title: string
  description: string
  emoji: string
  scope: 'personal' | 'family'
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { key: 'first_done', title: 'Erste Aufgabe', description: 'Die erste Aufgabe ist geschafft.', emoji: 'check', scope: 'personal' },
  { key: 'five_done', title: '5 geschafft', description: '5 Aufgaben erledigt.', emoji: 'star', scope: 'personal' },
  { key: 'twenty_done', title: '20 geschafft', description: '20 Aufgaben erledigt.', emoji: 'sparkle', scope: 'personal' },
  { key: 'five_garden', title: 'Grüner Daumen', description: '5 Gartenaufgaben erledigt.', emoji: 'leaf', scope: 'personal' },
  { key: 'five_pool', title: 'Ich mach das', description: '5 Pool-Aufgaben übernommen.', emoji: 'hand', scope: 'personal' },
  { key: 'same_day', title: 'Sofort erledigt', description: 'Eine Aufgabe noch am selben Tag erledigt.', emoji: 'bolt', scope: 'personal' },
  { key: 'weekly_goal', title: 'Wochenziel erreicht', description: 'Die Familie hat ihr Wochenziel geschafft.', emoji: 'trophy', scope: 'family' },
  { key: 'fifty_family', title: '50 gemeinsam', description: '50 Aufgaben als Familie erledigt.', emoji: 'star', scope: 'family' },
  { key: 'hundred_family', title: '100 gemeinsam', description: '100 Aufgaben als Familie erledigt.', emoji: 'home', scope: 'family' },
]

export function achievementDef(key: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find((d) => d.key === key)
}

export interface Unlock {
  key: string
  profile_id: string | null
}

/** Berechnet, welche Erfolge neu freigeschaltet werden sollten. */
export function computeNewUnlocks(
  tasks: Task[],
  activities: Activity[],
  profiles: Profile[],
  settings: Settings,
  existing: Achievement[],
): Unlock[] {
  const has = (key: string, pid: string | null) => existing.some((a) => a.key === key && (a.profile_id ?? null) === pid)
  const result: Unlock[] = []
  const doneTasks = tasks.filter((t) => t.status === 'done' || t.status === 'archived')

  for (const p of profiles) {
    const mine = doneTasks.filter((t) => t.completed_by === p.id)
    const garden = mine.filter((t) => t.category === 'Garten')
    const claimed = activities.filter((a) => a.actor_id === p.id && a.action === 'claimed')
    const sameDayDone = mine.some((t) => sameDay(t.created_at, t.completed_at))

    const checks: [string, boolean][] = [
      ['first_done', mine.length >= 1],
      ['five_done', mine.length >= 5],
      ['twenty_done', mine.length >= 20],
      ['five_garden', garden.length >= 5],
      ['five_pool', claimed.length >= 5],
      ['same_day', sameDayDone],
    ]
    for (const [key, ok] of checks) {
      if (ok && !has(key, p.id)) result.push({ key, profile_id: p.id })
    }
  }

  const weekStart = startOfWeek().getTime()
  const doneThisWeek = doneTasks.filter((t) => t.completed_at && new Date(t.completed_at).getTime() >= weekStart).length
  const familyChecks: [string, boolean][] = [
    ['weekly_goal', doneThisWeek >= settings.weekly_goal],
    ['fifty_family', doneTasks.length >= 50],
    ['hundred_family', doneTasks.length >= 100],
  ]
  for (const [key, ok] of familyChecks) {
    if (ok && !has(key, null)) result.push({ key, profile_id: null })
  }
  return result
}
