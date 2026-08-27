// Hero chrome for the blank-draft phase of ConversationRoot: fish headline,
// glow backdrop, and the workspace row. Pure presentation — the resident
// composer is NOT rendered here (it keeps its own stable tree position in
// ConversationRoot so the textarea survives the hero → composer flip); CSS
// positions it over this shell's glow area during the hero phase.

import { useEffect, useId, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import {
  FishLogo, IconChevronDownOutline14, IconFolderClose16, IconFolderOpen16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceTitleOf } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationSlotProps } from '../contract/slots.ts'
import css from './HeroShell.module.css'

/** The owner's locale seat type, passed to hero chrome as a plain prop. */
type HeroTranslate = ConversationSlotProps['t']

/**
 * Basename label for the workspace chip (the shared derivation);
 * separator-only paths echo the raw cwd.
 * @param cwd - workspace directory path (non-empty).
 * @returns chip label.
 */
export function workspaceLabel(cwd: string): string {
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

/**
 * Homepage entry cards: workspace-backed coding vs cwd-less (chat-home) chat.
 */
export function HomeModePicker({ onWorkspace, onChat, t }: {
  onWorkspace: () => void
  onChat: () => void
  t: HeroTranslate
}) {
  return (
    <div className={css.modes}>
      <button type="button" className={css.mode} onClick={onWorkspace}>
        <span className={css.modeTitle}>
          <IconFolderClose16 size={16} className={css.modeMark} />
          {t('home.workspace.title')}
        </span>
        <span className={css.modeBody}>{t('home.workspace.body')}</span>
      </button>
      <button type="button" className={css.mode} onClick={onChat}>
        <span className={css.modeTitle}>
          <FishLogo size={16} className={css.modeMark} />
          {t('home.chat.title')}
        </span>
        <span className={css.modeBody}>{t('home.chat.body')}</span>
      </button>
    </div>
  )
}

type HeroHintItem = {
  id?: string
  title?: string
  prompt?: string
  reason?: string
}

const FALLBACK_HINTS: HeroHintItem[] = [
  {
    id: 'fb-today',
    title: '📅 今天该做什么？',
    prompt: '帮我看看今天有哪些待办和订阅，按紧急程度排一下，并给一句建议。',
    reason: '日程',
  },
  {
    id: 'fb-memory',
    title: '🧠 你还记得我什么？',
    prompt: '用几句话说说你目前记住的我的偏好和事实，漏了什么我再补。',
    reason: '画像',
  },
  {
    id: 'fb-defense',
    title: '🎤 帮我准备部门答辩',
    prompt: '我在准备部门答辩，请根据你记得的信息，先列一个简洁提纲和下一步。',
    reason: '答辩',
  },
  {
    id: 'fb-remind',
    title: '🔔 本周安排一个提醒',
    prompt: '帮我看看本周有没有适合设提醒的事项，给出订阅或待办建议。',
    reason: '订阅',
  },
]

/**
 * Suggestion chips under the home mode cards. Host plugin fills
 * `/planner-api/hints`; a local fallback keeps the row visible if that is down.
 */
export function HeroHints({ t }: { t: HeroTranslate }) {
  const [items, setItems] = useState<HeroHintItem[]>(FALLBACK_HINTS)
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const next = await fetchHints(false)
      if (!cancelled && next.length > 0) setItems(next)
    }
    void load()
    const id = window.setInterval(() => { void load() }, 20000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])
  const shown = items.length > 0 ? items : FALLBACK_HINTS
  return (
    <div className={css.hints} data-hero-hints="" data-refreshing={refreshing ? '' : undefined}>
      <div className={css.hintsHead}>
        <span className={css.hintsTitle}>{t('home.hints.title')}</span>
        <button
          type="button"
          className={css.hintsRefresh}
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true)
            void fetchHints(true).then((next) => {
              if (next.length > 0) setItems(next)
            }).finally(() => { setRefreshing(false) })
          }}
        >
          {refreshing ? t('home.hints.refreshing') : t('home.hints.refresh')}
        </button>
      </div>
      <div className={css.hintsGrid}>
        {shown.map((item, index) => (
          <button
            key={item.id ?? String(index)}
            type="button"
            className={css.hint}
            title={item.prompt}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('qq-use-hint', { detail: item }))
            }}
          >
            <span className={css.hintTitle}>{item.title}</span>
            {item.reason ? <span className={css.hintReason}>{item.reason}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

async function fetchHints(force: boolean): Promise<HeroHintItem[]> {
  try {
    const res = await fetch(
      force ? '/planner-api/hints/refresh' : '/planner-api/hints',
      force
        ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
        : { method: 'GET' },
    )
    if (!res.ok) return []
    const data = await res.json() as { items?: HeroHintItem[] }
    return Array.isArray(data.items) ? data.items.filter(item => item.title && item.prompt).slice(0, 4) : []
  } catch {
    return []
  }
}

/** Selectable badge for a chat-home session; opens the same workspace picker. */
export function ChatBadge({ buttonRef, menuOpen = false, onClick, t }: {
  buttonRef?: RefObject<HTMLButtonElement>
  menuOpen?: boolean
  onClick?: () => void
  t: HeroTranslate
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={css.workspace}
      aria-label={t('home.chatBadge')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={onClick}
    >
      <FishLogo size={16} className={css.folder} />
      <span className={css.workspaceLabel}>{t('home.chatBadge')}</span>
      <IconChevronDownOutline14 className={css.chevron} size={12} />
    </button>
  )
}

/**
 * The workspace chip (folder + label + chevron), always interactive: before
 * the first message the workspace stays switchable — picking another one
 * moves the New Session flow to that workspace's blank session. Without a
 * label the chip renders its placeholder state: closed folder + the
 * "Choose workspace" call to action.
 * @param props.label - chip label (see {@link workspaceLabel}); omitted → placeholder.
 * @param props.menuOpen - menu expansion echo.
 * @param props.onClick - menu toggle.
 * @returns the chip button element.
 */
export function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }: {
  buttonRef?: RefObject<HTMLButtonElement>
  label?: string | undefined
  menuOpen?: boolean
  onClick?: () => void
  t: HeroTranslate
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={css.workspace}
      aria-label={t('hero.chooseWorkspace')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={onClick}
    >
      {label === undefined
        ? <IconFolderClose16 className={css.folder} size={16} />
        : <IconFolderOpen16 className={css.folder} size={16} />}
      <span className={css.workspaceLabel}>{label ?? t('hero.chooseWorkspace')}</span>
      <IconChevronDownOutline14 className={css.chevron} size={12} />
    </button>
  )
}

/**
 * The soft blue backdrop ellipse (figma 313:14109). Rendered by the hero
 * owner (ConversationRoot), not HeroShell, so it can center on the input
 * card; the owner's className supplies all positioning.
 * @param props.className - positioning class from the owner.
 * @returns the blurred-ellipse svg element.
 */
export function HeroGlow({ className }: { className?: string | undefined }) {
  // Stable filter id so multiple hero mounts do not collide in the DOM.
  const glowFilterId = `empty-glow-${useId().replace(/:/g, '')}`
  return (
    <svg className={className} viewBox="0 0 1051 468" fill="none" aria-hidden="true">
      <defs>
        <filter
          id={glowFilterId}
          x="0"
          y="0"
          width="1051"
          height="468"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="50" result="effect1_foregroundBlur" />
        </filter>
      </defs>
      <g filter={`url(#${glowFilterId})`}>
        <ellipse cx="525.5" cy="234" rx="425.5" ry="134" fill="#12B7F5" fillOpacity="0.14" />
      </g>
    </svg>
  )
}

/** Hero chrome props. The workspace row rides the InputBar accessory hole, not here. */
export interface HeroShellProps {
  /** The owner's locale seat, passed down as a plain prop. */
  t: HeroTranslate
  /** Overlay content after the stack (modals). */
  children?: ReactNode
}

/**
 * Render the hero chrome (headline only; no glow, no composer, no workspace
 * row — the glow is the owner's {@link HeroGlow}).
 * @param props - see {@link HeroShellProps}.
 * @returns the centered hero element tree.
 */
export function HeroShell({ t, children }: HeroShellProps) {
  return (
    <div className={css.root}>
      <div className={css.stack}>
        <div className={css.headline}>
          {/* figma 34:10412: fish 34×25 leading the headline, gap 10. */}
          <span className={css.fishHitbox}>
            <FishLogo size={34} className={css.fish} />
          </span>
          <span className={css.headlineText}>{t('hero.headline')}</span>
          <span className={css.previewBadge}>{t('hero.preview')}</span>
        </div>
        <div className={css.body}>
          {children}
        </div>
      </div>
    </div>
  )
}
