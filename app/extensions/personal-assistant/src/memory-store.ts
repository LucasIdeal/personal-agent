import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { rankMemories, SEARCH_LIMIT } from './memory-search.ts'
import type { HintSet, Memory, MemoryKind, MemorySource, MemoryStatus } from './types.ts'

export interface MemoryPatch {
  kind?: MemoryKind
  content?: string
  category?: string
  status?: MemoryStatus
}

interface MemoryRow {
  id: string
  kind: string
  content: string
  category: string
  source: string
  status: string
  created_at: string
  updated_at: string
}

export class MemoryStore {
  private db!: DatabaseSync

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    this.db = new DatabaseSync(this.filePath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS memories_status_updated ON memories(status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS memory_scans (
        day TEXT PRIMARY KEY,
        scanned_at TEXT NOT NULL,
        proposed INTEGER NOT NULL,
        written INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hint_sets (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        payload TEXT NOT NULL,
        generated_at TEXT NOT NULL
      ) STRICT;
    `)
  }

  list(filter: { status?: MemoryStatus; kind?: MemoryKind; q?: string } = {}): Memory[] {
    if (filter.q?.trim()) {
      return this.search(filter.q, { status: filter.status, kind: filter.kind })
    }
    return this.loadFiltered({ status: filter.status, kind: filter.kind })
  }

  /**
   * Hybrid retrieval: keyword tokens and the local n-gram embedding run
   * together; a hit from either channel is returned, fused by rank.
   * @param query - raw search text from the tool or UI
   * @param filter - optional status/kind restriction and hit cap
   */
  search(query: string, filter: { status?: MemoryStatus; kind?: MemoryKind; limit?: number } = {}): Memory[] {
    const pool = this.loadFiltered({ status: filter.status, kind: filter.kind })
    return rankMemories(pool, query, filter.limit ?? SEARCH_LIMIT)
  }

  private loadFiltered(filter: { status?: MemoryStatus; kind?: MemoryKind }): Memory[] {
    const clauses: string[] = []
    const params: string[] = []
    if (filter.status) {
      clauses.push('status = ?')
      params.push(filter.status)
    }
    if (filter.kind) {
      clauses.push('kind = ?')
      params.push(filter.kind)
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.db.prepare(
      `SELECT * FROM memories ${where} ORDER BY updated_at DESC LIMIT 400`,
    ).all(...params) as MemoryRow[]
    return rows.map(rowToMemory)
  }

  get(id: string): Memory | undefined {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined
    return row ? rowToMemory(row) : undefined
  }

  findByContent(content: string): Memory | undefined {
    const key = fingerprint(content)
    if (!key) return undefined
    const rows = this.db.prepare(
      "SELECT * FROM memories WHERE status = 'active'",
    ).all() as MemoryRow[]
    return rows.map(rowToMemory).find(item => fingerprint(item.content) === key)
  }

  async create(input: {
    kind: MemoryKind
    content: string
    category?: string
    source?: MemorySource
  }): Promise<Memory> {
    const content = input.content.trim()
    if (!content) throw new Error('记忆内容不能为空')
    const existing = this.findByContent(content)
    if (existing) {
      const next = await this.update(existing.id, {
        kind: input.kind,
        category: input.category,
      })
      return next
    }
    const now = nowIso()
    const memory: Memory = {
      id: `mem_${randomUUID().slice(0, 8)}`,
      kind: input.kind,
      content,
      category: (input.category ?? '').trim(),
      source: input.source ?? 'manual',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    this.db.prepare(`
      INSERT INTO memories (id, kind, content, category, source, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memory.id, memory.kind, memory.content, memory.category,
      memory.source, memory.status, memory.createdAt, memory.updatedAt,
    )
    return memory
  }

  async update(idOrContent: string, patch: MemoryPatch): Promise<Memory> {
    const memory = this.get(idOrContent) ?? this.findByContent(idOrContent)
    if (memory === undefined) throw new Error(`未找到记忆：${idOrContent}`)
    if (patch.content !== undefined) {
      const content = patch.content.trim()
      if (!content) throw new Error('记忆内容不能为空')
      memory.content = content
    }
    if (patch.kind !== undefined) memory.kind = patch.kind
    if (patch.category !== undefined) memory.category = patch.category.trim()
    if (patch.status !== undefined) memory.status = patch.status
    memory.updatedAt = nowIso()
    this.db.prepare(`
      UPDATE memories SET kind = ?, content = ?, category = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(memory.kind, memory.content, memory.category, memory.status, memory.updatedAt, memory.id)
    return memory
  }

  async delete(idOrContent: string): Promise<Memory> {
    const memory = this.get(idOrContent) ?? this.findByContent(idOrContent)
    if (memory === undefined) throw new Error(`未找到记忆：${idOrContent}`)
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(memory.id)
    return memory
  }

  formatBrief(limit = 40): string {
    const items = this.list({ status: 'active' }).slice(0, limit)
    if (items.length === 0) return '当前没有已保存的个人偏好/记忆。'
    const lines = [`用户画像（${items.length} 条，请在建议与回复中遵守）：`]
    for (const item of items) {
      const kind = { preference: '偏好', fact: '事实', note: '备注' }[item.kind] ?? item.kind
      const cat = item.category ? `/${item.category}` : ''
      lines.push(`- ${kind}${cat}：${item.content}`)
    }
    return lines.join('\n')
  }

  lastScanDay(): string | null {
    const row = this.db.prepare(
      'SELECT day FROM memory_scans ORDER BY day DESC LIMIT 1',
    ).get() as { day: string } | undefined
    return row?.day ?? null
  }

  recordScan(day: string, proposed: number, written: number): void {
    this.db.prepare(`
      INSERT INTO memory_scans (day, scanned_at, proposed, written)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET scanned_at = excluded.scanned_at, proposed = excluded.proposed, written = excluded.written
    `).run(day, nowIso(), proposed, written)
  }

  getHintSet(): HintSet | null {
    const row = this.db.prepare(
      "SELECT fingerprint, payload, generated_at FROM hint_sets WHERE id = 'current'",
    ).get() as { fingerprint: string; payload: string; generated_at: string } | undefined
    if (!row) return null
    try {
      const items = JSON.parse(row.payload) as HintSet['items']
      if (!Array.isArray(items) || items.length === 0) return null
      return { fingerprint: row.fingerprint, generatedAt: row.generated_at, items }
    } catch {
      return null
    }
  }

  saveHintSet(set: HintSet): void {
    this.db.prepare(`
      INSERT INTO hint_sets (id, fingerprint, payload, generated_at)
      VALUES ('current', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        payload = excluded.payload,
        generated_at = excluded.generated_at
    `).run(set.fingerprint, JSON.stringify(set.items), set.generatedAt)
  }
}

export function memoryDataPath(dir: string): string {
  return join(dir, 'memory.sqlite')
}

export function fingerprint(content: string): string {
  return content
    .toLowerCase()
    .replace(/[\s，。！？、,.!?;；：:""''“”‘’（）()【】\[\]…—\-]+/g, '')
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    kind: row.kind as MemoryKind,
    content: row.content,
    category: row.category,
    source: row.source as MemorySource,
    status: row.status as MemoryStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function nowIso(): string {
  return new Date().toISOString()
}
