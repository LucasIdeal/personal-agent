#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { APP, DSH_HOME, assertNode, ensureHome, nodeHasFts5, pnpm, webDistReady } from './scripts/env.mjs'
import { startUserGateway } from './scripts/user-gateway.mjs'
import { initializeUserRoot, migrateLegacyUserData } from './scripts/user-data.mjs'

// 优化 Node.js 异步 I/O 线程池大小（默认仅 4，提升至 16 可加速并发文件读取与 SQLite 操作）
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16'

// 优化 V8 内存限制默认值
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim()

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

const args = process.argv.slice(2)
const singleUser = args.indexOf('--single-user')
if (singleUser >= 0) {
  args.splice(singleUser, 1)
  console.log(`DSH_HOME=${DSH_HOME}`)
  console.log('启动单用户 Web UI → http://127.0.0.1:3080')
  pnpm(['dsh', 'web', '--patch', './extensions/personal-assistant/cordis.yml', ...args])
} else {
  const options = parseGatewayArgs(args)
  const migration = await migrateLegacyUserData(DSH_HOME)
  if (migration.migrated) {
    console.log(`已将现有数据迁移给 ${migration.username}，备份：${migration.backupRoot}`)
  }
  await startUserGateway({
    ...options,
    root: join(APP, '..'),
    appRoot: APP,
    dshHome: DSH_HOME,
    prepareUser: username => initializeUserRoot(DSH_HOME, username),
  })
  console.log(`多用户入口 → http://${options.host}:${options.port}`)
}

function parseGatewayArgs(argv) {
  const options = { host: '127.0.0.1', port: 3080, trustedHosts: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--host') {
      options.host = requireValue(argv, ++index, arg)
    } else if (arg === '--port') {
      options.port = Number(requireValue(argv, ++index, arg))
      if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
        throw new Error('--port 必须是 0 到 65535 之间的整数')
      }
    } else if (arg === '--trusted-host') {
      let consumed = 0
      while (argv[index + 1] !== undefined && !argv[index + 1].startsWith('--')) {
        options.trustedHosts.push(argv[++index])
        consumed++
      }
      if (consumed === 0) throw new Error('--trusted-host 缺少域名')
    } else {
      throw new Error(`未知启动参数：${arg}`)
    }
  }
  return options
}

function requireValue(argv, index, flag) {
  const value = argv[index]
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} 缺少参数`)
  return value
}
