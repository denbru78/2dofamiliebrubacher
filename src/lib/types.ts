export type Role = 'admin' | 'member'
export type Priority = 'none' | 'normal' | 'important' | 'urgent'
export type Status = 'open' | 'claimed' | 'done' | 'archived'
export type DueKind = 'none' | 'today' | 'tomorrow' | 'week' | 'weekend' | 'someday' | 'date'
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly'

export interface Profile {
  id: string
  family_id: string
  display_name: string
  role: Role
  avatar: string
  created_at: string
}

export interface Settings {
  family_id: string
  priorities_enabled: boolean
  weekly_goal: number
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
}
