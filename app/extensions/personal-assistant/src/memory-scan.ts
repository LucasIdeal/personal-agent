import { DatabaseSync } from 'node:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import type { MemoryStore } from './memory-store.ts'
import { extractFromTranscript } from './memory-llm.ts'
import { formatDate } from './store.ts'
import type { MemoryExtractResult } from './types.ts'

interface ScanDeps {
  sessionsPath: string
  getContext?: () => Context | undefined
}

export async function scanYesterday(
  memory: MemoryStore,
  deps: ScanDeps,
  now = new Date(),
  force = false,
): Promise<{ day: string; proposed: number; written: number }> {
  const day = formatDate(shiftDays(now, -1))
  if (!force && memory.lastScanDay() === day) {
    return { day, proposed: 0, written: 0 }
  }
  const transcript = readDayTranscript(deps.sessionsPath, day)
  console.log(`[personal-assistant] memory scan start ${day} chars=${transcript.length}`)
  if (!transcript.trim()) {
    memory.recordScan(day, 0, 0)
    return { day, proposed: 0, written: 0 }
  }
  const ctx = deps.getContext?.()
  let extracted: MemoryExtractResult = { memories: [], todos: [] }
  try {
    if (!ctx || !canUseLlm(ctx)) {
      console.warn('[personal-assistant] memory scan skip: llm not ready')
      return { day, proposed: 0, written: 0 }
    }
    extracted = await Promise.race([
      extractFromTranscript(ctx, transcript, now),
      new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('memory scan timed out')), 15_000)
      }),
    ]) ?? { memories: [], todos: [] }
  } catch (error) {
    console.warn('[personal-assistant] memory scan extract', error)
    return { day, proposed: 0, written: 0 }
  }
  let written = 0
  for (const item of extracted.memories) {
    if (memory.findByContent(item.content)) continue
    await memory.create({
      kind: item.kind,
      content: item.content,
      category: item.category,
      source: 'scan',
    })
    written += 1
  }
  memory.recordScan(day, extracted.memories.length, written)
  console.log(`[personal-assistant] memory scan ${day} proposed=${extracted.memories.length} written=${written}`)
  return { day, proposed: extracted.memories.length, written }
}

function readDayTranscript(sessionsPath: string, day: string): string {
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(sessionsPath, { readOnly: true })
    const start = Date.parse(`${day}T00:00:00`)
    const end = start + 86_400_000
    if (!Number.isFinite(start)) return ''
    const rows = db.prepare(`
      SELECT type, time, data FROM events
      WHERE time >= ? AND time < ? AND type IN ('user/message', 'assistant/message')
      ORDER BY time ASC
      LIMIT 400
    `).all(start, end) as Array<{ type: string; time: number; data: string }>
    const lines: string[] = []
    for (const row of rows) {
      const text = eventText(row.type, row.data)
      if (!text) continue
      if (text.startsWith('【待办管理会话】') || text.startsWith('【记忆')) continue
      if (text.startsWith('Time sampled while preparing')) continue
      if (text.startsWith('用户画像')) continue
      const who = row.type === 'user/message' ? '用户' : '助理'
      lines.push(`${who}：${text.slice(0, 500)}`)
    }
    return lines.join('\n')
  } catch (error) {
    console.warn('[personal-assistant] memory scan read sessions', error)
    return ''
  } finally {
    db?.close()
  }
}

function eventText(type: string, raw: string): string {
  try {
    const data = JSON.parse(raw) as {
      content?: Array<{ type?: string; text?: string }>
      message?: { content?: Array<{ type?: string; text?: string }> }
      source?: { kind?: string; plugin?: string }
    }
    if (type === 'user/message' && data.source?.kind === 'plugin') return ''
    const blocks = type === 'assistant/message' ? data.message?.content : data.content
    return (blocks ?? [])
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text ?? '')
      .join('\n')
      .trim()
  } catch {
    return ''
  }
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function canUseLlm(ctx: Context): boolean {
  try {
    return Boolean(ctx.llm)
  } catch {
    return false
  }
}
