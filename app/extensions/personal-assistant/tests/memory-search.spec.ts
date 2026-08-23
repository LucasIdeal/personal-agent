import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '../src/memory-store.ts'
import {
  cosineSimilarity,
  embedText,
  rankMemories,
  rankMemoriesDetailed,
  tokenize,
} from '../src/memory-search.ts'
import type { Memory } from '../src/types.ts'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

function memory(partial: Partial<Memory> & Pick<Memory, 'id' | 'content'>): Memory {
  return {
    kind: 'fact',
    category: '',
    source: 'manual',
    status: 'active',
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    ...partial,
  }
}

describe('memory hybrid search', () => {
  it('tokenizes mixed ticker and CJK queries instead of keeping one phrase', () => {
    const tokens = tokenize('SGOV VOOG QQQ 股票')
    expect(tokens).toEqual(expect.arrayContaining(['sgov', 'voog', 'qqq', '股票']))
    expect(tokens).not.toContain('sgov voog qqq 股票')
  })

  it('finds a stock memory whose content is not a whole-phrase substring of the query', () => {
    const stock = memory({
      id: 'mem_stock',
      category: '股票',
      content: '我购买的股票有 SGOV VOOG QQQ',
    })
    const coffee = memory({
      id: 'mem_coffee',
      kind: 'preference',
      category: '饮食',
      content: '喜欢喝美式',
    })
    expect(stock.content.includes('SGOV VOOG QQQ 股票')).toBe(false)
    expect(stock.category.includes('SGOV VOOG QQQ 股票')).toBe(false)
    const hits = rankMemories([stock, coffee], 'SGOV VOOG QQQ 股票')
    expect(hits.map(item => item.id)).toEqual(['mem_stock'])
  })

  it('returns a hit from the embedding channel when tokens do not all match', () => {
    const stock = memory({
      id: 'mem_stock',
      category: '股票',
      content: '我购买的股票有 SGOV VOOG QQQ',
    })
    const cilantro = memory({
      id: 'mem_cilantro',
      kind: 'preference',
      category: '饮食',
      content: '不吃香菜（生的也不行）',
    })
    const detailed = rankMemoriesDetailed([stock, cilantro], '持仓股票 SGOV')
    const stockHit = detailed.find(row => row.item.id === 'mem_stock')
    expect(stockHit).toBeDefined()
    expect((stockHit?.keywordScore ?? 0) > 0 || (stockHit?.embeddingScore ?? 0) > 0).toBe(true)
    expect(detailed.some(row => row.item.id === 'mem_cilantro')).toBe(false)
  })

  it('keeps cosine high for overlapping n-grams and low for unrelated memories', () => {
    const query = embedText('SGOV VOOG QQQ 股票')
    const stock = embedText('股票 我购买的股票有 SGOV VOOG QQQ')
    const coffee = embedText('饮食 喜欢喝美式')
    expect(cosineSimilarity(query, stock)).toBeGreaterThan(cosineSimilarity(query, coffee))
    expect(cosineSimilarity(query, stock)).toBeGreaterThan(0.3)
  })
})

describe('MemoryStore.search', () => {
  it('returns the SGOV holding through list(q) and search()', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-search-'))
    dirs.push(dir)
    const store = new MemoryStore(join(dir, 'memory.sqlite'))
    await store.load()
    await store.create({
      kind: 'fact',
      content: '我购买的股票有 SGOV VOOG QQQ',
      category: '股票',
    })
    await store.create({
      kind: 'preference',
      content: '不吃香菜（生的也不行）',
      category: '饮食',
    })
    const hits = store.search('SGOV VOOG QQQ 股票', { status: 'active' })
    expect(hits).toHaveLength(1)
    expect(hits[0]?.content).toContain('SGOV')
    expect(store.list({ status: 'active', q: 'SGOV VOOG QQQ 股票' }).map(item => item.content))
      .toEqual(hits.map(item => item.content))
  })
})
