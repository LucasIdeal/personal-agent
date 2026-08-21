import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CapabilityAction, CapabilityPlugin } from './capabilities.ts'
import { CAPABILITY_PLUGINS } from './capabilities.ts'
import { parseFrontmatter } from './frontmatter.ts'

export interface SkillEntry {
  name: string
  description: string
  path: string
  metadata?: Record<string, unknown>
}

export interface SkillCapabilityMeta {
  title?: string
  short?: string
  blurb?: string
  accent?: string
  prompt?: string
  placeholder?: string
  railLabel?: string
  rail?: boolean
  order?: number
  hidden?: boolean
}

const BUILTIN_IDS = new Set(CAPABILITY_PLUGINS.map(item => item.id))
const ACCENTS = ['#0ea5a4', '#6366f1', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316']

export function resolveSkillRoots(notesDir: string): string[] {
  const chatDir = join(notesDir, '..')
  const dshHome = join(chatDir, '..')
  return [
    join(dshHome, 'skills'),
    join(chatDir, '.agents', 'skills'),
  ]
}

export async function scanSkillRoots(roots: string[]): Promise<SkillEntry[]> {
  const seen = new Map<string, SkillEntry>()
  for (const root of roots) {
    try {
      await access(root)
    } catch {
      continue
    }
    for (const skillPath of await findSkillFiles(root)) {
      const parsed = await parseSkillFile(skillPath)
      if (!parsed || seen.has(parsed.name)) continue
      seen.set(parsed.name, { ...parsed, path: skillPath })
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Find SKILL.md files up to 2 levels deep (flat and @scope/name layouts). */
async function findSkillFiles(root: string, depth = 0): Promise<string[]> {
  if (depth > 2) return []
  let names: string[]
  try {
    names = await readdir(root)
  } catch {
    return []
  }
  const found: string[] = []
  for (const name of names) {
    if (name.startsWith('.')) continue
    const abs = join(root, name)
    const skillPath = join(abs, 'SKILL.md')
    try {
      await access(skillPath)
      found.push(skillPath)
      continue
    } catch {
      // not a skill dir itself; descend for scoped layouts
    }
    found.push(...await findSkillFiles(abs, depth + 1))
  }
  return found
}

export function skillToCapability(skill: SkillEntry, index: number): CapabilityPlugin | undefined {
  if (BUILTIN_IDS.has(skill.name)) return undefined
  const meta = readCapabilityMeta(skill.metadata)
  if (meta.hidden) return undefined
  const accent = meta.accent ?? accentFor(skill.name)
  const title = meta.title ?? humanizeSkillName(skill.name)
  const short = meta.short ?? title.slice(0, 4)
  return {
    id: `skill:${skill.name}`,
    title,
    short,
    blurb: meta.blurb ?? skill.description,
    accent,
    action: 'invoke-skill' as CapabilityAction,
    prompt: meta.prompt ?? `请按 ${skill.name} 技能处理：`,
    placeholder: meta.placeholder ?? '描述你的需求…',
    railLabel: meta.railLabel ?? short,
    rail: meta.rail ?? false,
    order: meta.order ?? 100 + index,
    kind: 'skill',
    skillName: skill.name,
    installed: true,
  }
}

export function mergeCapabilities(skills: SkillEntry[]): CapabilityPlugin[] {
  const merged = [...CAPABILITY_PLUGINS.map(item => ({ ...item, kind: 'builtin' as const, installed: true }))]
  let index = 0
  for (const skill of skills) {
    const cap = skillToCapability(skill, index++)
    if (cap) merged.push(cap)
  }
  return merged.sort((a, b) => a.order - b.order)
}

async function parseSkillFile(path: string): Promise<Omit<SkillEntry, 'path'> | undefined> {
  const raw = await readFile(path, 'utf8')
  const parsed = parseFrontmatter(raw)
  if (!parsed) return undefined
  const data = parsed.data
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  if (!name || !description) return undefined
  const metadata = data.metadata && typeof data.metadata === 'object'
    ? data.metadata as Record<string, unknown>
    : undefined
  return { name, description, metadata }
}

function readCapabilityMeta(metadata?: Record<string, unknown>): SkillCapabilityMeta {
  if (!metadata) return {}
  const cap = metadata.capability
  if (!cap || typeof cap !== 'object') return {}
  const value = cap as Record<string, unknown>
  return {
    title: optionalString(value.title),
    short: optionalString(value.short),
    blurb: optionalString(value.blurb),
    accent: optionalString(value.accent),
    prompt: optionalString(value.prompt),
    placeholder: optionalString(value.placeholder),
    railLabel: optionalString(value.railLabel),
    rail: typeof value.rail === 'boolean' ? value.rail : undefined,
    order: typeof value.order === 'number' ? value.order : undefined,
    hidden: value.hidden === true,
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function humanizeSkillName(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function accentFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return ACCENTS[hash % ACCENTS.length]!
}
