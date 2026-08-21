import { mkdir } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-workspace'

export const name = 'chat-home'
export const inject = ['workspaceRegistry']

export interface Config {
  chatDir: string
  title: string
}

export const Config: Schema<Config> = Schema.object({
  chatDir: Schema.string().required().description('Directory used as the built-in chat workspace.'),
  title: Schema.string().default('对话'),
})

/**
 * Register a built-in conversation directory so the Web composer can open
 * without the user picking a project folder. Repeat calls for the same path
 * reuse the existing workspace and keep a user-renamed title.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  await mkdir(config.chatDir, { recursive: true })
  const workspace = await ctx.workspaceRegistry.create(config.chatDir, config.title)
  console.log(`[chat-home] ready workspace=${workspace.id} dir=${config.chatDir}`)
}
