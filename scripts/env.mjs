import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WIN = process.platform === 'win32'
const here = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(here, '..')
export const APP = join(ROOT, 'app')
export const DSH_HOME = process.env.DSH_HOME || join(ROOT, '.dsh')
export const PNPM_SPEC = 'pnpm@11.7.0'

export function nodeMeetsEngines() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  return major > 22 || (major === 22 && minor >= 19) || major >= 24
}

export function assertNode() {
  preferLocalNode()
  const [major] = process.versions.node.split('.').map(Number)
  if (major < 22) {
    console.error(`需要 Node.js 22.19+ 或 24+，当前是 ${process.version}。`)
    console.error('请安装：https://nodejs.org/')
    process.exit(1)
  }
  if (!nodeMeetsEngines()) {
    console.warn(`当前是 ${process.version}。完整功能建议 Node.js 22.19+ 或 24+，将继续尝试启动。`)
  }
}

export function localNodeBins() {
  const root = join(ROOT, '.node')
  if (!existsSync(root)) return []
  const bins = []
  for (const name of readdirSync(root)) {
    const unix = join(root, name, 'bin', 'node')
    const win = join(root, name, 'node.exe')
    if (existsSync(unix)) bins.push(unix)
    if (existsSync(win)) bins.push(win)
  }
  return bins
}

export function nodeHasFts5() {
  try {
    const sqlite = process.getBuiltinModule?.('node:sqlite')
    if (!sqlite?.DatabaseSync) return false
    const db = new sqlite.DatabaseSync(':memory:')
    try {
      db.exec('CREATE VIRTUAL TABLE t USING fts5(x)')
      return true
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}

/** If this Node is too old, re-run the same script with a bundled copy under `.node/`. */
export function preferLocalNode() {
  if (process.env.PERSONAL_AGENT_NODE_LOCKED) return
  if (nodeMeetsEngines() && nodeHasFts5()) return
  const current = process.execPath
  const next = localNodeBins().find(bin => bin !== current)
  if (!next) return
  const binDir = dirname(next)
  console.log(`改用本地 Node：${next}`)
  const result = spawnSync(next, process.argv.slice(1), {
    stdio: 'inherit',
    env: {
      ...process.env,
      PERSONAL_AGENT_NODE_LOCKED: '1',
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
    },
  })
  process.exit(result.status ?? 1)
}

function npxCommand() {
  const dir = dirname(process.execPath)
  if (WIN) {
    const cmd = join(dir, 'npx.cmd')
    if (existsSync(cmd)) return cmd
  }
  const unix = join(dir, 'npx')
  if (existsSync(unix)) return unix
  return 'npx'
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: WIN,
    cwd: options.cwd ?? APP,
    env: {
      ...process.env,
      DSH_HOME,
      ...options.env,
    },
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

export function pnpm(args, options = {}) {
  run(npxCommand(), ['--yes', PNPM_SPEC, ...args], options)
}

export function ensureHome() {
  mkdirSync(DSH_HOME, { recursive: true })
}

export function webDistReady() {
  return existsSync(join(APP, 'apps', 'web', 'dist', 'index.html'))
}
