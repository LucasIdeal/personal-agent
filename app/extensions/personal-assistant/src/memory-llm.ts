import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, deepFreeze } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import {
  EXTRACT_SYSTEM, SCAN_SYSTEM, extractHeuristic, parseExtractJson, stripRememberTrigger,
} from './memory-extract.ts'
import type { MemoryExtractResult } from './types.ts'

export async function extractFromUserText(
  ctx: Context,
  text: string,
  now = new Date(),
): Promise<MemoryExtractResult> {
  const fallback = extractHeuristic(text, now)
  if (fallback.memories.length + fallback.todos.length > 0) return fallback
  const refined = await completeJson(ctx, EXTRACT_SYSTEM, userExtractPrompt(text, now))
  return refined ?? fallback
}

export async function extractFromTranscript(
  ctx: Context,
  transcript: string,
  now = new Date(),
): Promise<MemoryExtractResult> {
  const refined = await completeJson(ctx, SCAN_SYSTEM, scanPrompt(transcript, now))
  if (refined) return refined
  return extractHeuristic(transcript, now)
}

function userExtractPrompt(text: string, now: Date): string {
  return [
    `今天是 ${formatLocal(now)}。`,
    '用户原话：',
    stripRememberTrigger(text) || text,
  ].join('\n')
}

function scanPrompt(transcript: string, now: Date): string {
  return [
    `今天是 ${formatLocal(now)}。下面是昨天的对话摘录，请提取适合写入长期 profile 的条目：`,
    transcript.slice(0, 12_000),
  ].join('\n')
}

async function completeJson(ctx: Context, system: string, prompt: string): Promise<MemoryExtractResult | null> {
  const text = await completeText(ctx, system, prompt, { maxTokens: 600, timeoutMs: 12_000 })
  return text ? parseExtractJson(text) : null
}

export async function completeText(
  ctx: Context,
  system: string,
  prompt: string,
  options: { maxTokens?: number; timeoutMs?: number; temperature?: number } = {},
): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 12_000
  try {
    return await Promise.race([
      completeTextBody(ctx, system, prompt, options),
      new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error(`llm complete timeout ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } catch (error) {
    console.warn('[personal-assistant] llm complete', error)
    return null
  }
}

async function completeTextBody(
  ctx: Context,
  system: string,
  prompt: string,
  options: { maxTokens?: number; timeoutMs?: number; temperature?: number },
): Promise<string | null> {
  let llm
  try {
    llm = ctx.llm
  } catch (error) {
    console.warn('[personal-assistant] llm ctx', error)
    return null
  }
  if (!llm) {
    console.warn('[personal-assistant] llm missing')
    return null
  }
  const route = await resolveRoute(ctx)
  if (!route) {
    console.warn('[personal-assistant] llm route missing')
    return null
  }
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 12_000)
  const generate: GenerateOptions = deepFreeze({
    provider: route.provider,
    model: route.model,
    system,
    maxTokens: options.maxTokens ?? 600,
    temperature: options.temperature,
    signal: timeout,
    messages: [createUserMessage({
      content: [{ type: 'text', text: prompt }],
      source: { kind: 'plugin', plugin: 'personal-assistant' },
    })],
  })
  const assembler = new BlockAssembler()
  for await (const chunk of llm.stream(generate)) {
    assembler.push(chunk)
  }
  const blocks = assembler.blocks()
  const texts = blocks.filter((block): block is { type: 'text'; text: string } => block.type === 'text')
  const text = texts.map(block => block.text).join('')
  if (!text.trim()) {
    console.warn(
      `[personal-assistant] llm empty model=${route.model} finish=${JSON.stringify(assembler.finish)} types=${blocks.map(block => block.type).join(',') || 'none'}`,
    )
    return null
  }
  return text.trim()
}

async function resolveRoute(ctx: Context): Promise<{ provider: string; model: string } | null> {
  try {
    const providers = ctx.llm.listProviders()
    for (const provider of providers) {
      const models = await ctx.llm.listModels(provider.id)
      const preferred = models.find(model => /chat/i.test(model.id))
        ?? models.find(model => !/reasoner|r1/i.test(model.id))
        ?? models[0]
      if (preferred) return { provider: provider.id, model: preferred.id }
    }
    if (providers[0]) return { provider: providers[0].id, model: 'deepseek-chat' }
  } catch (error) {
    console.warn('[personal-assistant] memory extract route', error)
  }
  return null
}

function formatLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
