import type { PlannerStore } from './store.ts'
import type { MemoryStore } from './memory-store.ts'
import { formatDate } from './store.ts'
import { scanYesterday } from './memory-scan.ts'
import { refreshHints } from './hints-llm.ts'

const TICK_MS = 20_000

export function startPlannerScheduler(
  store: PlannerStore,
  memory: MemoryStore,
  sessionsPath: string,
  getContext: () => import('@deepseek-ai/cordis').Context | undefined,
): () => void {
  let scanning = false
  let hinting = false
  const tick = (): void => {
    void store.dispatchDue().catch((error: unknown) => {
      console.warn('[personal-assistant] scheduler', error)
    })
    if (!hinting && canUseLlm(getContext)) {
      hinting = true
      void refreshHints(memory, store, getContext)
        .catch((error: unknown) => {
          console.warn('[personal-assistant] hints', error)
        })
        .finally(() => { hinting = false })
    }
    if (!shouldScan(memory) || scanning || !canUseLlm(getContext)) return
    scanning = true
    void scanYesterday(memory, { sessionsPath, getContext })
      .catch((error: unknown) => {
        console.warn('[personal-assistant] memory scan', error)
      })
      .finally(() => { scanning = false })
  }
  tick()
  const timer = setInterval(tick, TICK_MS)
  return () => clearInterval(timer)
}

function canUseLlm(getContext: () => import('@deepseek-ai/cordis').Context | undefined): boolean {
  try {
    return Boolean(getContext()?.llm)
  } catch {
    return false
  }
}

function shouldScan(memory: MemoryStore, now = new Date()): boolean {
  const yesterday = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  if (memory.lastScanDay() === yesterday) return false
  // Catch up on startup, and run in the local midnight hour.
  return now.getHours() === 0 || memory.lastScanDay() === null || memory.lastScanDay()! < yesterday
}
