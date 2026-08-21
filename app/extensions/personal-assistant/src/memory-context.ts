import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { MemoryStore } from './memory-store.ts'

const PLUGIN = 'personal-assistant'

export function registerMemoryContext(ctx: Context, memory: MemoryStore): void {
  ctx.inject(['agents'], (agentCtx) => {
    agentCtx.on('agent/pre-step', async ({ agent, turn, step }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || step !== 1 || turn < 1) return decision
      const brief = memory.formatBrief()
      if (!brief || brief.includes('当前没有已保存')) return decision
      if (latestProfileText(agent) === brief) return decision
      return {
        kind: 'enter',
        messages: [
          ...decision.messages,
          createUserMessage({
            content: [{ type: 'text', text: brief }],
            source: {
              kind: 'plugin',
              plugin: PLUGIN,
              form: 'snapshot',
              sections: [{ name: 'user-profile', text: brief }],
            },
          }),
        ],
      }
    }, { prepend: true })
  })
}

function latestProfileText(agent: Agent): string | undefined {
  for (const event of [...agent.session.events].reverse()) {
    if (event.type !== 'user/message') continue
    const source = event.data.source
    if (source.kind !== 'plugin' || source.plugin !== PLUGIN) continue
    if (source.form !== 'snapshot') continue
    const text = event.data.content.find(block => block.type === 'text')
    return text && 'text' in text ? text.text : undefined
  }
  return undefined
}
