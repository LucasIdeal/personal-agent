import { randomUUID } from 'node:crypto'
import {
  constants,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const DEFAULT_LEGACY_USERNAME = 'rhyszhao'

const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/
const MIGRATION_PREFIX = '.legacy-user-migration-'
const MODEL_FILES = ['settings.yaml', '.credentials.yaml']

/**
 * Convert a user-supplied name to its canonical directory name.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeUsername(value) {
  if (typeof value !== 'string') throw new TypeError('用户名必须是字符串')
  const normalized = value.trim().toLowerCase()
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error('用户名必须以英文字母开头，只能包含英文字母、数字、点、_ 或 -，且最多 64 个字符')
  }
  return normalized
}

/**
 * Test whether a value is already a canonical, valid username.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidUsername(value) {
  return typeof value === 'string' && USERNAME_PATTERN.test(value)
}

/**
 * Create the per-user data root and built-in chat directory.
 * @param {string} dshHome
 * @param {string} username
 */
export async function initializeUserRoot(dshHome, username) {
  const name = normalizeUsername(username)
  const home = resolve(dshHome)
  const usersRoot = join(home, 'users')
  const userRoot = join(usersRoot, name)
  const chatHome = join(userRoot, 'chat')
  await mkdir(chatHome, { recursive: true })
  const modelTemplate = join(home, 'shared', 'model')
  for (const file of MODEL_FILES) {
    const source = join(modelTemplate, file)
    const target = join(userRoot, file)
    if (await pathExists(source) && !await pathExists(target)) await cp(source, target, { errorOnExist: true })
  }
  return { dshHome: home, usersRoot, username: name, userRoot, chatHome }
}

function isGatewayState(name) {
  return name === 'gateway'
    || /^(?:\.?user[._-])?\.?gateway(?:[._-].*)$/.test(name)
}

function isRootResident(name) {
  return name === 'demo-key'
    || name === 'users'
    || name === 'backups'
    || name === 'shared'
    || name.startsWith(MIGRATION_PREFIX)
    || isGatewayState(name)
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function directoryIsEmpty(path) {
  try {
    return (await readdir(path)).length === 0
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  await rename(temporary, path)
}

function sqliteCheck(db, pragma, databasePath) {
  const rows = db.prepare(`PRAGMA ${pragma}`).all()
  if (rows.length !== 1 || Object.values(rows[0] ?? {})[0] !== 'ok') {
    throw new Error(`${basename(databasePath)} 的 PRAGMA ${pragma} 失败：${JSON.stringify(rows)}`)
  }
}

function validateSqlite(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true })
  try {
    sqliteCheck(db, 'quick_check', databasePath)
    sqliteCheck(db, 'integrity_check', databasePath)
  } finally {
    db.close()
  }
}

function updateSessionCwds(databasePath, oldChatHome, newChatHome) {
  const db = new DatabaseSync(databasePath)
  try {
    sqliteCheck(db, 'quick_check', databasePath)
    sqliteCheck(db, 'integrity_check', databasePath)
    const table = db.prepare(
      "SELECT 1 AS present FROM sqlite_schema WHERE type = 'table' AND name = 'sessions'",
    ).get()
    if (table) {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('UPDATE sessions SET cwd = ? WHERE cwd = ?').run(newChatHome, oldChatHome)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
    sqliteCheck(db, 'quick_check', databasePath)
    sqliteCheck(db, 'integrity_check', databasePath)
  } finally {
    db.close()
  }
}

function rewriteChatPath(value, oldChatHome, newChatHome) {
  if (typeof value === 'string') {
    if (value === oldChatHome) return newChatHome
    if (value.startsWith(`${oldChatHome}/`) || value.startsWith(`${oldChatHome}\\`)) {
      return `${newChatHome}${value.slice(oldChatHome.length)}`
    }
    return value
  }
  if (Array.isArray(value)) return value.map(item => rewriteChatPath(item, oldChatHome, newChatHome))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteChatPath(item, oldChatHome, newChatHome)]),
    )
  }
  return value
}

async function jsonFilesBelow(root) {
  if (!await pathExists(root)) return []
  const files = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && entry.name.endsWith('.json')) files.push(path)
    }
  }
  return files
}

async function updateStorageJson(root, oldChatHome, newChatHome) {
  for (const path of await jsonFilesBelow(root)) {
    const source = await readFile(path, 'utf8')
    const parsed = JSON.parse(source)
    const updated = rewriteChatPath(parsed, oldChatHome, newChatHome)
    if (JSON.stringify(updated) !== JSON.stringify(parsed)) await writeJsonAtomic(path, updated)
  }
}

async function restoreFromBackup(dshHome, userRoot, backupRoot, candidates) {
  for (const name of candidates) {
    await rm(join(dshHome, name), { recursive: true, force: true })
    await rm(join(userRoot, name), { recursive: true, force: true })
    await cp(join(backupRoot, name), join(dshHome, name), {
      recursive: true,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    })
  }
}

/**
 * Back up and migrate the old flat `$DSH_HOME` layout into one user's root.
 * Root-owned credentials, user/backup trees, and gateway state are untouched.
 * @param {string} dshHome
 * @param {string} [username]
 */
export async function migrateLegacyUserData(dshHome, username = DEFAULT_LEGACY_USERNAME) {
  const name = normalizeUsername(username)
  const home = resolve(dshHome)
  const usersRoot = join(home, 'users')
  const userRoot = join(usersRoot, name)
  const chatHome = join(userRoot, 'chat')
  const backupsRoot = join(home, 'backups')
  const markerPath = join(backupsRoot, `${MIGRATION_PREFIX}${name}.complete.json`)
  const lockPath = join(home, `${MIGRATION_PREFIX}${name}.lock`)

  await mkdir(backupsRoot, { recursive: true })
  await mkdir(userRoot, { recursive: true })
  if (await pathExists(markerPath)) {
    await mkdir(chatHome, { recursive: true })
    return { migrated: false, alreadyComplete: true, username: name, userRoot, chatHome, markerPath }
  }

  let lock
  try {
    lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY)
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`用户数据迁移正在进行：${name}`)
    throw error
  }

  let backupRoot
  let candidates = []
  let mutationStarted = false
  try {
    candidates = (await readdir(home)).filter(entry => !isRootResident(entry)).sort()
    for (const candidate of candidates) {
      const target = join(userRoot, candidate)
      if (!await pathExists(target)) continue
      if (candidate === 'chat' && await directoryIsEmpty(target)) continue
      throw new Error(`无法迁移 ${candidate}：目标已存在 ${target}`)
    }

    const sqliteSource = join(home, 'sessions.sqlite')
    if (candidates.includes('sessions.sqlite')) validateSqlite(sqliteSource)

    backupRoot = join(backupsRoot, `legacy-${name}-${Date.now()}-${randomUUID()}`)
    await mkdir(backupRoot, { recursive: false })
    for (const candidate of candidates) {
      await cp(join(home, candidate), join(backupRoot, candidate), {
        recursive: true,
        errorOnExist: true,
        force: false,
        preserveTimestamps: true,
        verbatimSymlinks: true,
      })
    }
    const modelTemplate = join(home, 'shared', 'model')
    await mkdir(modelTemplate, { recursive: true })
    for (const file of MODEL_FILES) {
      if (candidates.includes(file) && !await pathExists(join(modelTemplate, file))) {
        await cp(join(backupRoot, file), join(modelTemplate, file), { errorOnExist: true })
      }
    }

    mutationStarted = true
    for (const candidate of candidates) {
      const target = join(userRoot, candidate)
      if (candidate === 'chat' && await directoryIsEmpty(target)) await rm(target, { recursive: true })
      await rename(join(home, candidate), target)
    }

    const oldChatHome = join(home, 'chat')
    const newChatHome = chatHome
    const sqliteTarget = join(userRoot, 'sessions.sqlite')
    if (candidates.includes('sessions.sqlite')) updateSessionCwds(sqliteTarget, oldChatHome, newChatHome)
    await updateStorageJson(join(userRoot, 'storages'), oldChatHome, newChatHome)
    await mkdir(chatHome, { recursive: true })

    await writeJsonAtomic(markerPath, {
      version: 1,
      username: name,
      completedAt: new Date().toISOString(),
      backup: relative(home, backupRoot).split(sep).join('/'),
      migrated: candidates,
      oldChatHome,
      newChatHome,
    })
    return {
      migrated: true,
      alreadyComplete: false,
      username: name,
      userRoot,
      chatHome,
      markerPath,
      backupRoot,
      candidates,
    }
  } catch (error) {
    if (mutationStarted && backupRoot) {
      try {
        await restoreFromBackup(home, userRoot, backupRoot, candidates)
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], '用户数据迁移失败，且自动恢复未能完成')
      }
    }
    throw error
  } finally {
    await lock?.close()
    await rm(lockPath, { force: true })
  }
}
