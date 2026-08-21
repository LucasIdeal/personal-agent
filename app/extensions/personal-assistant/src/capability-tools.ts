import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PlannerStore } from './store.ts'
import type { MemoryStore } from './memory-store.ts'
import { listCapabilities } from './capabilities.ts'

export function registerCapabilityTools(
  ctx: Context,
  store: PlannerStore,
  memory: MemoryStore,
  notesDir: string,
): void {
  ctx.tools.register(defineTool({
    name: 'info_search',
    description: 'Search across the user\'s memories, todos, subscriptions, and personal notes. Use for 信息检索 /「帮我找」「查一下」「上次说的」. Prefer this before guessing.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Keywords or a short natural-language query in Chinese or English.',
      },
      scope: {
        type: 'string',
        enum: ['all', 'memory', 'todos', 'notes', 'subscriptions'],
        description: 'Limit search scope. Default all.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const query = String(args.query ?? '').trim()
      if (!query) throw new Error('检索需要 query')
      const scope = (args.scope as string | undefined) ?? 'all'
      const hits = await collectHits(store, memory, notesDir, query, scope)
      if (hits.length === 0) return `没有找到与「${query}」相关的内容。`
      return [`检索「${query}」共 ${hits.length} 条：`, ...hits.slice(0, 20)].join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'task_brief',
    description: 'Produce a compact task-tracking brief from live todos and subscriptions. Use for 任务跟踪 / 今日优先 / 进度汇总.',
    parameters: {
      focus: {
        type: 'string',
        description: 'Optional focus area, e.g. 答辩 or 本周.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const focus = String(args.focus ?? '').trim()
      const pending = store.listTodos().filter(todo => todo.status !== 'completed')
      const filtered = focus
        ? pending.filter(todo => `${todo.title} ${todo.notes}`.includes(focus))
        : pending
      const today = formatDate(new Date())
      const overdue = filtered.filter(todo => todo.dueDate && todo.dueDate < today)
      const dueToday = filtered.filter(todo => todo.dueDate === today)
      const upcoming = filtered.filter(todo => !todo.dueDate || todo.dueDate > today)
      const subs = store.listSubscriptions().filter(item => item.status === 'running')
      const lines = [
        `任务跟踪${focus ? `（关注：${focus}）` : ''}：`,
        `- 未完成 ${filtered.length} · 过期 ${overdue.length} · 今日 ${dueToday.length}`,
      ]
      if (overdue.length) {
        lines.push('过期：')
        for (const todo of overdue.slice(0, 8)) lines.push(`- 《${todo.title}》 ${todo.dueDate}${todo.dueTime ? ` ${todo.dueTime}` : ''}`)
      }
      if (dueToday.length) {
        lines.push('今日：')
        for (const todo of dueToday.slice(0, 8)) lines.push(`- 《${todo.title}》${todo.dueTime ? ` ${todo.dueTime}` : ''}`)
      }
      if (upcoming.length) {
        lines.push('后续：')
        for (const todo of upcoming.slice(0, 8)) {
          const when = todo.dueDate ? `${todo.dueDate}${todo.dueTime ? ` ${todo.dueTime}` : ''}` : '无日期'
          lines.push(`- 《${todo.title}》 ${when}`)
        }
      }
      if (subs.length) {
        lines.push(`运行中订阅 ${subs.length}：`)
        for (const item of subs.slice(0, 6)) lines.push(`- 《${item.title}》`)
      }
      return lines.join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'list_capabilities',
    description: 'List available personal-assistant capability plugins, including built-in tools and installed SkillHub skills.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return listCapabilities()
        .map(item => `- ${item.title}${item.kind === 'skill' ? ' (skill)' : ''}：${item.blurb}`)
        .join('\n')
    },
  }))
}

async function collectHits(
  store: PlannerStore,
  memory: MemoryStore,
  notesDir: string,
  query: string,
  scope: string,
): Promise<string[]> {
  const tokens = tokenize(query)
  const hits: string[] = []
  if (scope === 'all' || scope === 'memory') {
    for (const item of memory.list({ status: 'active', q: query })) {
      hits.push(`记忆 · ${item.category || item.kind}：${item.content}`)
    }
  }
  if (scope === 'all' || scope === 'todos') {
    for (const todo of store.listTodos()) {
      if (!matchText(`${todo.title} ${todo.notes}`, tokens)) continue
      const when = [todo.dueDate, todo.dueTime].filter(Boolean).join(' ')
      hits.push(`待办 · 《${todo.title}》${when ? ` ${when}` : ''} · ${todo.status === 'completed' ? '已完成' : '未完成'}`)
    }
  }
  if (scope === 'all' || scope === 'subscriptions') {
    for (const item of store.listSubscriptions()) {
      if (!matchText(`${item.title} ${item.description} ${item.prompt}`, tokens)) continue
      hits.push(`订阅 · 《${item.title}》 ${item.status}`)
    }
  }
  if (scope === 'all' || scope === 'notes') {
    try {
      const names = (await readdir(notesDir)).filter(name => name.endsWith('.md'))
      for (const name of names) {
        const body = await readFile(join(notesDir, name), 'utf8')
        if (!matchText(`${name} ${body}`, tokens)) continue
        const slug = name.slice(0, -3)
        const preview = body.trim().split(/\n+/).find(Boolean)?.slice(0, 80) ?? ''
        hits.push(`笔记 · ${slug}${preview ? `：${preview}` : ''}`)
      }
    } catch {
      // notes dir may be empty
    }
  }
  return hits
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s，。！？、,./\\|;:：；]+/)
    .map(part => part.trim())
    .filter(part => part.length >= 1)
}

function matchText(haystack: string, tokens: string[]): boolean {
  const text = haystack.toLowerCase()
  if (tokens.length === 0) return false
  return tokens.every(token => text.includes(token))
}

function formatDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}
