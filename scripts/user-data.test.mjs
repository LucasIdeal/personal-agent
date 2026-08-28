import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, test } from 'node:test'
import {
  initializeUserRoot,
  isValidUsername,
  migrateLegacyUserData,
  normalizeUsername,
} from './user-data.mjs'

const temporaryRoots = []

async function temporaryDshHome() {
  const root = await mkdtemp(join(tmpdir(), 'personal-agent-user-data-'))
  temporaryRoots.push(root)
  const dshHome = join(root, '.dsh')
  await mkdir(dshHome)
  return dshHome
}

async function exists(path) {
  try {
    await readFile(path)
    return true
  } catch (error) {
    if (error?.code === 'EISDIR') return true
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function createSessionsDatabase(path, cwd) {
  const db = new DatabaseSync(path)
  try {
    db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT)')
    db.prepare('INSERT INTO sessions (id, cwd) VALUES (?, ?)').run('session-1', cwd)
  } finally {
    db.close()
  }
}

function sessionCwd(path) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return db.prepare('SELECT cwd FROM sessions WHERE id = ?').get('session-1').cwd
  } finally {
    db.close()
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('username handling', () => {
  test('normalizes and validates canonical English usernames', () => {
    assert.equal(normalizeUsername('  RhyS.Zhao-2  '), 'rhys.zhao-2')
    assert.equal(isValidUsername('rhys.zhao-2'), true)
    assert.equal(isValidUsername('Rhys'), false)
    assert.throws(() => normalizeUsername('../rhys'))
    assert.throws(() => normalizeUsername('赵'))
    assert.throws(() => normalizeUsername('2rhys'))
  })
})

describe('initializeUserRoot', () => {
  test('creates an idempotent user chat root', async () => {
    const dshHome = await temporaryDshHome()
    await mkdir(join(dshHome, 'shared', 'model'), { recursive: true })
    await writeFile(join(dshHome, 'shared', 'model', 'settings.yaml'), 'model: shared')
    const first = await initializeUserRoot(dshHome, ' RhysZhao ')
    const second = await initializeUserRoot(dshHome, 'rhyszhao')

    assert.deepEqual(second, first)
    assert.equal(await exists(first.chatHome), true)
    assert.equal(await readFile(join(first.userRoot, 'settings.yaml'), 'utf8'), 'model: shared')
  })
})

describe('migrateLegacyUserData', () => {
  test('backs up and migrates flat data while preserving root-owned state', async () => {
    const dshHome = await temporaryDshHome()
    const oldChat = join(dshHome, 'chat')
    const newChat = join(dshHome, 'users', 'rhyszhao', 'chat')
    await mkdir(oldChat)
    await writeFile(join(oldChat, 'note.txt'), 'legacy chat')
    await writeFile(join(dshHome, 'config.yaml'), 'legacy config')
    await writeFile(join(dshHome, 'settings.yaml'), 'model: deepseek')
    await writeFile(join(dshHome, '.credentials.yaml'), 'DEEPSEEK_API_KEY: secret')
    await writeFile(join(dshHome, 'demo-key'), 'secret')
    await writeFile(join(dshHome, 'gateway-state.json'), '{"port":3080}')
    await writeFile(join(dshHome, 'user-gateway.json'), '{"users":[]}')
    await mkdir(join(dshHome, 'gateway'))
    await writeFile(join(dshHome, 'gateway', 'active.json'), '{}')
    await mkdir(join(dshHome, 'storages', 'nested'), { recursive: true })
    await writeFile(
      join(dshHome, 'storages', 'nested', 'state.json'),
      JSON.stringify({
        cwd: oldChat,
        file: join(oldChat, 'files', 'a.txt'),
        untouched: '/tmp/chat',
        nested: [oldChat],
      }),
    )
    createSessionsDatabase(join(dshHome, 'sessions.sqlite'), oldChat)

    const result = await migrateLegacyUserData(dshHome)

    assert.equal(result.migrated, true)
    assert.equal(await readFile(join(newChat, 'note.txt'), 'utf8'), 'legacy chat')
    assert.equal(await readFile(join(result.userRoot, 'config.yaml'), 'utf8'), 'legacy config')
    assert.equal(await exists(join(dshHome, 'config.yaml')), false)
    assert.equal(await readFile(join(dshHome, 'demo-key'), 'utf8'), 'secret')
    assert.equal(await readFile(join(dshHome, 'shared', 'model', 'settings.yaml'), 'utf8'), 'model: deepseek')
    assert.equal(
      await readFile(join(dshHome, 'shared', 'model', '.credentials.yaml'), 'utf8'),
      'DEEPSEEK_API_KEY: secret',
    )
    assert.equal(await readFile(join(dshHome, 'gateway-state.json'), 'utf8'), '{"port":3080}')
    assert.equal(await readFile(join(dshHome, 'user-gateway.json'), 'utf8'), '{"users":[]}')
    assert.equal(await readFile(join(dshHome, 'gateway', 'active.json'), 'utf8'), '{}')
    assert.equal(sessionCwd(join(result.userRoot, 'sessions.sqlite')), newChat)

    const storage = JSON.parse(await readFile(
      join(result.userRoot, 'storages', 'nested', 'state.json'),
      'utf8',
    ))
    assert.equal(storage.cwd, newChat)
    assert.equal(storage.file, join(newChat, 'files', 'a.txt'))
    assert.equal(storage.untouched, '/tmp/chat')
    assert.deepEqual(storage.nested, [newChat])

    assert.equal(await readFile(join(result.backupRoot, 'config.yaml'), 'utf8'), 'legacy config')
    assert.equal(await readFile(join(result.backupRoot, 'chat', 'note.txt'), 'utf8'), 'legacy chat')
    assert.equal(sessionCwd(join(result.backupRoot, 'sessions.sqlite')), oldChat)

    const rerun = await migrateLegacyUserData(dshHome)
    assert.equal(rerun.migrated, false)
    assert.equal(rerun.alreadyComplete, true)
    assert.equal((await readdir(join(dshHome, 'backups'))).filter(name => name.startsWith('legacy-rhyszhao-')).length, 1)
  })

  test('restores the flat layout when post-move rewriting fails', async () => {
    const dshHome = await temporaryDshHome()
    const oldChat = join(dshHome, 'chat')
    await mkdir(oldChat)
    await writeFile(join(oldChat, 'note.txt'), 'must survive')
    await mkdir(join(dshHome, 'storages'))
    await writeFile(join(dshHome, 'storages', 'broken.json'), '{')
    createSessionsDatabase(join(dshHome, 'sessions.sqlite'), oldChat)

    await assert.rejects(migrateLegacyUserData(dshHome), SyntaxError)

    assert.equal(await readFile(join(dshHome, 'chat', 'note.txt'), 'utf8'), 'must survive')
    assert.equal(await readFile(join(dshHome, 'storages', 'broken.json'), 'utf8'), '{')
    assert.equal(sessionCwd(join(dshHome, 'sessions.sqlite')), oldChat)
    assert.equal(await exists(join(dshHome, 'users', 'rhyszhao', 'sessions.sqlite')), false)
    const backupEntries = await readdir(join(dshHome, 'backups'))
    assert.equal(backupEntries.some(name => name.endsWith('.complete.json')), false)
    assert.equal(backupEntries.some(name => name.startsWith('legacy-rhyszhao-')), true)
  })
})
