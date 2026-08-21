import type { Hint } from './types.ts'

export type CapabilityAction = 'panel' | 'prompt' | 'open-planner' | 'open-memory' | 'invoke-skill'
export type CapabilityKind = 'builtin' | 'skill'

export interface CapabilityPlugin {
  id: string
  title: string
  short: string
  blurb: string
  accent: string
  action: CapabilityAction
  /** Sent to the assistant when action is prompt or invoke-skill */
  prompt?: string
  /** Placeholder shown when filling the composer */
  placeholder?: string
  /** Shown in the rail as vertical label */
  railLabel: string
  /** Whether to show as a primary rail shortcut */
  rail: boolean
  /** Order in composer dock / capability panel */
  order: number
  kind?: CapabilityKind
  skillName?: string
  installed?: boolean
}

/** Built-in personal-assistant capability plugins (beyond schedule/memory shells). */
export const CAPABILITY_PLUGINS: CapabilityPlugin[] = [
  {
    id: 'schedule',
    title: '日程提醒',
    short: '日程',
    blurb: '待办、日历与订阅提醒，到点自动推送。',
    accent: '#12b7f5',
    action: 'open-planner',
    railLabel: '日程提醒',
    rail: true,
    order: 10,
    kind: 'builtin',
    installed: true,
  },
  {
    id: 'memory',
    title: '个人记忆',
    short: '记忆',
    blurb: '偏好、习惯与重要事实，后续对话会主动调用。',
    accent: '#7c5cfc',
    action: 'open-memory',
    railLabel: '个人记忆',
    rail: true,
    order: 20,
    kind: 'builtin',
    installed: true,
  },
  {
    id: 'search',
    title: '信息检索',
    short: '检索',
    blurb: '在记忆、待办、笔记与历史对话里快速找信息。',
    accent: '#0ea5a4',
    action: 'prompt',
    prompt: '请用 info_search 帮我检索：',
    placeholder: '想查什么？例如：上周关于答辩的约定…',
    railLabel: '信息检索',
    rail: true,
    order: 30,
    kind: 'builtin',
    installed: true,
  },
  {
    id: 'summary',
    title: '内容摘要',
    short: '摘要',
    blurb: '把长文、纪要或聊天整理成要点与行动项。',
    accent: '#f59e0b',
    action: 'prompt',
    prompt: '请帮我做内容摘要：先提炼要点，再列出可执行的下一步。材料如下：\n\n',
    placeholder: '粘贴要摘要的内容，或说明要总结哪段对话…',
    railLabel: '内容摘要',
    rail: true,
    order: 40,
    kind: 'builtin',
    installed: true,
  },
  {
    id: 'tasks',
    title: '任务跟踪',
    short: '任务',
    blurb: '汇总进度、风险与今日优先事项，督促推进。',
    accent: '#ef4444',
    action: 'prompt',
    prompt: '请做一次任务跟踪：结合当前待办与记忆，输出今日优先事项、阻塞点和下一步。',
    placeholder: '可补充关注点，例如：答辩准备进度…',
    railLabel: '任务跟踪',
    rail: true,
    order: 50,
    kind: 'builtin',
    installed: true,
  },
  {
    id: 'social',
    title: '社交辅助',
    short: '社交',
    blurb: '起草消息、会议跟进、致谢与礼貌回复。',
    accent: '#ec4899',
    action: 'prompt',
    prompt: '请做社交辅助：结合我的沟通偏好，帮我起草一段得体、简洁的中文消息。场景：',
    placeholder: '例如：催一下材料、约下周会议、感谢对方帮忙…',
    railLabel: '社交辅助',
    rail: true,
    order: 60,
    kind: 'builtin',
    installed: true,
  },
  {
    id: 'translate',
    title: '中英互译',
    short: '翻译',
    blurb: '中英互译并保持语气与专业术语。',
    accent: '#2563eb',
    action: 'prompt',
    prompt: '请帮我做翻译：自动判断中英方向并互译，保持原文语气与专业术语，必要时给一句备注。原文如下：\n\n',
    placeholder: '粘贴要翻译的内容…',
    railLabel: '中英互译',
    rail: true,
    order: 70,
    kind: 'builtin',
    installed: true,
  },
  {
    id: 'polish',
    title: '文字润色',
    short: '润色',
    blurb: '改写得更通顺、专业、得体。',
    accent: '#10b981',
    action: 'prompt',
    prompt: '请帮我润色下面这段文字：让它更通顺、专业、得体，保持原意，并简单说明主要改了什么。原文如下：\n\n',
    placeholder: '粘贴要润色的文字…',
    railLabel: '文字润色',
    rail: true,
    order: 80,
    kind: 'builtin',
    installed: true,
  },
  {
    id: 'brainstorm',
    title: '头脑风暴',
    short: '灵感',
    blurb: '多角度发散有新意且可落地的点子。',
    accent: '#a855f7',
    action: 'prompt',
    prompt: '请围绕下面的主题做一次头脑风暴：从不同角度给出 6-8 个有新意且可落地的点子，并标注亮点。主题：',
    placeholder: '想发散的主题…',
    railLabel: '头脑风暴',
    rail: true,
    order: 90,
    kind: 'builtin',
    installed: true,
  },
  {
    id: 'email',
    title: '邮件起草',
    short: '邮件',
    blurb: '正式中文邮件一键成稿。',
    accent: '#f97316',
    action: 'prompt',
    prompt: '请帮我起草一封中文邮件：语气专业礼貌，包含合适的称呼、正文与结尾。收件对象与目的如下：',
    placeholder: '例如：向客户说明延期…',
    railLabel: '邮件起草',
    rail: true,
    order: 100,
    kind: 'builtin',
    installed: true,
  },
  {
    id: 'meeting',
    title: '会议纪要',
    short: '纪要',
    blurb: '整理讨论要点、决议与后续待办。',
    accent: '#06b6d4',
    action: 'prompt',
    prompt: '请把下面的会议内容整理成纪要：分为讨论要点、达成的决议、后续待办（含负责人与时间，若有）。内容如下：\n\n',
    placeholder: '粘贴会议记录…',
    railLabel: '会议纪要',
    rail: true,
    order: 110,
    kind: 'builtin',
    installed: true,
  },
]

let mergedCache: CapabilityPlugin[] = CAPABILITY_PLUGINS.slice()

export function setMergedCapabilities(items: CapabilityPlugin[]): void {
  mergedCache = items.slice().sort((a, b) => a.order - b.order)
}

export function listCapabilities(): CapabilityPlugin[] {
  return mergedCache.slice()
}

export function getCapability(id: string): CapabilityPlugin | undefined {
  return mergedCache.find(item => item.id === id)
}

export function capabilityHints(): Hint[] {
  return listCapabilities()
    .filter(item => (item.action === 'prompt' || item.action === 'invoke-skill') && item.prompt)
    .map(item => ({
      id: `cap-${item.id}`,
      title: `${emojiFor(item.id, item.skillName)} ${item.title}`,
      prompt: item.prompt!,
      reason: item.short,
    }))
}

function emojiFor(id: string, skillName?: string): string {
  return {
    schedule: '📅',
    memory: '🧠',
    search: '🔍',
    summary: '📝',
    tasks: '🎯',
    social: '💬',
    translate: '🌐',
    polish: '✨',
    brainstorm: '💡',
    email: '✉️',
    meeting: '🗒️',
  }[id] ?? (skillName ? '🧩' : '✨')
}
