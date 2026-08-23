import type { Memory } from './types.ts'

/** Local hashing embedding identifier. */
export const EMBEDDING_MODEL = 'ngram-hash-v1'
export const EMBEDDING_DIM = 384
export const EMBEDDING_MIN_SCORE = 0.16
export const SEARCH_LIMIT = 24
const RRF_K = 60

const STOP = new Set([
  '的', '了', '和', '与', '或', '在', '是', '我', '有', '也', '都', '就', '这', '那',
  '吗', '呢', '吧', '啊', '什么', '哪些', '一下', '这个', '那个', '帮我', '查一下',
  '相关', '内容', '记忆', 'a', 'an', 'the', 'to', 'of', 'and', 'or', 'in',
])

export interface RankedMemory {
  item: Memory
  score: number
  keywordScore: number
  embeddingScore: number
}

/**
 * Split a query into Latin tokens and CJK n-grams. Mixed strings such as
 * `SGOV股票` become `SGOV` plus `股票`.
 * @param query - raw search text
 * @returns unique tokens used by the keyword channel
 */
export function tokenize(query: string): string[] {
  const text = query.toLowerCase().normalize('NFKC')
  const tokens: string[] = []
  const seen = new Set<string>()
  const add = (raw: string): void => {
    const token = raw.trim()
    if (!token || STOP.has(token) || seen.has(token)) return
    seen.add(token)
    tokens.push(token)
  }
  for (const part of text.split(/[^\p{L}\p{N}._-]+/u)) {
    if (!part) continue
    for (const bit of splitScriptRuns(part)) {
      if (!bit) continue
      if (isLatinToken(bit)) {
        add(bit)
        continue
      }
      if (bit.length <= 4) add(bit)
      if (hasCjk(bit) && bit.length >= 2) {
        for (let i = 0; i < bit.length - 1; i++) add(bit.slice(i, i + 2))
        if (bit.length >= 3) {
          for (let i = 0; i < bit.length - 2; i++) add(bit.slice(i, i + 3))
        }
      } else if (bit.length >= 2) {
        add(bit)
      }
    }
  }
  return tokens
}

/**
 * True when any query token is a substring of `haystack`.
 * @param haystack - memory content, category, or other searchable text
 * @param query - raw search text
 */
export function textMatchesQuery(haystack: string, query: string): boolean {
  const tokens = tokenize(query)
  if (tokens.length === 0) return false
  const text = haystack.toLowerCase()
  return tokens.some(token => text.includes(token))
}

/**
 * Rank memories by keyword tokens and a local n-gram hashing embedding at the
 * same time, then fuse with reciprocal rank fusion. A hit from either channel
 * is enough; the two scores are not an AND filter.
 * @param items - candidate memories, typically the active pool
 * @param query - raw search text
 * @param limit - maximum hits to return
 */
export function rankMemories(items: Memory[], query: string, limit = SEARCH_LIMIT): Memory[] {
  return rankMemoriesDetailed(items, query, limit).map(row => row.item)
}

/**
 * Same ranking as {@link rankMemories} with per-channel scores for tests.
 * @param items - candidate memories
 * @param query - raw search text
 * @param limit - maximum hits to return
 */
export function rankMemoriesDetailed(items: Memory[], query: string, limit = SEARCH_LIMIT): RankedMemory[] {
  const q = query.trim()
  if (!q) return items.slice(0, limit).map(item => ({ item, score: 0, keywordScore: 0, embeddingScore: 0 }))
  const tokens = tokenize(q)
  const queryVec = embedText(q)
  const keywordRanked: Array<{ item: Memory; score: number }> = []
  const embedRanked: Array<{ item: Memory; score: number }> = []
  const keywordOf = new Map<string, number>()
  const embedOf = new Map<string, number>()
  for (const item of items) {
    const hay = memoryHaystack(item)
    const kw = keywordScore(hay, tokens)
    if (kw > 0) {
      keywordRanked.push({ item, score: kw })
      keywordOf.set(item.id, kw)
    }
    const emb = cosineSimilarity(queryVec, embedText(hay))
    if (emb >= EMBEDDING_MIN_SCORE) {
      embedRanked.push({ item, score: emb })
      embedOf.set(item.id, emb)
    }
  }
  keywordRanked.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
  embedRanked.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
  return rrfMerge(keywordRanked, embedRanked, keywordOf, embedOf, limit)
}

/**
 * Hashing-trick embedding (`ngram-hash-v1`) over Latin tokens and CJK n-grams.
 * @param text - query or memory haystack
 */
export function embedText(text: string): Float32Array {
  const vec = new Float32Array(EMBEDDING_DIM)
  for (const { feature, weight } of embeddingFeatures(text)) {
    const { index, sign } = hashFeature(`${EMBEDDING_MODEL}:${feature}`)
    vec[index] += sign * weight
  }
  l2Normalize(vec)
  return vec
}

/**
 * Cosine similarity of two L2-normalized vectors. Returns 0 when either is zero.
 * @param a - first embedding
 * @param b - second embedding
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  if (!Number.isFinite(dot)) return 0
  return Math.max(0, Math.min(1, dot))
}

export function memoryHaystack(item: Pick<Memory, 'content' | 'category'>): string {
  return `${item.category} ${item.content}`.trim()
}

function keywordScore(haystack: string, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const text = haystack.toLowerCase()
  let hits = 0
  for (const token of tokens) {
    if (text.includes(token)) hits++
  }
  return hits / tokens.length
}

function embeddingFeatures(text: string): Array<{ feature: string; weight: number }> {
  const features: Array<{ feature: string; weight: number }> = []
  for (const token of tokenize(text)) {
    features.push({ feature: `t:${token}`, weight: isLatinToken(token) ? 3 : token.length >= 3 ? 1.4 : 1 })
  }
  return features
}

function rrfMerge(
  keywordRanked: Array<{ item: Memory; score: number }>,
  embedRanked: Array<{ item: Memory; score: number }>,
  keywordOf: Map<string, number>,
  embedOf: Map<string, number>,
  limit: number,
): RankedMemory[] {
  const fused = new Map<string, RankedMemory>()
  const add = (ranked: Array<{ item: Memory; score: number }>): void => {
    ranked.forEach((row, index) => {
      const current = fused.get(row.item.id) ?? {
        item: row.item,
        score: 0,
        keywordScore: keywordOf.get(row.item.id) ?? 0,
        embeddingScore: embedOf.get(row.item.id) ?? 0,
      }
      current.score += 1 / (RRF_K + index + 1)
      fused.set(row.item.id, current)
    })
  }
  add(keywordRanked)
  add(embedRanked)
  return [...fused.values()]
    .sort((a, b) => b.score - a.score || b.keywordScore - a.keywordScore || a.item.id.localeCompare(b.item.id))
    .slice(0, limit)
}

function splitScriptRuns(part: string): string[] {
  const runs: string[] = []
  let current = ''
  let latin: boolean | null = null
  for (const char of part) {
    const nextLatin = isLatinChar(char)
    if (latin !== null && nextLatin !== latin && current) {
      runs.push(current)
      current = ''
    }
    latin = nextLatin
    current += char
  }
  if (current) runs.push(current)
  return runs
}

function hashFeature(feature: string): { index: number; sign: number } {
  let h = 2166136261
  for (let i = 0; i < feature.length; i++) {
    h ^= feature.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const index = (h >>> 0) % EMBEDDING_DIM
  const sign = (h & 0x1000000) === 0 ? 1 : -1
  return { index, sign }
}

function l2Normalize(vec: Float32Array): void {
  let sum = 0
  for (const value of vec) sum += value * value
  const norm = Math.sqrt(sum)
  if (norm === 0) return
  for (let i = 0; i < vec.length; i++) vec[i] /= norm
}

function isLatinToken(token: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(token)
}

function isLatinChar(char: string): boolean {
  return /[a-z0-9]/i.test(char)
}

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text)
}
