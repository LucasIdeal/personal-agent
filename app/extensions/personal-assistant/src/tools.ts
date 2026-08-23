import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { describeRule, type PlannerStore } from './store.ts'
import type { MemoryStore } from './memory-store.ts'
import type { MemoryKind, RecurrenceRule, RepeatType, TodoStatus, Weekday } from './types.ts'

export function registerPlannerTools(ctx: Context, store: PlannerStore, memory: MemoryStore): void {
  ctx.tools.register(defineTool({
    name: 'todo_manage',
    description: 'Manage the user\'s personal todos (not the in-session task plan). Create, list, complete, update, or delete dated todos shown on the calendar.',
    parameters: {
      operator: {
        type: 'string',
        required: true,
        enum: ['create', 'list', 'complete', 'update', 'delete'],
        description: 'create / list / complete / update / delete',
      },
      title: { type: 'string', description: 'Todo title. Required for create; also used to find an existing todo.' },
      due_date: { type: 'string', description: 'Due date YYYY-MM-DD. Omit for no date.' },
      due_time: { type: 'string', description: 'Due time HH:mm.' },
      notes: { type: 'string', description: 'Optional note.' },
      status: { type: 'string', enum: ['pending', 'completed'], description: 'Used with update.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      switch (args.operator) {
        case 'list': {
          const todos = store.listTodos()
          if (todos.length === 0) return '当前没有待办。'
          return todos.map(todo => formatTodoLine(todo)).join('\n')
        }
        case 'create': {
          if (!args.title) throw new Error('创建待办需要 title')
          const todo = await store.createTodo({
            title: args.title,
            notes: args.notes,
            dueDate: args.due_date,
            dueTime: args.due_time,
          })
          return `已创建待办：${formatTodoLine(todo)}`
        }
        case 'complete': {
          if (!args.title) throw new Error('完成待办需要 title')
          const todo = await store.updateTodo(args.title, { status: 'completed' })
          return `已完成待办：${todo.title}`
        }
        case 'update': {
          if (!args.title) throw new Error('修改待办需要 title')
          const todo = await store.updateTodo(args.title, {
            notes: args.notes,
            dueDate: args.due_date,
            dueTime: args.due_time,
            status: args.status as TodoStatus | undefined,
          })
          return `已更新待办：${formatTodoLine(todo)}`
        }
        case 'delete': {
          if (!args.title) throw new Error('删除待办需要 title')
          const todo = await store.deleteTodo(args.title)
          return `已删除待办：${todo.title}`
        }
        default:
          throw new Error(`未知 operator：${String(args.operator)}`)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'subscription_manage',
    description: 'Manage personal subscriptions / recurring jobs (daily briefings, reminders). Supports create, list, modify, pause, resume, and delete. Hide internal ids from the user; refer to subscriptions by title.',
    parameters: {
      operator: {
        type: 'string',
        required: true,
        enum: ['create', 'list', 'modify', 'pause', 'resume', 'delete'],
        description: 'create / list / modify / pause / resume / delete',
      },
      title: { type: 'string', description: 'Subscription title. Required for create; also used to find an existing subscription.' },
      description: { type: 'string', description: 'Short human description.' },
      prompt: { type: 'string', description: 'Self-contained instruction executed when the subscription fires. No schedule words, no internal ids.' },
      rule_type: {
        type: 'string',
        enum: ['once', 'daily', 'weekly', 'monthly'],
        description: 'once / daily / weekly / monthly. Default once when omitted on create.',
      },
      hour: { type: 'integer', description: 'Hour 0-23.' },
      minute: { type: 'integer', description: 'Minute 0-59.' },
      execute_at: { type: 'string', description: 'Required for once: YYYY-MM-DD HH:mm:ss, must be in the future.' },
      day_of_week: { type: 'string', enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'], description: 'Required for weekly.' },
      day_of_month: { type: 'integer', description: 'Required for monthly. 1-31, 0=first workday, 32=last workday.' },
      interval: { type: 'integer', description: 'Repeat interval, default 1.' },
      only_workday: { type: 'boolean', description: 'Skip weekends. Default true for recurring jobs. Do not send for once.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      switch (args.operator) {
        case 'list': {
          const items = store.listSubscriptions()
          if (items.length === 0) return '当前没有订阅。'
          return items.map(item => formatSubscriptionLine(item)).join('\n')
        }
        case 'create': {
          if (!args.title || !args.prompt) throw new Error('创建订阅需要 title 和 prompt')
          if (args.hour === undefined || args.minute === undefined) throw new Error('创建订阅需要 hour 和 minute')
          const rule = buildRule(args)
          const description = args.description?.trim() || args.title
          const item = await store.createSubscription({
            title: args.title,
            description,
            prompt: args.prompt,
            rule,
          })
          return `已创建订阅：${formatSubscriptionLine(item)}`
        }
        case 'modify':
        case 'pause':
        case 'resume':
        case 'delete': {
          if (!args.title) throw new Error('操作订阅需要 title')
          const existing = store.findSubscription(args.title)
          if (existing === undefined) throw new Error(`未找到订阅：${args.title}`)
          const result = await store.updateSubscription(existing.title, {
            operator: args.operator,
            description: args.description,
            prompt: args.prompt,
            rule: args.operator === 'modify' && hasRulePatch(args)
              ? mergeRule(existing.rule, args)
              : undefined,
          })
          if ('deleted' in result) return `已删除订阅：${result.title}`
          return `已${labelOperator(args.operator)}订阅：${formatSubscriptionLine(result)}`
        }
        default:
          throw new Error(`未知 operator：${String(args.operator)}`)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'memory_manage',
    description: 'Manage the user\'s long-term personal memories and preferences (profile). Create, list, search, update, or delete. Search runs keyword tokens and a local embedding together. Use this when the user asks to remember a preference, recalls "你记着什么", or when advice should respect saved tastes/habits. Hide internal ids; refer by content.',
    parameters: {
      operator: {
        type: 'string',
        required: true,
        enum: ['create', 'list', 'search', 'update', 'delete'],
        description: 'create / list / search / update / delete',
      },
      content: { type: 'string', description: 'Memory text. Required for create; also used to find an existing memory.' },
      kind: {
        type: 'string',
        enum: ['preference', 'fact', 'note'],
        description: 'preference = tastes/habits; fact = stable personal info; note = other durable remarks.',
      },
      category: { type: 'string', description: 'Optional bucket such as 饮食/工作/沟通/生活.' },
      query: { type: 'string', description: 'Search text for operator=search. Keyword tokens and the local embedding run together.' },
      new_content: { type: 'string', description: 'Replacement text for operator=update.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      switch (args.operator) {
        case 'list': {
          return memory.formatBrief(80)
        }
        case 'search': {
          const q = args.query || args.content
          if (!q) throw new Error('搜索记忆需要 query 或 content')
          const items = memory.search(q, { status: 'active' })
          if (items.length === 0) return `没有找到与「${q}」相关的记忆。`
          return items.map(item => formatMemoryLine(item)).join('\n')
        }
        case 'create': {
          if (!args.content) throw new Error('创建记忆需要 content')
          const item = await memory.create({
            kind: (args.kind as MemoryKind | undefined) ?? 'preference',
            content: args.content,
            category: args.category,
            source: 'active',
          })
          return `已写入记忆：${formatMemoryLine(item)}`
        }
        case 'update': {
          if (!args.content) throw new Error('修改记忆需要 content（原内容或新内容）')
          const item = await memory.update(args.content, {
            kind: args.kind as MemoryKind | undefined,
            category: args.category,
            content: args.new_content,
          })
          return `已更新记忆：${formatMemoryLine(item)}`
        }
        case 'delete': {
          if (!args.content) throw new Error('删除记忆需要 content')
          const item = await memory.delete(args.content)
          return `已删除记忆：${item.content}`
        }
        default:
          throw new Error(`未知 operator：${String(args.operator)}`)
      }
    },
  }))
}

function formatMemoryLine(item: { kind: string; content: string; category: string }): string {
  const kind = { preference: '偏好', fact: '事实', note: '备注' }[item.kind] ?? item.kind
  const cat = item.category ? `/${item.category}` : ''
  return `《${kind}${cat}》 ${item.content}`
}

function formatTodoLine(todo: { title: string; dueDate: string | null; dueTime: string | null; status: string; notes: string }): string {
  const when = todo.dueDate ? `${todo.dueDate}${todo.dueTime ? ` ${todo.dueTime}` : ''}` : '无日期'
  const status = todo.status === 'completed' ? '已完成' : '未完成'
  const notes = todo.notes ? `；备注：${todo.notes}` : ''
  return `《${todo.title}》 ${when} · ${status}${notes}`
}

function formatSubscriptionLine(item: { title: string; description: string; status: string; rule: RecurrenceRule; nextRunAt: string | null }): string {
  const status = { running: '运行中', paused: '已暂停', completed: '已完成' }[item.status] ?? item.status
  const next = item.nextRunAt ? `；下次 ${formatLocal(item.nextRunAt)}` : ''
  return `《${item.title}》 ${describeRule(item.rule)} · ${status}${next}`
}

function formatLocal(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function labelOperator(operator: string): string {
  return { modify: '更新', pause: '暂停', resume: '恢复', delete: '删除' }[operator] ?? operator
}

function hasRulePatch(args: { rule_type?: string; hour?: number; minute?: number; execute_at?: string; day_of_week?: string; day_of_month?: number; interval?: number; only_workday?: boolean }): boolean {
  return args.rule_type !== undefined
    || args.hour !== undefined
    || args.minute !== undefined
    || args.execute_at !== undefined
    || args.day_of_week !== undefined
    || args.day_of_month !== undefined
    || args.interval !== undefined
    || args.only_workday !== undefined
}

function buildRule(args: {
  rule_type?: string
  hour: number
  minute: number
  execute_at?: string
  day_of_week?: string
  day_of_month?: number
  interval?: number
  only_workday?: boolean
}): RecurrenceRule {
  const type = (args.rule_type ?? 'once') as RepeatType
  return {
    type,
    hour: args.hour,
    minute: args.minute,
    executeAt: args.execute_at,
    dayOfWeek: args.day_of_week as Weekday | undefined,
    dayOfMonth: args.day_of_month,
    interval: args.interval,
    onlyWorkday: type === 'once' ? undefined : args.only_workday,
  }
}

function mergeRule(base: RecurrenceRule, args: {
  rule_type?: string
  hour?: number
  minute?: number
  execute_at?: string
  day_of_week?: string
  day_of_month?: number
  interval?: number
  only_workday?: boolean
}): RecurrenceRule {
  const type = (args.rule_type ?? base.type) as RepeatType
  return {
    type,
    hour: args.hour ?? base.hour,
    minute: args.minute ?? base.minute,
    executeAt: args.execute_at ?? base.executeAt,
    dayOfWeek: (args.day_of_week as Weekday | undefined) ?? base.dayOfWeek,
    dayOfMonth: args.day_of_month ?? base.dayOfMonth,
    interval: args.interval ?? base.interval,
    onlyWorkday: type === 'once' ? undefined : args.only_workday ?? base.onlyWorkday,
  }
}
