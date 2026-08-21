export type TodoStatus = 'pending' | 'completed'

export interface Todo {
  id: string
  title: string
  notes: string
  dueDate: string | null
  dueTime: string | null
  status: TodoStatus
  createdAt: string
  updatedAt: string
}

export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly'
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'
export type SubscriptionStatus = 'running' | 'paused' | 'completed'

export interface RecurrenceRule {
  type: RepeatType
  hour: number
  minute: number
  executeAt?: string
  dayOfWeek?: Weekday
  dayOfMonth?: number
  interval?: number
  onlyWorkday?: boolean
}

export interface Subscription {
  id: string
  title: string
  description: string
  prompt: string
  rule: RecurrenceRule
  status: SubscriptionStatus
  nextRunAt: string | null
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface InboxItem {
  id: string
  kind: 'todo' | 'subscription'
  title: string
  prompt: string
  refId: string
  dueAt: string
  read: boolean
}

export interface PlannerState {
  todos: Todo[]
  subscriptions: Subscription[]
  inbox: InboxItem[]
}

export type MemoryKind = 'preference' | 'fact' | 'note'
export type MemorySource = 'active' | 'scan' | 'manual'
export type MemoryStatus = 'active' | 'archived'

export interface Memory {
  id: string
  kind: MemoryKind
  content: string
  category: string
  source: MemorySource
  status: MemoryStatus
  createdAt: string
  updatedAt: string
}

export interface ProposedMemory {
  kind: MemoryKind
  content: string
  category: string
}

export interface ProposedTodo {
  title: string
  notes: string
  dueDate: string | null
  dueTime: string | null
}

export interface MemoryExtractResult {
  memories: ProposedMemory[]
  todos: ProposedTodo[]
}

export interface Hint {
  id: string
  title: string
  prompt: string
  reason: string
}

export interface HintSet {
  fingerprint: string
  generatedAt: string
  items: Hint[]
}
