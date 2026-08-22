import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'

const DEEPSEEK_NS = settingsNamespace('llm-deepseek')
const PI_AI_NS = settingsNamespace('llm-pi-ai')
const CUSTOM_ROUTE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export interface LlmPreset {
  id: 'deepseek' | 'openai' | 'anthropic' | 'custom'
  label: string
  hint: string
  provider: string
  defaultModel: string
  models: string[]
  keyRef: string
  baseUrlPlaceholder: string
  requireBaseUrl: boolean
}

export const LLM_PRESETS: readonly LlmPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    hint: '官方 API，也可填兼容网关地址。',
    provider: 'deepseek-official',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
    keyRef: 'DEEPSEEK_API_KEY',
    baseUrlPlaceholder: 'https://api.deepseek.com',
    requireBaseUrl: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: '官方接口，或任何 OpenAI 格式的中转。',
    provider: 'openai',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini', 'o4-mini'],
    keyRef: 'OPENAI_API_KEY',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    requireBaseUrl: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic / Claude',
    hint: 'Claude 官方或兼容网关。',
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'],
    keyRef: 'ANTHROPIC_API_KEY',
    baseUrlPlaceholder: 'https://api.anthropic.com',
    requireBaseUrl: false,
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    hint: '通义、智谱、Moonshot、SiliconFlow、Ollama 等，填 Base URL + 模型 ID。',
    provider: 'openai-compat',
    defaultModel: '',
    models: [],
    keyRef: 'OPENAI_COMPAT_API_KEY',
    baseUrlPlaceholder: 'https://api.example.com/v1',
    requireBaseUrl: true,
  },
]

export interface LlmSetupState {
  presets: readonly LlmPreset[]
  current: {
    preset: LlmPreset['id']
    provider: string
    model: string
    baseURL: string
    configured: boolean
  }
  keys: Record<string, boolean>
}

export interface LlmSetupInput {
  preset?: string
  provider?: string
  model?: string
  apiKey?: string
  baseURL?: string
}

function sectionValue(ctx: Context, ns: string): Record<string, unknown> {
  const hit = ctx.settings?.describe().find(item => String(item.ns) === ns)
  const value = hit?.value
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

function presetOf(provider: string): LlmPreset['id'] {
  if (provider === 'deepseek-official') return 'deepseek'
  if (provider === 'openai') return 'openai'
  if (provider === 'anthropic') return 'anthropic'
  return 'custom'
}

async function keyConfigured(ctx: Context, ref: string): Promise<boolean> {
  if (!ctx.credentials || !ref) return false
  try {
    return (await ctx.credentials.describe(credentialRef(ref))).configured
  } catch {
    return false
  }
}

export async function readLlmSetup(ctx: Context): Promise<LlmSetupState> {
  const selection = ctx.agentDefaultModel?.currentSelection()
  const provider = selection?.provider || 'deepseek-official'
  const model = selection?.model || 'deepseek-v4-flash'
  const preset = presetOf(provider)
  const deepseek = sectionValue(ctx, 'llm-deepseek')
  const piAi = sectionValue(ctx, 'llm-pi-ai')
  const providers = (piAi.providers && typeof piAi.providers === 'object')
    ? piAi.providers as Record<string, Record<string, unknown>>
    : {}
  let baseURL = ''
  if (preset === 'deepseek' && typeof deepseek.baseURL === 'string') baseURL = deepseek.baseURL
  else if (providers[provider] && typeof providers[provider].baseURL === 'string') {
    baseURL = String(providers[provider].baseURL)
  }
  const keyRef = preset === 'custom' ? deriveKeyRef(provider) : (LLM_PRESETS.find(item => item.id === preset)?.keyRef ?? '')
  const keys: Record<string, boolean> = {}
  for (const item of LLM_PRESETS) {
    keys[item.id] = await keyConfigured(ctx, item.id === 'custom' && provider !== 'openai-compat'
      ? deriveKeyRef(provider)
      : item.keyRef)
  }
  const configured = await keyConfigured(ctx, keyRef) || Object.values(keys).some(Boolean)
  return {
    presets: LLM_PRESETS,
    current: { preset, provider, model, baseURL, configured },
    keys,
  }
}

export async function applyLlmSetup(ctx: Context, input: LlmSetupInput): Promise<LlmSetupState> {
  if (!ctx.settings || !ctx.credentials) {
    throw new Error('配置服务尚未就绪，请稍后重试')
  }
  const presetId = (input.preset || 'deepseek') as LlmPreset['id']
  const preset = LLM_PRESETS.find(item => item.id === presetId)
  if (!preset) throw new Error('未知的提供方')
  const apiKey = String(input.apiKey ?? '').trim()
  const baseURL = String(input.baseURL ?? '').trim().replace(/\/+$/, '')
  const model = String(input.model ?? '').trim() || preset.defaultModel
  if (preset.requireBaseUrl && !baseURL) throw new Error('请填写 API 地址')
  if (preset.id === 'custom' && !model) throw new Error('请填写模型 ID')

  let provider = preset.provider
  let keyRef = preset.keyRef
  if (preset.id === 'custom') {
    const requested = String(input.provider ?? '').trim().toLowerCase() || 'openai-compat'
    if (!CUSTOM_ROUTE.test(requested)) {
      throw new Error('提供方 ID 需以小写字母开头，只能包含小写字母、数字和短横线')
    }
    provider = requested
    keyRef = deriveKeyRef(provider)
  }

  if (apiKey) await ctx.credentials.set(credentialRef(keyRef), apiKey)
  else if (!(await keyConfigured(ctx, keyRef))) throw new Error('请填写 API 密钥')

  if (preset.id === 'deepseek') {
    const ops = [
      { op: 'set' as const, path: ['apiKeyEnv'], value: keyRef },
      baseURL
        ? { op: 'set' as const, path: ['baseURL'], value: baseURL }
        : { op: 'unset' as const, path: ['baseURL'] },
    ]
    await ctx.settings.mutate(DEEPSEEK_NS, ops)
  } else {
    const profile: Record<string, unknown> = { apiKeyEnv: keyRef }
    if (baseURL) profile.baseURL = baseURL
    if (preset.id === 'custom') {
      profile.displayName = 'OpenAI 兼容'
      profile.api = 'openai-completions'
      profile.models = [{ id: model }]
    }
    await ctx.settings.mutate(PI_AI_NS, [
      { op: 'set', path: ['providers', provider], value: profile },
    ])
  }

  await ctx.agentDefaultModel?.saveSelection({
    provider,
    model,
    reasoningEffort: 'off',
  })
  return readLlmSetup(ctx)
}
