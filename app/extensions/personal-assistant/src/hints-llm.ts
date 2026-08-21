import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { formatDate, type PlannerStore } from './store.ts'
import type { MemoryStore } from './memory-store.ts'
import { completeText } from './memory-llm.ts'
import type { Hint, HintSet } from './types.ts'

const HINT_EMOJIS = ['🎯', '☕', '🧠', '📝', '📅', '💡', '🔔', '🎤', '📌', '🗂️'] as const

const HINT_SYSTEM = [
  '你只输出一个 JSON 对象，不要分析、不要前言、不要 markdown。',
  '格式：{"hints":[{"title":"...","prompt":"...","reason":"..."}]}',
  '恰好 4 条。title 以一个 emoji 开头，空格后跟 6–14 个汉字；prompt 是可直接发送的一句中文；reason 不超过 8 个汉字。',
  '四条必须彼此不同：角度、动词、对象都不能重复。四条意图分别来自：待办跟进、个人偏好、回忆整理、答辩或工作协助。',
  '每条 title 用不同 emoji。结合用户画像与待办，禁止编造不存在的事实。',
  '第一个字符必须是 {，最后一个字符必须是 }。',
].join('\n')

let inflight: Promise<HintSet> | null = null
let hintBatch = 0
let llmJob = 0

export function hintFingerprint(memoryBrief: string, plannerBrief: string, now = new Date()): string {
  const hour = now.getHours()
  const bucket = hour < 12 ? 'am' : hour < 18 ? 'pm' : 'night'
  return `${formatDate(now)}:${bucket}:${simpleHash(`${memoryBrief}\n${plannerBrief}`)}`
}

export function fallbackHints(
  store: PlannerStore,
  memory?: MemoryStore,
  options: { exclude?: string[]; salt?: number } = {},
): Hint[] {
  const pending = store.listTodos().filter(todo => todo.status !== 'completed')
  const profile = memory?.list({ status: 'active' }) ?? []
  const kindLabel = { preference: '偏好', fact: '事实', note: '备注' } as const
  const pool: Hint[] = []
  for (const item of profile) {
    pool.push({
      id: `fb-mem-${item.id}`,
      title: clip(oneLine(item.content), 14),
      prompt: `你记得：${item.content}。围绕这条记忆，给我一个今天就能用上的具体建议。`,
      reason: item.category || kindLabel[item.kind] || '记忆',
    })
  }
  for (const todo of pending) {
    const when = [todo.dueDate, todo.dueTime].filter(Boolean).join(' ')
    pool.push({
      id: `fb-todo-${todo.id}`,
      title: clip(`跟进：${todo.title}`, 14),
      prompt: `请帮我跟进待办「${todo.title}」${when ? `（${when}）` : ''}，给出今天能推进的下一步。`,
      reason: '待办',
    })
  }
  if (profile.some(item => /答辩/.test(item.content)) || pending.some(todo => /答辩/.test(todo.title))) {
    pool.push({
      id: 'fb-defense',
      title: '帮我准备部门答辩',
      prompt: '结合已有待办和记忆，帮我列一个部门答辩的简洁提纲和下一步。',
      reason: '答辩',
    })
  }
  pool.push(
    {
      id: 'fb-today',
      title: '今天该做什么？',
      prompt: '帮我看看今天有哪些待办和订阅，按紧急程度排一下，并给一句建议。',
      reason: '日程',
    },
    {
      id: 'fb-memory',
      title: '你还记得我什么？',
      prompt: '用几句话说说你目前记住的我的偏好和事实，漏了什么我再补。',
      reason: '画像',
    },
  )
  const excluded = new Set((options.exclude ?? []).map(title => stripEmoji(title)))
  const unique = dedupeHints(pool)
  const preferred = unique.filter(item => !excluded.has(stripEmoji(item.title)))
  const source = preferred.length >= 4 ? preferred : unique
  if (source.length === 0) return ensureUniqueEmojis(unique).slice(0, 4)
  const offset = Math.abs(options.salt ?? 0) % source.length
  const picked: Hint[] = []
  for (let i = 0; i < source.length && picked.length < 4; i += 1) {
    picked.push(source[(offset + i) % source.length])
  }
  return ensureUniqueEmojis(picked)
}

export function refreshHints(
  memory: MemoryStore,
  store: PlannerStore,
  getContext: () => Context | undefined,
  force = false,
): Promise<HintSet> {
  if (inflight) {
    if (!force) return inflight
    const pending = inflight
    const job = pending
      .catch(() => undefined)
      .then(() => runRefresh(memory, store, getContext, true))
    inflight = job.finally(() => {
      if (inflight === job) inflight = null
    })
    return inflight
  }
  const job = runRefresh(memory, store, getContext, force)
  inflight = job.finally(() => {
    if (inflight === job) inflight = null
  })
  return inflight
}

async function runRefresh(
  memory: MemoryStore,
  store: PlannerStore,
  getContext: () => Context | undefined,
  force: boolean,
): Promise<HintSet> {
  const memoryBrief = memory.formatBrief()
  const plannerBrief = store.formatBrief()
  const fingerprint = hintFingerprint(memoryBrief, plannerBrief)
  const current = memory.getHintSet()
  if (!force && current && current.fingerprint === fingerprint && current.items.length > 0) {
    return current
  }
  const previous = current?.items.map(item => item.title) ?? []
  if (force) hintBatch += 1
  const items = fallbackHints(store, memory, {
    exclude: force ? previous : [],
    salt: hintBatch * 4,
  })
  const set: HintSet = {
    fingerprint,
    generatedAt: new Date().toISOString(),
    items,
  }
  memory.saveHintSet(set)
  console.log(`[personal-assistant] hints ready n=${items.length} source=fallback`)
  const ctx = getContext()
  if (ctx) {
    const job = ++llmJob
    void generateHints(ctx, memoryBrief, plannerBrief, previous, force).then((generated) => {
      if (job !== llmJob || !generated || generated.length === 0) return
      const mixed = padHints(generated, items)
      memory.saveHintSet({
        fingerprint,
        generatedAt: new Date().toISOString(),
        items: mixed,
      })
      console.log(`[personal-assistant] hints ready n=${mixed.length} source=llm`)
    }).catch((error: unknown) => {
      console.warn('[personal-assistant] hints llm', error)
    })
  }
  return set
}

async function generateHints(
  ctx: Context,
  memoryBrief: string,
  plannerBrief: string,
  previous: string[] = [],
  vary = false,
): Promise<Hint[] | null> {
  const now = new Date()
  const prompt = [
    `现在是 ${formatLocal(now)}。`,
    '用户画像：',
    memoryBrief,
    '',
    '待办与订阅：',
    plannerBrief,
    previous.length > 0 ? `\n不要重复这些开场：${previous.join('、')}。换四个新角度，优先用最新记忆。` : '',
    '',
    '只输出 JSON，从 { 开始。',
  ].filter(Boolean).join('\n')
  const text = await completeText(ctx, HINT_SYSTEM, prompt, {
    maxTokens: 800,
    timeoutMs: 20_000,
    temperature: vary ? 0.8 : 0.3,
  })
  if (!text) {
    console.warn('[personal-assistant] hints llm empty')
    return null
  }
  const parsed = parseHintsJson(text)
  if (!parsed) console.warn('[personal-assistant] hints llm parse failed', text.slice(0, 200))
  return parsed
}

export function parseHintsJson(raw: string): Hint[] | null {
  const json = extractHintsJson(raw)
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as {
      hints?: Array<{ title?: string; prompt?: string; reason?: string }>
    }
    const items = (parsed.hints ?? [])
      .map((item): Hint | null => {
        const title = clip(stripEmoji(String(item.title ?? '').trim()), 18)
        const prompt = String(item.prompt ?? '').trim()
        if (!title || !prompt) return null
        return {
          id: `hint_${randomUUID().slice(0, 8)}`,
          title: `${leadingEmoji(String(item.title ?? '')) ?? ''} ${title}`.trim(),
          prompt,
          reason: clip(String(item.reason ?? '').trim(), 24),
        }
      })
      .filter((item): item is Hint => item !== null)
    const unique = ensureUniqueEmojis(dedupeHints(items))
    return unique.length > 0 ? unique.slice(0, 4) : null
  } catch {
    return null
  }
}

function padHints(items: Hint[], fallback: Hint[]): Hint[] {
  const merged = ensureUniqueEmojis(dedupeHints([...items, ...fallback]))
  return merged.slice(0, 4)
}

function dedupeHints(items: Hint[]): Hint[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = stripEmoji(item.title).replace(/\s+/g, '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function ensureUniqueEmojis(items: Hint[]): Hint[] {
  const used = new Set<string>()
  return items.map((item, index) => {
    const existing = leadingEmoji(item.title)
    let emoji = existing && !used.has(existing) ? existing : undefined
    if (!emoji) emoji = HINT_EMOJIS.find(mark => !used.has(mark)) ?? HINT_EMOJIS[index % HINT_EMOJIS.length]
    used.add(emoji)
    return { ...item, title: `${emoji} ${stripEmoji(item.title)}` }
  })
}

function leadingEmoji(text: string): string | undefined {
  return text.match(/^\p{Extended_Pictographic}(?:\uFE0F)?/u)?.[0]
}

function stripEmoji(text: string): string {
  return text.replace(/^\p{Extended_Pictographic}(?:\uFE0F)?\s*/u, '').trim()
}

function extractHintsJson(raw: string): string | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const keyed = text.search(/\{\s*"hints"/)
  const start = keyed >= 0 ? keyed : text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inStr) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function simpleHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16)
}

function formatLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
