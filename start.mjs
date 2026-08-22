#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { APP, DSH_HOME, assertNode, ensureHome, pnpm, webDistReady } from './scripts/env.mjs'

assertNode()
ensureHome()

if (!existsSync(join(APP, 'node_modules'))) {
  console.error('还没有安装依赖。请先运行：')
  console.error('  node scripts/bootstrap.mjs')
  process.exit(1)
}

if (!webDistReady()) {
  console.error('还没有构建前端。请先运行：')
  console.error('  node scripts/bootstrap.mjs')
  process.exit(1)
}

console.log(`DSH_HOME=${DSH_HOME}`)
console.log('启动 Web UI → http://127.0.0.1:3080')
pnpm(['dsh', 'web', '--patch', './extensions/personal-assistant/cordis.yml', ...process.argv.slice(2)])
