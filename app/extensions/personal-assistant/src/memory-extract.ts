import type { MemoryExtractResult, MemoryKind, ProposedMemory, ProposedTodo } from './types.ts'
import { formatDate } from './store.ts'

const REMEMBER_PREFIX = /^(?:请你?|麻烦你?|帮我)?(?:记住|记下|记一下|记着)(?:一下)?[：:，,\s]*/
const TIME_HINT = /(明天|后天|今晚|今天|下周|这周|本周|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}月\d{1,2}[日号]|\d{4}-\d{2}-\d{2}|\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*点(半|钟)?|上午|下午|晚上|中午|凌晨|截止|之前)/
const RECALL_RE = /你记[得着]什么|我的(偏好|记忆)|记忆列表|查看记忆|看看记忆|你还记得/

export function isRecallIntent(text: string): boolean {
  return RECALL_RE.test(text.trim())
}

export function isRememberIntent(text: string): boolean {
  const trimmed = text.trim()
  if (isRecallIntent(trimmed)) return false
  return /(?:请你?|麻烦你?|帮我)?(?:记住|记下|记一下|记着)/.test(trimmed)
}

export function stripRememberTrigger(text: string): string {
  return text.trim().replace(REMEMBER_PREFIX, '').replace(/[。！!]+$/g, '').trim()
}

export function extractHeuristic(text: string, now = new Date()): MemoryExtractResult {
  const payload = stripRememberTrigger(text)
  if (!payload) return { memories: [], todos: [] }
  const clauses = splitClauses(payload)
  const memories: ProposedMemory[] = []
  const todos: ProposedTodo[] = []
  for (const clause of clauses) {
    if (TIME_HINT.test(clause)) {
      const todo = clauseToTodo(clause, now)
      if (todo) {
        todos.push(todo)
        continue
      }
    }
    memories.push(clauseToMemory(clause))
  }
  return dedupeExtract({ memories, todos })
}

function splitClauses(text: string): string[] {
  const parts = text
    .split(/[\n；;]+|(?<=[^，,\s]{2,})[，,](?=[^，,\s]{2,})/)
    .map(part => part.trim())
    .filter(part => part.length >= 2)
  return parts.length > 0 ? parts : [text]
}

function clauseToMemory(clause: string): ProposedMemory {
  const kind: MemoryKind = /喜欢|不喜欢|不要|别|习惯|偏好|更爱|讨厌|受不了/.test(clause)
    ? 'preference'
    : /叫|是|在|用|工作|住/.test(clause) ? 'fact' : 'preference'
  const category = inferCategory(clause)
  return { kind, content: normalizeMemory(clause), category }
}

function clauseToTodo(clause: string, now: Date): ProposedTodo | null {
  const title = clause
    .replace(/^(请|帮我|记得|提醒我|不要忘记)/, '')
    .replace(/(明天|后天|今晚|今天|下周|这周|本周)/g, '')
    .replace(/周[一二三四五六日天]/g, '')
    .replace(/星期[一二三四五六日天]/g, '')
    .replace(/\d{1,2}月\d{1,2}[日号]/g, '')
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    .replace(/(上午|下午|晚上|中午|凌晨)/g, '')
    .replace(/\d{1,2}\s*[:：]\s*\d{2}/g, '')
    .replace(/\d{1,2}\s*点(半|钟)?/g, '')
    .replace(/[，。\s]+/g, ' ')
    .trim()
  if (!title) return null
  return {
    title,
    notes: clause,
    dueDate: inferDate(clause, now),
    dueTime: inferTime(clause),
  }
}

function inferCategory(text: string): string {
  if (/股票|基金|etf|持股|持仓|投资/i.test(text)) return '股票'
  if (/吃|喝|咖啡|茶|菜|口味|香菜|辣/.test(text)) return '饮食'
  if (/开会|工作|邮件|周报|代码|编辑器|缩进|tabs|spaces/.test(text)) return '工作'
  if (/沟通|称呼|语气|语言|中文|英文/.test(text)) return '沟通'
  if (/住|通勤|家|公司/.test(text)) return '生活'
  return '偏好'
}

function inferDate(text: string, now: Date): string | null {
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const md = text.match(/(\d{1,2})月(\d{1,2})[日号]/)
  if (md) {
    const month = Number(md[1])
    const day = Number(md[2])
    const year = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() > day)
      ? now.getFullYear() + 1
      : now.getFullYear()
    return `${year}-${pad(month)}-${pad(day)}`
  }
  if (text.includes('今天') || text.includes('今晚')) return formatDate(now)
  if (text.includes('明天')) return formatDate(shiftDays(now, 1))
  if (text.includes('后天')) return formatDate(shiftDays(now, 2))
  const weekday = parseWeekday(text)
  if (weekday !== null) {
    const delta = (weekday - now.getDay() + 7) % 7
    const offset = /下周/.test(text) ? (delta === 0 ? 7 : delta + 7) : (delta === 0 ? 7 : delta)
    return formatDate(shiftDays(now, offset))
  }
  return formatDate(now)
}

function inferTime(text: string): string | null {
  const hm = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/)
  if (hm) return `${pad(Number(hm[1]))}:${hm[2]}`
  const point = text.match(/(\d{1,2})\s*点(半)?/)
  if (!point) return null
  let hour = Number(point[1])
  const minute = point[2] ? 30 : 0
  if (/下午|晚上/.test(text) && hour < 12) hour += 12
  if (/中午/.test(text) && hour < 12) hour = 12
  if (/凌晨/.test(text) && hour === 12) hour = 0
  if (!/(上午|下午|晚上|中午|凌晨)/.test(text) && hour > 0 && hour <= 7) hour += 12
  return `${pad(hour)}:${pad(minute)}`
}

function parseWeekday(text: string): number | null {
  const map: Record<string, number> = {
    日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
  }
  const match = text.match(/(?:周|星期)([一二三四五六日天])/)
  return match ? map[match[1]] ?? null : null
}

function normalizeMemory(text: string): string {
  return text.replace(/^(我|用户)/, '').replace(/[。！!]+$/g, '').trim()
}

function dedupeExtract(result: MemoryExtractResult): MemoryExtractResult {
  const seen = new Set<string>()
  const memories = result.memories.filter((item) => {
    const key = item.content.replace(/\s+/g, '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  const todos = result.todos.filter((item) => {
    const key = `todo:${item.title}:${item.dueDate}:${item.dueTime}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { memories, todos }
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function parseExtractJson(raw: string): MemoryExtractResult | null {
  const json = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = json.indexOf('{')
  const end = json.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(json.slice(start, end + 1)) as {
      memories?: Array<{ kind?: string; content?: string; category?: string }>
      todos?: Array<{ title?: string; notes?: string; dueDate?: string | null; dueTime?: string | null }>
    }
    const memories = (parsed.memories ?? [])
      .map((item): ProposedMemory | null => {
        const content = String(item.content ?? '').trim()
        if (!content) return null
        const kind = item.kind === 'fact' || item.kind === 'note' ? item.kind : 'preference'
        return { kind, content, category: String(item.category ?? '').trim() }
      })
      .filter((item): item is ProposedMemory => item !== null)
    const todos = (parsed.todos ?? [])
      .map((item): ProposedTodo | null => {
        const title = String(item.title ?? '').trim()
        if (!title) return null
        return {
          title,
          notes: String(item.notes ?? '').trim(),
          dueDate: item.dueDate ? String(item.dueDate) : null,
          dueTime: item.dueTime ? String(item.dueTime) : null,
        }
      })
      .filter((item): item is ProposedTodo => item !== null)
    return dedupeExtract({ memories, todos })
  } catch {
    return null
  }
}

export const EXTRACT_SYSTEM = [
  '你从用户消息里提取需要长期记住的个人偏好/事实，以及带明确时间的待办。',
  '只输出 JSON：{"memories":[{"kind":"preference|fact|note","content":"...","category":"..."}],"todos":[{"title":"...","notes":"...","dueDate":"YYYY-MM-DD|null","dueTime":"HH:mm|null"}]}',
  'kind=preference 表示口味/习惯/沟通偏好；fact 表示稳定个人信息；note 表示其他值得记住的备注。',
  '有明确日期或时刻的事项放 todos，不要放 memories。没有时间就不要编造 todos。',
  'content/title 写成第三人称可复用的短句，不要包含「记住」「记下」。',
  '不要提取一次性闲聊、代码细节或会话过程。没有可记内容时返回空数组。',
].join('\n')

export const SCAN_SYSTEM = [
  '你在回顾昨天的对话流水，提取用户亲口表达、且对今后交互仍有用的稳定偏好与事实，写入长期 profile。',
  '只输出 JSON：{"memories":[{"kind":"preference|fact|note","content":"...","category":"..."}],"todos":[]}',
  'kind=preference 表示口味/习惯/沟通偏好；fact 表示稳定个人信息；note 表示其它长期备注。',
  '只提取：用户明确说出的口味、习惯、沟通方式、身份信息、长期工作偏好；或用户当场确认（如「对/就这样/记住」）后可归纳成一句的偏好。',
  'content 写成第三人称、独立、可复用的完整短句（8–80 字），如「起草消息时偏好多个语气版本供选择」。不要包含「记住」「记下」。',
  '绝不提取：助理生成的草稿/模板/示例文案（含「老师您好」「各位」「---」「正文直接复制版」「供你选择：」等片段）；',
  '助理推测或建议（除非用户当场确认）；一次性任务、代码细节、工具日志、待办、已过期日程；Markdown 标题/列表/格式符号；不完整半句。',
  '以「用户：」行为主；「助理：」行仅作理解用户意图的参考，不可直接摘句写入。没有合格条目时返回 {"memories":[],"todos":[]}。',
].join('\n')

const SCAN_NOISE = [
  /^-{2,}$/,
  /^#{1,3}\s/,
  /^[-*•]\s/,
  /^\*\*[^*]+\*\*$/,
  /^(各位|老师您好|感谢理解|谢谢大家|供你选择)[：:。.!]?$/,
  /^(肚子|各位|老师\/同学们)$/,
  /正文（直接复制版）/,
  /更简洁口语|更正式（适合|版）/,
  /^(马上动作|默认提供|给我几版|直接跟我说|会套用|你不用再|要不要我现在|全记得)/,
  /^：/,
  /关系较熟/,
  /发导师|发群聊/,
  /按你的方式给我几版/,
  /格式模板/,
  /用户画像/,
  /围绕这条记忆/,
  /你记得：/,
]

/** Drop scan artifacts: draft fragments, markdown debris, and assistant boilerplate. */
export function filterScanMemories(result: MemoryExtractResult): MemoryExtractResult {
  const memories = result.memories.filter(item => !isScanNoise(item.content))
  return { memories, todos: result.todos }
}

function isScanNoise(content: string): boolean {
  const text = content.replace(/\s+/g, ' ').trim()
  if (text.length < 8) return true
  if (/^(助理|用户)[：:]/.test(text)) return true
  if (/^[\-*#:：|/\\]+/.test(text)) return true
  if (/^[\d]+[.)]\s/.test(text)) return true
  if ((text.match(/\*\*/g) ?? []).length >= 2) return true
  if (SCAN_NOISE.some(pattern => pattern.test(text))) return true
  if (text.length < 16 && !/[。！？]$/.test(text)) return true
  return false
}
