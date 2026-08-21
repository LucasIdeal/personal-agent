import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { PlannerStore, plannerDataPath } from './store.ts'
import { MemoryStore, memoryDataPath } from './memory-store.ts'
import { registerPlannerTools } from './tools.ts'
import { registerCapabilityTools } from './capability-tools.ts'
import { registerPlannerHttp } from './http.ts'
import { startPlannerScheduler } from './scheduler.ts'
import { registerMemoryContext } from './memory-context.ts'
import { extractFromUserText } from './memory-llm.ts'
import { scanYesterday } from './memory-scan.ts'
import { refreshHints } from './hints-llm.ts'
import { CapabilityCatalog } from './capability-catalog.ts'

export const name = 'personal-assistant'
export const inject = ['tools']

export interface Config {
  notesDir: string
  dataDir: string
}

export const Config: Schema<Config> = Schema.object({
  notesDir: Schema.string().required().description('Directory for assistant notes.'),
  dataDir: Schema.string().required().description('Directory for planner JSON state.'),
})

const webDir = join(dirname(fileURLToPath(import.meta.url)), '../web')
const skillsDir = join(dirname(fileURLToPath(import.meta.url)), '../skills')

export async function apply(ctx: Context, config: Config): Promise<void> {
  console.log(`[personal-assistant] loaded, notesDir=${config.notesDir}`)

  ctx.tools.register(defineTool({
    name: 'save_note',
    description: 'Save a short note for the user under a slug. Overwrites an existing note with the same slug.',
    parameters: {
      slug: {
        type: 'string',
        required: true,
        description: 'Filename stem, letters/digits/hyphen only, e.g. weekly-review',
      },
      content: {
        type: 'string',
        required: true,
        description: 'Note body in markdown or plain text',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const slug = sanitizeSlug(args.slug)
      await mkdir(config.notesDir, { recursive: true })
      const path = join(config.notesDir, `${slug}.md`)
      await writeFile(path, args.content, 'utf8')
      return `Saved note ${slug} at ${path}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'list_notes',
    description: 'List saved personal-assistant notes.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      await mkdir(config.notesDir, { recursive: true })
      const names = (await readdir(config.notesDir))
        .filter(name => name.endsWith('.md'))
        .map(name => name.slice(0, -3))
        .sort()
      return names.length === 0 ? 'No notes yet.' : names.join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'read_note',
    description: 'Read a previously saved personal-assistant note by slug.',
    parameters: {
      slug: {
        type: 'string',
        required: true,
        description: 'Filename stem of the note to read',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const slug = sanitizeSlug(args.slug)
      const path = join(config.notesDir, `${slug}.md`)
      return readFile(path, 'utf8')
    },
  }))

  const store = new PlannerStore(plannerDataPath(config.dataDir))
  await store.load()
  const memory = new MemoryStore(memoryDataPath(config.dataDir))
  await memory.load()
  await syncAssistantSkills(config.notesDir)
  const capabilityCatalog = new CapabilityCatalog()
  await capabilityCatalog.refresh(config.notesDir)
  registerPlannerTools(ctx, store, memory)
  registerCapabilityTools(ctx, store, memory, config.notesDir)
  registerMemoryContext(ctx, memory)

  const sessionsPath = join(dirname(config.dataDir), 'sessions.sqlite')
  let runtimeCtx: Context = ctx
  ctx.effect(() => startPlannerScheduler(store, memory, sessionsPath, () => runtimeCtx))

  ctx.inject(['llm'], (llmCtx) => {
    runtimeCtx = llmCtx
    console.log('[personal-assistant] llm ready, generating hints')
    setTimeout(() => {
      void refreshHints(memory, store, () => runtimeCtx, true).catch((error: unknown) => {
        console.warn('[personal-assistant] hints', error)
      })
    }, 800)
  })

  ctx.inject(['webServer'], (webCtx) => {
    registerPlannerHttp(webCtx.webServer, store, memory, webDir, config.notesDir, capabilityCatalog, {
      extract: text => extractFromUserText(runtimeCtx, text),
      scan: () => scanYesterday(memory, { sessionsPath, getContext: () => runtimeCtx }, new Date(), true),
      refreshHints: (force = false) => refreshHints(memory, store, () => runtimeCtx, force),
    })
    console.log('[personal-assistant] planner column mounted')
  })
  console.log(`[personal-assistant] planner ready, dataDir=${config.dataDir}`)
}

async function syncAssistantSkills(notesDir: string): Promise<void> {
  const chatDir = dirname(notesDir)
  const dshHome = dirname(chatDir)
  let names: string[]
  try {
    names = (await readdir(skillsDir)).filter(name => !name.startsWith('.'))
  } catch {
    names = ['memory', 'planner', 'capabilities', 'skillhub']
  }
  for (const name of names) {
    try {
      const src = join(skillsDir, name, 'SKILL.md')
      const body = await readFile(src, 'utf8')
      for (const target of [
        join(chatDir, '.agents', 'skills', name, 'SKILL.md'),
        join(dshHome, 'skills', name, 'SKILL.md'),
      ]) {
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, body, 'utf8')
      }
    } catch (error) {
      console.warn(`[personal-assistant] sync skill ${name}`, error)
    }
  }
}

function sanitizeSlug(slug: string): string {
  const cleaned = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  if (!cleaned) throw new Error('slug must contain letters, digits, or hyphens')
  return cleaned
}
