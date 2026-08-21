import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  InboxItem, PlannerState, RecurrenceRule, Subscription, Todo, TodoStatus, Weekday,
} from './types.ts'

const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const WEEKDAY_INDEX: Record<Weekday, number> = {
  MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0,
}

export class PlannerStore {
  private state: PlannerState = { todos: [], subscriptions: [], inbox: [] }
  private writing: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PlannerState>
      this.state = {
        todos: Array.isArray(parsed.todos) ? parsed.todos : [],
        subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
        inbox: Array.isArray(parsed.inbox) ? parsed.inbox : [],
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw error
      this.seedDemo()
      await this.flush()
    }
    if (this.state.todos.length === 0 && this.state.subscriptions.length === 0) {
      this.seedDemo()
      await this.flush()
    }
  }

  snapshot(): PlannerState {
    return structuredClone(this.state)
  }

  /** Compact pending-only snapshot for diagnostics; planner chat prefers tools. */
  formatBrief(): string {
    const pending = this.state.todos.filter(todo => todo.status !== 'completed')
    const lines: string[] = []
    lines.push(`待办（未完成 ${pending.length}）：`)
    if (pending.length === 0) {
      lines.push('- （无未完成待办）')
    } else {
      for (const todo of pending.slice(0, 30)) {
        const when = todo.dueDate ? `${todo.dueDate}${todo.dueTime ? ` ${todo.dueTime}` : ''}` : '无日期'
        const notes = todo.notes ? `；${todo.notes}` : ''
        lines.push(`- ${todo.title} · ${when}${notes}`)
      }
    }
    const activeSubs = this.state.subscriptions.filter(item => item.status !== 'completed')
    lines.push(`订阅（${activeSubs.length}）：`)
    if (activeSubs.length === 0) {
      lines.push('- （无订阅）')
    } else {
      for (const item of activeSubs.slice(0, 20)) {
        const status = { running: '运行中', paused: '已暂停', completed: '已完成' }[item.status] ?? item.status
        const next = item.nextRunAt ? `；下次 ${formatLocalBrief(item.nextRunAt)}` : ''
        lines.push(`- ${item.title} · ${describeRule(item.rule)} · ${status}${next}`)
      }
    }
    return lines.join('\n')
  }

  listTodos(): Todo[] {
    return this.state.todos.slice()
  }

  listSubscriptions(): Subscription[] {
    return this.state.subscriptions.slice()
  }

  async createTodo(input: { title: string; notes?: string; dueDate?: string | null; dueTime?: string | null }): Promise<Todo> {
    const now = nowIso()
    const todo: Todo = {
      id: `todo_${randomUUID().slice(0, 8)}`,
      title: input.title.trim(),
      notes: (input.notes ?? '').trim(),
      dueDate: normalizeDate(input.dueDate),
      dueTime: normalizeTime(input.dueTime),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    if (!todo.title) throw new Error('待办标题不能为空')
    this.state.todos.unshift(todo)
    await this.flush()
    return todo
  }

  async updateTodo(idOrTitle: string, patch: {
    title?: string
    notes?: string
    dueDate?: string | null
    dueTime?: string | null
    status?: TodoStatus
  }): Promise<Todo> {
    const todo = this.findTodo(idOrTitle)
    if (todo === undefined) throw new Error(`未找到待办：${idOrTitle}`)
    if (patch.title !== undefined) {
      const title = patch.title.trim()
      if (!title) throw new Error('待办标题不能为空')
      todo.title = title
    }
    if (patch.notes !== undefined) todo.notes = patch.notes.trim()
    if (patch.dueDate !== undefined) todo.dueDate = normalizeDate(patch.dueDate)
    if (patch.dueTime !== undefined) todo.dueTime = normalizeTime(patch.dueTime)
    if (patch.status !== undefined) todo.status = patch.status
    todo.updatedAt = nowIso()
    await this.flush()
    return todo
  }

  async deleteTodo(idOrTitle: string): Promise<Todo> {
    const todo = this.findTodo(idOrTitle)
    if (todo === undefined) throw new Error(`未找到待办：${idOrTitle}`)
    this.state.todos = this.state.todos.filter(item => item.id !== todo.id)
    await this.flush()
    return todo
  }

  findTodo(idOrTitle: string): Todo | undefined {
    const key = idOrTitle.trim()
    return this.state.todos.find(item => item.id === key)
      ?? this.state.todos.find(item => item.title === key)
  }

  async createSubscription(input: {
    title: string
    description: string
    prompt: string
    rule: RecurrenceRule
  }): Promise<Subscription> {
    const rule = normalizeRule(input.rule)
    const now = nowIso()
    const subscription: Subscription = {
      id: `sub_${randomUUID().slice(0, 8)}`,
      title: input.title.trim(),
      description: input.description.trim(),
      prompt: input.prompt.trim(),
      rule,
      status: 'running',
      nextRunAt: computeNextRun(rule, new Date()),
      lastRunAt: null,
      createdAt: now,
      updatedAt: now,
    }
    if (!subscription.title) throw new Error('订阅标题不能为空')
    if (!subscription.prompt) throw new Error('订阅执行指令不能为空')
    this.state.subscriptions.unshift(subscription)
    await this.flush()
    return subscription
  }

  async updateSubscription(idOrTitle: string, patch: {
    title?: string
    description?: string
    prompt?: string
    rule?: RecurrenceRule
    operator?: 'modify' | 'pause' | 'resume' | 'delete'
  }): Promise<Subscription | { deleted: true; title: string }> {
    const subscription = this.findSubscription(idOrTitle)
    if (subscription === undefined) throw new Error(`未找到订阅：${idOrTitle}`)
    const operator = patch.operator ?? 'modify'
    if (operator === 'delete') {
      this.state.subscriptions = this.state.subscriptions.filter(item => item.id !== subscription.id)
      await this.flush()
      return { deleted: true, title: subscription.title }
    }
    if (operator === 'pause') {
      if (subscription.status === 'completed') throw new Error('已完成的订阅无法暂停')
      subscription.status = 'paused'
    } else if (operator === 'resume') {
      if (subscription.status === 'completed') throw new Error('已完成的订阅无法恢复')
      subscription.status = 'running'
      subscription.nextRunAt = computeNextRun(subscription.rule, new Date())
    } else {
      if (patch.title !== undefined) {
        const title = patch.title.trim()
        if (!title) throw new Error('订阅标题不能为空')
        subscription.title = title
      }
      if (patch.description !== undefined) subscription.description = patch.description.trim()
      if (patch.prompt !== undefined) {
        const prompt = patch.prompt.trim()
        if (!prompt) throw new Error('订阅执行指令不能为空')
        subscription.prompt = prompt
      }
      if (patch.rule !== undefined) {
        subscription.rule = normalizeRule({ ...subscription.rule, ...patch.rule })
        if (subscription.status === 'running') {
          subscription.nextRunAt = computeNextRun(subscription.rule, new Date())
        }
      }
    }
    subscription.updatedAt = nowIso()
    await this.flush()
    return subscription
  }

  findSubscription(idOrTitle: string): Subscription | undefined {
    const key = idOrTitle.trim()
    return this.state.subscriptions.find(item => item.id === key)
      ?? this.state.subscriptions.find(item => item.title === key)
  }

  async markInboxRead(id: string): Promise<void> {
    const item = this.state.inbox.find(entry => entry.id === id)
    if (item !== undefined) item.read = true
    await this.flush()
  }

  async dispatchDue(now = new Date()): Promise<InboxItem[]> {
    const fired: InboxItem[] = []
    for (const subscription of this.state.subscriptions) {
      if (subscription.status !== 'running' || subscription.nextRunAt === null) continue
      if (Date.parse(subscription.nextRunAt) > now.getTime()) continue
      const item: InboxItem = {
        id: `inbox_${randomUUID().slice(0, 8)}`,
        kind: 'subscription',
        title: subscription.title,
        prompt: subscription.prompt,
        refId: subscription.id,
        dueAt: subscription.nextRunAt,
        read: false,
      }
      this.state.inbox.unshift(item)
      fired.push(item)
      subscription.lastRunAt = nowIso(now)
      if (subscription.rule.type === 'once') {
        subscription.status = 'completed'
        subscription.nextRunAt = null
      } else {
        subscription.nextRunAt = computeNextRun(subscription.rule, new Date(now.getTime() + 60_000))
      }
      subscription.updatedAt = nowIso(now)
    }
    if (fired.length > 0) await this.flush()
    return fired
  }

  private seedDemo(): void {
    const today = formatDate(new Date())
    const tomorrow = formatDate(shiftDays(new Date(), 1))
    const friday = nextWeekday(new Date(), 5)
    const meeting = formatDate(shiftDays(new Date(), 6))
    const now = nowIso()
    this.state.todos = [
      {
        id: 'todo_demo1',
        title: '确认答辩投影与麦克风',
        notes: '会议室设备联调',
        dueDate: today,
        dueTime: '11:00',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'todo_demo2',
        title: '答辩彩排',
        notes: '过一遍个人助理演示路径',
        dueDate: tomorrow,
        dueTime: '15:00',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'todo_demo3',
        title: '提交答辩材料',
        notes: '',
        dueDate: friday,
        dueTime: '18:00',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'todo_demo4',
        title: '部门周会',
        notes: '',
        dueDate: meeting,
        dueTime: '10:00',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    ]
    const morning: RecurrenceRule = { type: 'daily', hour: 8, minute: 30, onlyWorkday: true }
    const weekly: RecurrenceRule = { type: 'weekly', hour: 17, minute: 30, dayOfWeek: 'FR', onlyWorkday: true }
    this.state.subscriptions = [
      {
        id: 'sub_demo1',
        title: '每日待办晨报',
        description: '工作日早上汇总未完成待办',
        prompt: '「每日待办晨报」\n先查看当前待办列表，汇总未完成事项并直接输出今日安排。',
        rule: morning,
        status: 'running',
        nextRunAt: computeNextRun(morning, new Date()),
        lastRunAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sub_demo2',
        title: '每周五工作回顾',
        description: '每周五傍晚回顾本周进展',
        prompt: '「本周工作回顾」\n先查看待办与订阅，总结本周完成情况并直接输出回顾。',
        rule: weekly,
        status: 'running',
        nextRunAt: computeNextRun(weekly, new Date()),
        lastRunAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]
  }

  private async flush(): Promise<void> {
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      await writeFile(tmp, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8')
      await rename(tmp, this.filePath)
    })
    await this.writing
  }
}

export function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatLocalBrief(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function describeRule(rule: RecurrenceRule): string {
  const clock = `${String(rule.hour).padStart(2, '0')}:${String(rule.minute).padStart(2, '0')}`
  const work = rule.type !== 'once' && rule.onlyWorkday !== false ? '（仅工作日）' : ''
  switch (rule.type) {
    case 'once':
      return `单次 ${rule.executeAt ?? clock}`
    case 'daily':
      return `每${rule.interval && rule.interval > 1 ? `${rule.interval}天` : '天'} ${clock}${work}`
    case 'weekly': {
      const label = { MO: '周一', TU: '周二', WE: '周三', TH: '周四', FR: '周五', SA: '周六', SU: '周日' }[rule.dayOfWeek ?? 'MO']
      return `每${rule.interval && rule.interval > 1 ? `${rule.interval}周` : '周'}${label} ${clock}${work}`
    }
    case 'monthly':
      return `每${rule.interval && rule.interval > 1 ? `${rule.interval}月` : '月'}${rule.dayOfMonth === 32 ? '最后一个工作日' : `${rule.dayOfMonth}日`} ${clock}${work}`
  }
}

export function computeNextRun(rule: RecurrenceRule, from: Date): string {
  const start = new Date(from.getTime())
  for (let i = 0; i < 400; i += 1) {
    const candidate = candidateOn(rule, start, i)
    if (candidate > from && passesWorkday(rule, candidate)) return candidate.toISOString()
  }
  throw new Error('无法计算下一次执行时间')
}

function candidateOn(rule: RecurrenceRule, from: Date, step: number): Date {
  if (rule.type === 'once') {
    if (!rule.executeAt) throw new Error('单次订阅必须提供 execute_at')
    return parseLocalDateTime(rule.executeAt)
  }
  const interval = Math.max(1, rule.interval ?? 1)
  if (rule.type === 'daily') {
    const date = shiftDays(startOfLocalDay(from), step * interval)
    return atClock(date, rule.hour, rule.minute)
  }
  if (rule.type === 'weekly') {
    const target = WEEKDAY_INDEX[rule.dayOfWeek ?? 'MO']
    const base = startOfLocalDay(from)
    const delta = (target - base.getDay() + 7) % 7
    const date = shiftDays(base, delta + step * 7 * interval)
    return atClock(date, rule.hour, rule.minute)
  }
  const month = new Date(from.getFullYear(), from.getMonth() + step * interval, 1)
  const day = resolveMonthDay(month, rule.dayOfMonth ?? 1)
  return atClock(day, rule.hour, rule.minute)
}

function passesWorkday(rule: RecurrenceRule, date: Date): boolean {
  if (rule.type === 'once' || rule.onlyWorkday === false) return true
  const day = date.getDay()
  return day !== 0 && day !== 6
}

function resolveMonthDay(monthStart: Date, dayOfMonth: number): Date {
  const last = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
  if (dayOfMonth === 32) {
    let cursor = last
    while (cursor.getDay() === 0 || cursor.getDay() === 6) cursor = shiftDays(cursor, -1)
    return cursor
  }
  if (dayOfMonth === 0) {
    let cursor = new Date(monthStart)
    while (cursor.getDay() === 0 || cursor.getDay() === 6) cursor = shiftDays(cursor, 1)
    return cursor
  }
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(dayOfMonth, last.getDate()))
}

function normalizeRule(rule: RecurrenceRule): RecurrenceRule {
  const type = rule.type
  if (!['once', 'daily', 'weekly', 'monthly'].includes(type)) throw new Error('rule.type 必须是 once/daily/weekly/monthly')
  const hour = clampInt(rule.hour, 0, 23, 'hour')
  const minute = clampInt(rule.minute, 0, 59, 'minute')
  const next: RecurrenceRule = { type, hour, minute }
  if (type === 'once') {
    if (!rule.executeAt) throw new Error('单次订阅必须提供 execute_at，格式 YYYY-MM-DD HH:mm:ss')
    const at = parseLocalDateTime(rule.executeAt)
    if (at.getTime() <= Date.now()) throw new Error('单次订阅的执行时间必须晚于当前时间')
    next.executeAt = formatDateTime(at)
    next.hour = at.getHours()
    next.minute = at.getMinutes()
    return next
  }
  next.interval = Math.max(1, rule.interval ?? 1)
  next.onlyWorkday = rule.onlyWorkday !== false
  if (type === 'weekly') {
    const day = (rule.dayOfWeek ?? '').toUpperCase() as Weekday
    if (!WEEKDAYS.includes(day)) throw new Error('weekly 订阅必须提供 day_of_week，例如 MO')
    next.dayOfWeek = day
  }
  if (type === 'monthly') {
    const day = rule.dayOfMonth
    if (day === undefined || day < 0 || day > 32) throw new Error('monthly 订阅必须提供 day_of_month（1-31，0=首个工作日，32=最后工作日）')
    next.dayOfMonth = day
  }
  return next
}

function normalizeDate(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === '') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式必须是 YYYY-MM-DD')
  return value
}

function normalizeTime(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === '') return null
  if (!/^\d{2}:\d{2}$/.test(value)) throw new Error('时间格式必须是 HH:mm')
  return value
}

function parseLocalDateTime(value: string): Date {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) throw new Error('execute_at 格式必须是 YYYY-MM-DD HH:mm:ss')
  return new Date(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6] ?? '0'),
  )
}

function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

function nowIso(date = new Date()): string {
  return date.toISOString()
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function atClock(date: Date, hour: number, minute: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0)
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function nextWeekday(from: Date, weekday: number): string {
  const delta = (weekday - from.getDay() + 7) % 7
  return formatDate(shiftDays(from, delta === 0 ? 7 : delta))
}

function clampInt(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} 必须是 ${min}-${max} 的整数`)
  return value
}

export function plannerDataPath(dir: string): string {
  return join(dir, 'planner.json')
}
