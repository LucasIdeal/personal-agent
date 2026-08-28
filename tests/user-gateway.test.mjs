import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { join } from 'node:path'
import test from 'node:test'

import {
  IDENTITY_COOKIE,
  createUserGateway,
  isValidIdentity,
} from '../scripts/user-gateway.mjs'

function createHarness(options = {}) {
  const starts = []
  const workers = []
  const startupDelay = options.startupDelay ?? 0

  const workerFactory = async spec => {
    starts.push(spec)
    if (startupDelay) await new Promise(resolve => setTimeout(resolve, startupDelay))

    const server = createServer((req, res) => {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        const body = JSON.stringify({
          user: spec.name,
          host: req.headers.host,
          method: req.method,
          path: req.url,
          body: Buffer.concat(chunks).toString(),
        })
        res.writeHead(200, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'x-worker-user': spec.name,
        })
        res.end(body)
      })
    })
    const sockets = new Set()
    server.on('connection', socket => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
    })
    server.on('upgrade', (req, socket, head) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: test\r\nConnection: Upgrade\r\n\r\n')
      if (head.length) socket.write(head)
      socket.on('data', chunk => socket.write(chunk))
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(spec.port, spec.host, resolve)
    })

    const worker = new EventEmitter()
    worker.ready = Promise.resolve()
    worker.exitCode = null
    worker.signalCode = null
    worker.kill = signal => {
      if (worker.exitCode != null || worker.signalCode != null) return false
      worker.signalCode = signal
      server.close(() => worker.emit('exit', null, signal))
      for (const socket of sockets) socket.destroy()
      server.closeAllConnections?.()
      return true
    }
    worker.crash = async () => {
      if (worker.exitCode != null || worker.signalCode != null) return
      worker.exitCode = 1
      const closed = new Promise(resolve => server.close(resolve))
      for (const socket of sockets) socket.destroy()
      await closed
      worker.emit('exit', 1, null)
    }
    workers.push(worker)
    return worker
  }

  const gateway = createUserGateway({
    host: '127.0.0.1',
    port: 0,
    root: '/test/personal-agent',
    ports: async () => {
      const probe = createServer()
      await new Promise((resolve, reject) => {
        probe.once('error', reject)
        probe.listen(0, '127.0.0.1', resolve)
      })
      const port = probe.address().port
      await new Promise(resolve => probe.close(resolve))
      return port
    },
    workerFactory,
    idleTimeout: 60_000,
    shutdownGrace: 100,
    handleSignals: false,
    ...options.gateway,
  })

  return { gateway, starts, workers }
}

async function runningHarness(options) {
  const harness = createHarness(options)
  await harness.gateway.listen()
  const port = harness.gateway.address().port
  return {
    ...harness,
    origin: `http://127.0.0.1:${port}`,
    port,
    async close() {
      await harness.gateway.close()
    },
  }
}

function cookieFor(name) {
  return `${IDENTITY_COOKIE}=${encodeURIComponent(name)}`
}

async function jsonRequest(origin, name, path = '/', init = {}) {
  const headers = new Headers(init.headers)
  headers.set('cookie', cookieFor(name))
  const response = await fetch(`${origin}${path}`, { ...init, headers })
  return { response, json: await response.json() }
}

async function rawJsonRequest(port, name, path, { host, method = 'GET', body = '' }) {
  return await new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        host,
        cookie: cookieFor(name),
        'content-type': 'text/plain',
        'content-length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())))
    })
    req.once('error', reject)
    req.end(body)
  })
}

test('identity validation only accepts safe enterprise English names', () => {
  for (const valid of ['Alice', 'alice.zhang', 'A_1', 'x-y']) assert.equal(isValidIdentity(valid), true)
  for (const invalid of ['', '1alice', '张三', '../alice', 'alice space', `a${'b'.repeat(64)}`]) {
    assert.equal(isValidIdentity(invalid), false)
  }
})

test('identity page, selection cookie, invalid name, and clearing work without a worker', async t => {
  const harness = await runningHarness()
  t.after(() => harness.close())

  const page = await fetch(`${harness.origin}/identify`)
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-type'), /^text\/html/)
  assert.match(await page.text(), /企业微信英文名/)
  assert.equal(harness.starts.length, 0)

  const selected = await fetch(`${harness.origin}/identity/select`, {
    method: 'POST',
    body: new URLSearchParams({ name: 'Alice.Zhang' }),
    redirect: 'manual',
  })
  assert.equal(selected.status, 303)
  assert.equal(selected.headers.get('location'), '/')
  const setCookie = selected.headers.get('set-cookie')
  assert.match(setCookie, new RegExp(`^${IDENTITY_COOKIE}=alice.zhang;`))
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Lax/i)

  const invalid = await fetch(`${harness.origin}/identity/select`, {
    method: 'POST',
    body: new URLSearchParams({ name: '../张三' }),
    redirect: 'manual',
  })
  assert.equal(invalid.status, 400)
  assert.match(await invalid.text(), /英文名无效/)
  assert.equal(harness.starts.length, 0)

  for (const method of ['GET', 'POST']) {
    const cleared = await fetch(`${harness.origin}/identity/clear`, { method, redirect: 'manual' })
    assert.equal(cleared.status, 303)
    assert.equal(cleared.headers.get('location'), '/identify')
    assert.match(cleared.headers.get('set-cookie'), /Max-Age=0/)
  }
})

test('unauthenticated pages redirect, APIs return 401, and WebSockets are rejected', async t => {
  const harness = await runningHarness()
  t.after(() => harness.close())

  const page = await fetch(`${harness.origin}/`, { redirect: 'manual' })
  assert.equal(page.status, 303)
  assert.equal(page.headers.get('location'), '/identify')

  const api = await fetch(`${harness.origin}/api/conversations`)
  assert.equal(api.status, 401)
  assert.deepEqual(await api.json(), { error: 'identity_required' })

  const socket = connect(harness.port, '127.0.0.1')
  socket.write('GET /socket HTTP/1.1\r\nHost: public.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
  let reply = ''
  socket.setEncoding('utf8')
  socket.on('data', chunk => { reply += chunk })
  await once(socket, 'close')
  assert.match(reply, /^HTTP\/1\.1 401 Unauthorized/)
  assert.equal(harness.starts.length, 0)
})

test('concurrent requests for one user start exactly one correctly configured worker', async t => {
  const harness = await runningHarness({
    startupDelay: 40,
    gateway: { trustedHosts: ['public.example', '10.0.0.8'] },
  })
  t.after(() => harness.close())

  const requests = Array.from({ length: 12 }, (_, index) =>
    jsonRequest(harness.origin, 'Alice', `/concurrent/${index}`),
  )
  const results = await Promise.all(requests)
  assert.equal(harness.starts.length, 1)
  assert.deepEqual(results.map(result => result.json.user), Array(12).fill('alice'))

  const spec = harness.starts[0]
  assert.equal(spec.command, process.execPath)
  assert.equal(spec.cwd, join('/test/personal-agent', 'app'))
  assert.equal(spec.env.DSH_HOME, join('/test/personal-agent', '.dsh', 'users', 'alice'))
  assert.deepEqual(spec.args.slice(0, 10), [
    '--import', 'tsx/esm',
    'apps/cli/src/bin.ts',
    'web',
    '--patch', './extensions/personal-assistant/cordis.yml',
    '--host', '127.0.0.1',
    '--port', String(spec.port),
  ])
  assert.deepEqual(spec.args.slice(10), ['--trusted-host', 'public.example', '10.0.0.8'])
})

test('different identities use different workers and isolated HTTP streams while preserving Host', async t => {
  const harness = await runningHarness()
  t.after(() => harness.close())

  const [alice, bob] = await Promise.all([
    rawJsonRequest(harness.port, 'Alice', '/echo?owner=alice', {
      host: 'assistant.corp.example',
      method: 'POST',
      body: 'alice-secret',
    }),
    rawJsonRequest(harness.port, 'Bob', '/echo?owner=bob', {
      host: 'assistant.corp.example',
      method: 'POST',
      body: 'bob-secret',
    }),
  ])

  assert.equal(harness.starts.length, 2)
  assert.notEqual(harness.starts[0].port, harness.starts[1].port)
  assert.deepEqual(alice, {
    user: 'alice',
    host: 'assistant.corp.example',
    method: 'POST',
    path: '/echo?owner=alice',
    body: 'alice-secret',
  })
  assert.deepEqual(bob, {
    user: 'bob',
    host: 'assistant.corp.example',
    method: 'POST',
    path: '/echo?owner=bob',
    body: 'bob-secret',
  })
})

test('a worker exit removes it and the next request restarts that identity', async t => {
  const harness = await runningHarness()
  t.after(() => harness.close())

  assert.equal((await jsonRequest(harness.origin, 'Alice')).json.user, 'alice')
  assert.equal(harness.starts.length, 1)
  await harness.workers[0].crash()

  assert.equal((await jsonRequest(harness.origin, 'Alice', '/after-crash')).json.user, 'alice')
  assert.equal(harness.starts.length, 2)
  assert.notEqual(harness.starts[0].port, harness.starts[1].port)
})

test('WebSocket upgrade and subsequent bytes are forwarded to the identity worker', async t => {
  const harness = await runningHarness()
  t.after(() => harness.close())

  const socket = connect(harness.port, '127.0.0.1')
  socket.setEncoding('utf8')
  let received = ''
  let sentPayload = false
  const completed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`WebSocket test timed out: ${received}`)), 2_000)
    timer.ref()
    socket.on('data', chunk => {
      received += chunk
      if (!sentPayload && received.includes('\r\n\r\n')) {
        sentPayload = true
        socket.write('gateway-echo')
      }
      if (received.includes('gateway-echo')) {
        clearTimeout(timer)
        resolve()
      }
    })
    socket.once('error', reject)
    socket.once('close', () => {
      if (!received.includes('gateway-echo')) reject(new Error(`WebSocket closed early: ${received}`))
    })
  })
  socket.write(
    `GET /socket HTTP/1.1\r\nHost: websocket.example\r\nCookie: ${cookieFor('Alice')}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
  )
  await completed
  assert.match(received, /^HTTP\/1\.1 101 Switching Protocols/)
  assert.match(received, /gateway-echo/)
  assert.equal(harness.starts.length, 1)
  socket.destroy()
})

test('idle workers are reclaimed only after HTTP completes and when no WebSocket remains', async t => {
  const harness = await runningHarness({ gateway: { idleTimeout: 30 } })
  t.after(() => harness.close())

  await jsonRequest(harness.origin, 'Alice')
  assert.equal(harness.starts.length, 1)
  await new Promise(resolve => setTimeout(resolve, 80))
  assert.notEqual(harness.workers[0].signalCode, null)

  await jsonRequest(harness.origin, 'Alice', '/restarted')
  assert.equal(harness.starts.length, 2)
})
