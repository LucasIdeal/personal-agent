import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
  const [major] = process.versions.node.split('.').map(Number)
  if (major < 22) {
    console.error(`需要 Node.js 22.19+ 或 24+，当前是 ${process.version}。`)
    console.error('请安装：https://nodejs.org/')
    process.exit(1)
  }
  if (!nodeMeetsEngines()) {
    console.warn(`建议 Node.js 22.19+ 或 24+（当前 ${process.version}），将继续尝试安装。`)
  }
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
