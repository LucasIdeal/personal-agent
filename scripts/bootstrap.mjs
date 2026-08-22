#!/usr/bin/env node
import { join } from 'node:path'
import { APP, assertNode, ensureHome, pnpm, webDistReady } from './env.mjs'

assertNode()
ensureHome()

console.log('==> 安装依赖（pnpm 会由 npx 自动获取，无需全局安装）')
pnpm(['install'], {
  env: {
    ...process.env,
    CI: 'true',
    npm_config_engine_strict: 'false',
  },
})

if (!webDistReady()) {
  console.log('==> 构建 Web 前端与运行时（首次较慢，只需一次）')
  pnpm(['run', 'build'])
} else {
  console.log('==> 已有构建产物，跳过 build')
}

console.log('')
console.log('安装完成。启动：')
console.log('  node start.mjs')
console.log(`工作目录：${APP}`)
