export type Role = 'admin' | 'member'
export type Priority = 'none' | 'normal' | 'important' | 'urgent'
export type Status = 'open' | 'claimed' | 'done' | 'archived'
export type DueKind = 'none' | 'today' | 'tomorrow' | 'week' | 'weekend' | 'someday' | 'date'
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type ReminderType = 'none' | 'due_morning' | 'day_before' | 'custom'

export interface Profile {
  id: string
  family_id: string
  display_name: string
  role: Role
  avatar: string
  active: boolean
  color: string | null
  phone: string | null
  created_at: string
}

export interface Settings {
  family_id: string
  priorities_enabled: boolean
  weekly_goal: number
  kids_can_claim_pool: boolean
  achievements_enabled: boolean
  reminders_enabled: boolean
}

export interface Notification {
  id: string
  family_id: string
  profile_id: string | null
  type: string
  title: string
  body: string | null
  task_id: string | null
  read_by: string[]
  created_at: string
}

export interface Category {
  id: string
  family_id: string
  name: string
  icon: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface Task {
  id: string
  family_id: string
  title: string
  description: string | null
  link: string | null
  cost: number | null
  category: string
  priority: Priority
  due_kind: DueKind
  due_date: string | null
  assignee_ids: string[]
  is_pool: boolean
  status: Status
  recurrence: Recurrence
  recurrence_interval: number
  reminder_type: ReminderType
  reminder_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  completed_by: string | null
}

export interface Activity {
  id: number
  family_id: string
  task_id: string | null
  actor_id: string | null
  action: string
  task_title: string | null
  created_at: string
}

export interface Achievement {
  id: string
  family_id: string
  profile_id: string | null
  key: string
  unlocked_at: string
  title: string | null
  description: string | null
  icon_key: string | null
}

export interface WeeklyResult {
  family_id: string
  week_start: string
  done_count: number
  goal: number
  reached: boolean
  reached_at: string | null
}

export interface TaskInput {
  title: string
  description: string
  link: string
  cost: string
  category: string
  priority: Priority
  due_kind: DueKind
  due_date: string
  assignee_ids: string[]
  recurrence: Recurrence
  recurrence_interval: number
  reminder_type: ReminderType
}
