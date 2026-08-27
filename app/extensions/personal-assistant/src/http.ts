import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { describeRule, type PlannerStore } from './store.ts'
import type { MemoryStore } from './memory-store.ts'
import { ensureUniqueEmojis, fallbackHints } from './hints-llm.ts'
import { listCapabilities } from './capabilities.ts'
import type { CapabilityCatalog } from './capability-catalog.ts'
import { installSkillHubSkill, listInstalledSkillSlugs, searchSkillHub, skillInstallTargets } from './skillhub.ts'
import type { HintSet, MemoryExtractResult, MemoryKind, RecurrenceRule, TodoStatus } from './types.ts'
import type { LlmSetupInput, LlmSetupState } from './llm-setup.ts'

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

export interface PlannerHttpDeps {
  extract: (text: string) => Promise<MemoryExtractResult>
  scan: () => Promise<{ day: string; proposed: number; written: number }>
  refreshHints: (force?: boolean) => Promise<HintSet>
  readSetup: () => Promise<LlmSetupState>
  applySetup: (body: LlmSetupInput) => Promise<LlmSetupState>
}

export function registerPlannerHttp(
  server: WebServer,
  store: PlannerStore,
  memory: MemoryStore,
  webDir: string,
  notesDir: string,
  catalog: CapabilityCatalog,
  deps: PlannerHttpDeps,
): void {
  server.register({
    kind: 'prefix',
    path: '/planner-ui',
    handler: (req, res) => serveStatic(req, res, webDir),
  })
  server.register({
    kind: 'prefix',
    path: '/planner-api',
    handler: (req, res) => handleApi(req, res, store, memory, notesDir, catalog, deps),
  })
  server.tapIndex(html => html.replace(
    '</head>',
    '<link rel="stylesheet" href="/planner-ui/planner.css?v=29">\n<script type="module" src="/planner-ui/planner.js?v=29"></script>\n</head>',
  ))
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, webDir: string): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://x').pathname.replace('/planner-ui', '') || '/'
  const target = resolve(normalize(join(webDir, pathname)))
  if (target !== webDir && !target.startsWith(webDir + sep)) {
    res.writeHead(403)
    res.end()
    return
  }
  try {
    const body = await readFile(target)
    res.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  store: PlannerStore,
  memory: MemoryStore,
  notesDir: string,
  catalog: CapabilityCatalog,
  deps: PlannerHttpDeps,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://x')
    const parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean)
    const rest = parts.slice(1)
    const method = req.method ?? 'GET'
    if (method === 'GET' && rest.length === 0) {
      json(res, 200, serializeState(store, memory))
      return
    }
    if (method === 'GET' && rest[0] === 'capabilities' && rest.length === 1) {
      json(res, 200, { items: listCapabilities() })
      return
    }
    if (method === 'GET' && rest[0] === 'setup' && rest.length === 1) {
      json(res, 200, await deps.readSetup())
      return
    }
    if (method === 'GET' && rest[0] === 'skills' && rest.length === 1) {
      json(res, 200, {
        installed: catalog.listSkills(),
        slugs: await listInstalledSkillSlugs(notesDir),
        skillsDir: skillInstallTargets(notesDir).primary,
      })
      return
    }
    const body = method === 'GET' || method === 'HEAD' ? {} : await readJson(req)
    if (method === 'POST' && rest[0] === 'setup' && rest.length === 1) {
      json(res, 200, await deps.applySetup(body))
      return
    }
    if (method === 'POST' && rest[0] === 'skills' && rest[1] === 'search' && rest.length === 2) {
      const result = await searchSkillHub(String(body.q ?? body.query ?? ''))
      json(res, 200, result)
      return
    }
    if (method === 'POST' && rest[0] === 'skills' && rest[1] === 'install' && rest.length === 2) {
      const slug = String(body.slug ?? '')
      const installed = await installSkillHubSkill(notesDir, slug, body.force === true)
      if (installed.ok) {
        const items = await catalog.refresh(notesDir)
        void deps.refreshHints(true)
        json(res, 200, { ...installed, capabilities: items })
        return
      }
      json(res, 400, installed)
      return
    }
    if (method === 'POST' && rest[0] === 'skills' && rest[1] === 'refresh' && rest.length === 2) {
      const items = await catalog.refresh(notesDir)
      json(res, 200, { items, capabilities: items })
      return
    }
    if (method === 'GET' && rest[0] === 'hints' && rest.length === 1) {
      const cached = memory.getHintSet()
      if (!cached) void deps.refreshHints()
      json(res, 200, { items: hintsForClient(store, memory), generatedAt: cached?.generatedAt ?? null })
      return
    }
    if (method === 'GET' && rest[0] === 'brief' && rest.length === 1) {
      json(res, 200, { text: store.formatBrief() })
      return
    }
    if (method === 'GET' && rest[0] === 'memories' && rest.length === 1) {
      const q = url.searchParams.get('q') ?? undefined
      json(res, 200, {
        items: q?.trim() ? memory.search(q) : memory.list(),
        brief: memory.formatBrief(),
      })
      return
    }
    if (method === 'POST' && rest[0] === 'memory' && rest[1] === 'extract' && rest.length === 2) {
      json(res, 200, await deps.extract(String(body.text ?? '')))
      return
    }
    if (method === 'POST' && rest[0] === 'memory' && rest[1] === 'commit' && rest.length === 2) {
      const committed = await commitMemoryDraft(store, memory, body)
      void deps.refreshHints(true)
      json(res, 200, committed)
      return
    }
    if (method === 'POST' && rest[0] === 'hints' && rest[1] === 'refresh' && rest.length === 2) {
      const set = await deps.refreshHints(true)
      json(res, 200, { items: ensureUniqueEmojis(set.items), generatedAt: set.generatedAt })
      return
    }
    if (method === 'POST' && rest[0] === 'memory' && rest[1] === 'scan' && rest.length === 2) {
      const scanned = await deps.scan()
      void deps.refreshHints(true)
      json(res, 200, scanned)
      return
    }
    if (method === 'POST' && rest[0] === 'memories' && rest.length === 1) {
      const item = await memory.create({
        kind: (optionalString(body.kind) as MemoryKind | undefined) ?? 'preference',
        content: String(body.content ?? ''),
        category: optionalString(body.category),
        source: 'manual',
      })
      void deps.refreshHints(true)
      json(res, 200, item)
      return
    }
    if ((method === 'PATCH' || method === 'POST') && rest[0] === 'memories' && rest[1]) {
      const item = await memory.update(rest[1], {
        kind: optionalString(body.kind) as MemoryKind | undefined,
        content: optionalString(body.content),
        category: optionalString(body.category),
        status: optionalString(body.status) as 'active' | 'archived' | undefined,
      })
      void deps.refreshHints(true)
      json(res, 200, item)
      return
    }
    if (method === 'DELETE' && rest[0] === 'memories' && rest[1]) {
      const item = await memory.delete(rest[1])
      void deps.refreshHints(true)
      json(res, 200, item)
      return
    }
    if (method === 'POST' && rest[0] === 'todos' && rest.length === 1) {
      const todo = await store.createTodo({
        title: String(body.title ?? ''),
        notes: optionalString(body.notes),
        dueDate: optionalString(body.dueDate) ?? null,
        dueTime: optionalString(body.dueTime) ?? null,
      })
      json(res, 200, todo)
      return
    }
    if ((method === 'PATCH' || method === 'POST') && rest[0] === 'todos' && rest[1]) {
      const todo = await store.updateTodo(rest[1], {
        title: optionalString(body.title),
        notes: optionalString(body.notes),
        dueDate: body.dueDate === undefined ? undefined : optionalString(body.dueDate) ?? null,
        dueTime: body.dueTime === undefined ? undefined : optionalString(body.dueTime) ?? null,
        status: body.status as TodoStatus | undefined,
      })
      json(res, 200, todo)
      return
    }
    if (method === 'DELETE' && rest[0] === 'todos' && rest[1]) {
      json(res, 200, await store.deleteTodo(rest[1]))
      return
    }
    if (method === 'POST' && rest[0] === 'inbox' && rest[1] === 'read' && rest[2]) {
      await store.markInboxRead(rest[2])
      json(res, 200, { ok: true })
      return
    }
    if (method === 'POST' && rest[0] === 'subscriptions' && rest.length === 1) {
      const item = await store.createSubscription({
        title: String(body.title ?? ''),
        description: String(body.description ?? body.title ?? ''),
        prompt: String(body.prompt ?? ''),
        rule: body.rule as RecurrenceRule,
      })
      json(res, 200, { ...item, ruleLabel: describeRule(item.rule) })
      return
    }
    if ((method === 'PATCH' || method === 'POST') && rest[0] === 'subscriptions' && rest[1]) {
      const operator = (rest[2] ?? body.operator ?? 'modify') as 'modify' | 'pause' | 'resume' | 'delete'
      const item = await store.updateSubscription(rest[1], {
        operator,
        title: optionalString(body.title),
        description: optionalString(body.description),
        prompt: optionalString(body.prompt),
        rule: body.rule as RecurrenceRule | undefined,
      })
      json(res, 200, item)
      return
    }
    if (method === 'DELETE' && rest[0] === 'subscriptions' && rest[1]) {
      json(res, 200, await store.updateSubscription(rest[1], { operator: 'delete' }))
      return
    }
    json(res, 404, { error: 'not found' })
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

async function commitMemoryDraft(
  store: PlannerStore,
  memory: MemoryStore,
  body: Record<string, unknown>,
): Promise<{ memories: unknown[]; todos: unknown[] }> {
  const memoriesIn = Array.isArray(body.memories) ? body.memories : []
  const todosIn = Array.isArray(body.todos) ? body.todos : []
  const memories = []
  const todos = []
  for (const raw of memoriesIn) {
    const item = raw as { kind?: string; content?: string; category?: string }
    memories.push(await memory.create({
      kind: (item.kind as MemoryKind | undefined) ?? 'preference',
      content: String(item.content ?? ''),
      category: item.category,
      source: 'active',
    }))
  }
  for (const raw of todosIn) {
    const item = raw as { title?: string; notes?: string; dueDate?: string | null; dueTime?: string | null }
    todos.push(await store.createTodo({
      title: String(item.title ?? ''),
      notes: item.notes,
      dueDate: item.dueDate ?? null,
      dueTime: item.dueTime ?? null,
    }))
  }
  return { memories, todos }
}

function serializeState(store: PlannerStore, memory: MemoryStore) {
  const snap = store.snapshot()
  const memories = memory.list({ status: 'active' })
  return {
    ...snap,
    subscriptions: snap.subscriptions.map(item => ({
      ...item,
      ruleLabel: describeRule(item.rule),
      nextRunLabel: item.nextRunAt ? formatLocal(item.nextRunAt) : null,
    })),
    inbox: snap.inbox.filter(item => !item.read).slice(0, 8),
    memories,
    memoryCount: memories.length,
    hints: hintsForClient(store, memory),
    capabilities: listCapabilities(),
  }
}

function hintsForClient(store: PlannerStore, memory: MemoryStore) {
  return ensureUniqueEmojis(memory.getHintSet()?.items ?? fallbackHints(store, memory))
}

function formatLocal(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as Record<string, unknown>
}
