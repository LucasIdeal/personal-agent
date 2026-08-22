#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { APP, DSH_HOME, assertNode, ensureHome, nodeHasFts5, pnpm, webDistReady } from './scripts/env.mjs'

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

if (!nodeHasFts5()) {
  console.warn('当前 Node 没有 SQLite FTS5，侧栏全文搜索已关闭。建议安装 Node.js 22.19+：https://nodejs.org/')
}

console.log(`DSH_HOME=${DSH_HOME}`)
console.log('启动 Web UI → http://127.0.0.1:3080')
pnpm(['dsh', 'web', '--patch', './extensions/personal-assistant/cordis.yml', ...process.argv.slice(2)])
