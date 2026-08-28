import { spawn } from 'node:child_process'
import { createServer as createHttpServer, request as httpRequest } from 'node:http'
import { createServer as createNetServer, connect as netConnect } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeUsername } from './user-data.mjs'

export const IDENTITY_COOKIE = 'personal_agent_identity'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3080
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function isValidIdentity(value) {
  try {
    normalizeUsername(value)
    return true
  } catch {
    return false
  }
}

function parseCookies(header = '') {
  const cookies = new Map()
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    try {
      cookies.set(key, decodeURIComponent(part.slice(separator + 1).trim()))
    } catch {
      // Ignore malformed cookies.
    }
  }
  return cookies
}

function identityFromRequest(req) {
  const identity = parseCookies(req.headers.cookie).get(IDENTITY_COOKIE)
  try {
    return normalizeUsername(identity)
  } catch {
    return undefined
  }
}

function identityPage(error = '', currentIdentity = '') {
  const message = error
    ? '<p role="alert">英文名无效。请使用英文字母开头，只包含字母、数字、点、下划线或连字符（最多 64 个字符）。</p>'
    : ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>选择身份</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { display:grid; min-height:100vh; margin:0; place-items:center; background:#f3f4f6; color:#111827; }
    main { width:min(90vw,26rem); box-sizing:border-box; padding:2rem; border-radius:1rem; background:white; box-shadow:0 12px 35px #0002; }
    h1 { margin-top:0; font-size:1.5rem; } label { display:block; margin-bottom:.5rem; font-weight:500; }
    input,button { width:100%; box-sizing:border-box; padding:.75rem; font:inherit; border-radius:.5rem; }
    input { border:1px solid #9ca3af; margin-bottom:.5rem; } button { margin-top:.75rem; border:0; background:#2563eb; color:white; cursor:pointer; font-weight:600; }
    button.secondary { background:#4b5563; }
    [role=alert] { color:#b91c1c; font-size:0.875rem; }
    .current-user-box { margin-bottom: 1.25rem; padding: 0.75rem 1rem; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 0.5rem; color: #0369a1; }
    @media (prefers-color-scheme:dark) {
      body{background:#111827;color:#f9fafb}
      main{background:#1f2937}
      .current-user-box { background: #0c4a6e; border-color: #0369a1; color: #e0f2fe; }
    }
  </style>
</head>
<body><main>
  <h1>企业微信身份登录</h1>
  ${message}
  ${currentIdentity ? `<div class="current-user-box">当前会话：<strong>${currentIdentity}</strong></div>` : ''}
  <form method="post" action="/identity/select">
    <label for="name">企业微信英文名</label>
    <input id="name" name="name" required maxlength="64" pattern="[A-Za-z][A-Za-z0-9._-]{0,63}" placeholder="例如：rhyszhao" autocomplete="username" autofocus>
    <button type="submit">进入智能助理</button>
  </form>
</main></body>
</html>`
}

function sendIdentityPage(res, invalid = false, currentIdentity = '') {
  const body = identityPage(invalid, currentIdentity)
  res.writeHead(invalid ? 400 : 200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function redirect(res, location, cookie) {
  const headers = { location, 'cache-control': 'no-store', 'content-length': '0' }
  if (cookie) headers['set-cookie'] = cookie
  res.writeHead(303, headers)
  res.end()
}

function readForm(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('form too large'), { statusCode: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

async function freeLoopbackPort(host = DEFAULT_HOST) {
  return await new Promise((resolve, reject) => {
    const server = createNetServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const { port } = server.address()
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

function portAllocator(ports, host) {
  if (!ports) return () => freeLoopbackPort(host)
  if (typeof ports === 'function') return ports
  if (typeof ports.allocate === 'function') return () => ports.allocate()
  if (typeof ports.next === 'function') {
    return async () => {
      const result = await ports.next()
      if (result.done) throw new Error('No worker ports remain')
      return result.value
    }
  }
  if (Array.isArray(ports)) {
    let index = 0
    return async () => {
      if (index >= ports.length) throw new Error('No worker ports remain')
      return ports[index++]
    }
  }
  throw new TypeError('ports must be a function, allocator, iterator, or array')
}

function defaultWorkerFactory({ command, args, cwd, env }) {
  return spawn(command, args, { cwd, env, stdio: 'inherit' })
}

function waitForHealth(port, {
  host,
  timeout,
  interval,
  path,
  worker,
}) {
  if (worker?.ready && typeof worker.ready.then === 'function') return worker.ready
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    let timer
    let settled = false

    const finish = error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker?.off?.('exit', onExit)
      error ? reject(error) : resolve()
    }
    const onExit = (code, signal) => {
      finish(new Error(`Worker exited before ready (${signal ?? code ?? 'unknown'})`))
    }
    const check = () => {
      if (settled) return
      const request = httpRequest({ host, port, path, method: 'GET' }, response => {
        const isJsonPath = path.startsWith('/planner-api') || path.startsWith('/api')
        const contentType = String(response.headers['content-type'] || '')
        const ok = response.statusCode >= 200 && response.statusCode < 400 && (!isJsonPath || contentType.includes('json'))
        response.resume()
        if (ok) {
          finish()
        } else {
          retry()
        }
      })
      request.setTimeout(Math.min(1000, interval * 4), () => request.destroy())
      request.once('error', retry)
      request.end()
    }
    const retry = () => {
      if (settled) return
      if (Date.now() - startedAt >= timeout) {
        finish(new Error(`Worker on ${host}:${port} did not become ready within ${timeout}ms`))
      } else {
        clearTimeout(timer)
        timer = setTimeout(check, interval)
        timer.unref?.()
      }
    }

    worker?.once?.('exit', onExit)
    check()
  })
}

function terminateWorker(worker, graceMs) {
  if (!worker || worker.exitCode != null || worker.signalCode != null) return Promise.resolve()
  return new Promise(resolve => {
    let forceTimer
    const done = () => {
      clearTimeout(forceTimer)
      resolve()
    }
    worker.once?.('exit', done)
    try {
      worker.kill?.('SIGTERM')
    } catch {
      done()
      return
    }
    if (typeof worker.once !== 'function') {
      resolve()
      return
    }
    forceTimer = setTimeout(() => {
      try {
        worker.kill?.('SIGKILL')
      } finally {
        resolve()
      }
    }, graceMs)
    forceTimer.unref?.()
  })
}

function defaultIsApiRequest(req, pathname) {
  if (/^\/(?:api|rpc|_api)(?:\/|$)/.test(pathname)) return true
  if (req.method !== 'GET' && req.method !== 'HEAD') return true
  return req.headers.accept?.includes('application/json') ?? false
}

export function createUserGateway(options = {}) {
  const host = options.host ?? DEFAULT_HOST
  const listenPort = options.port ?? DEFAULT_PORT
  const workerHost = options.workerHost ?? DEFAULT_HOST
  const root = options.root ?? ROOT
  const appRoot = options.appRoot ?? join(root, 'app')
  const dshHome = options.dshHome ?? join(root, '.dsh')
  const workerFactory = options.workerFactory ?? defaultWorkerFactory
  const prepareUser = options.prepareUser ?? (() => Promise.resolve())
  const allocatePort = portAllocator(options.ports, workerHost)
  const startupTimeout = options.startupTimeout ?? 30_000
  const healthInterval = options.healthInterval ?? 100
  const healthPath = options.healthPath ?? '/planner-api'
  const idleTimeout = options.idleTimeout ?? 15 * 60_000
  const shutdownGrace = options.shutdownGrace ?? 5_000
  const trustedHosts = options.trustedHosts ?? []
  const isApiRequest = options.isApiRequest ?? defaultIsApiRequest
  const records = new Map()
  const workerStarts = new Map()
  const gatewaySockets = new Set()
  let closing = false
  let signalsInstalled = false

  function scheduleIdle(record) {
    clearTimeout(record.idleTimer)
    if (idleTimeout <= 0 || record.activeRequests || record.webSockets) return
    record.idleTimer = setTimeout(() => {
      if (record.activeRequests || record.webSockets || records.get(record.name) !== record) return
      records.delete(record.name)
      record.stopping = true
      void terminateWorker(record.worker, shutdownGrace)
    }, idleTimeout)
    record.idleTimer.unref?.()
  }

  async function startWorker(name) {
    await prepareUser(name)
    const port = await allocatePort()
    if (closing) throw new Error('Gateway is shutting down')
    const args = [
      '--import', 'tsx/esm',
      'apps/cli/src/bin.ts',
      'web',
      '--patch', './extensions/personal-assistant/cordis.yml',
      '--host', workerHost,
      '--port', String(port),
    ]
    if (trustedHosts.length) args.push('--trusted-host', ...trustedHosts)
    const env = {
      ...process.env,
      DSH_HOME: join(dshHome, 'users', name),
    }
    const spec = {
      name,
      port,
      host: workerHost,
      command: process.execPath,
      args,
      cwd: appRoot,
      env,
    }
    const worker = await workerFactory(spec)
    if (!worker) throw new Error('workerFactory returned no worker')
    if (closing) {
      await terminateWorker(worker, shutdownGrace)
      throw new Error('Gateway is shutting down')
    }
    const record = {
      ...spec,
      worker,
      ready: undefined,
      activeRequests: 0,
      webSockets: 0,
      idleTimer: undefined,
      stopping: false,
    }
    records.set(name, record)
    worker.once?.('exit', () => {
      clearTimeout(record.idleTimer)
      if (records.get(name) === record) records.delete(name)
    })
    record.ready = waitForHealth(port, {
      host: workerHost,
      timeout: startupTimeout,
      interval: healthInterval,
      path: healthPath,
      worker,
    }).then(() => {
      scheduleIdle(record)
      return record
    }).catch(error => {
      if (records.get(name) === record) records.delete(name)
      void terminateWorker(worker, shutdownGrace)
      throw error
    })
    return await record.ready
  }

  async function getWorker(name) {
    if (closing) throw new Error('Gateway is shutting down')
    const current = records.get(name)
    if (current && !current.stopping) return await current.ready
    let pending = workerStarts.get(name)
    if (!pending) {
      pending = startWorker(name)
      workerStarts.set(name, pending)
      const clearPending = () => {
        if (workerStarts.get(name) === pending) workerStarts.delete(name)
      }
      pending.then(clearPending, clearPending)
    }
    return await pending
  }

  function rejectUnauthenticated(req, res, pathname) {
    if (isApiRequest(req, pathname)) {
      const body = JSON.stringify({ error: 'identity_required' })
      res.writeHead(401, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
      })
      res.end(body)
    } else {
      redirect(res, '/identify')
    }
  }

  function proxyHttp(req, res, record) {
    record.activeRequests++
    clearTimeout(record.idleTimer)
    let finished = false
    const release = () => {
      if (finished) return
      finished = true
      record.activeRequests--
      scheduleIdle(record)
    }

    const headers = { ...req.headers }
    const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted
    if (isHttps) {
      headers['x-forwarded-proto'] = 'https'
    }

    const upstream = httpRequest({
      host: workerHost,
      port: record.port,
      method: req.method,
      path: req.url,
      headers,
    }, upstreamResponse => {
      const responseHeaders = { ...upstreamResponse.headers }
      if (isHttps && responseHeaders['set-cookie']) {
        const cookies = Array.isArray(responseHeaders['set-cookie'])
          ? responseHeaders['set-cookie']
          : [responseHeaders['set-cookie']]
        responseHeaders['set-cookie'] = cookies.map(c => (c.includes('Secure') ? c : `${c}; Secure`))
      }
      res.writeHead(upstreamResponse.statusCode, upstreamResponse.statusMessage, responseHeaders)
      upstreamResponse.pipe(res)
      upstreamResponse.once('end', release)
      upstreamResponse.once('error', release)
    })
    upstream.once('error', error => {
      release()
      if (!res.headersSent) {
        const body = 'Bad Gateway'
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'content-length': Buffer.byteLength(body) })
        res.end(body)
      } else {
        res.destroy(error)
      }
    })
    res.once('close', release)
    req.pipe(upstream)
  }

  const server = createHttpServer(async (req, res) => {
    let pathname
    try {
      pathname = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`).pathname
    } catch {
      res.writeHead(400).end()
      return
    }

    if (req.method === 'GET' && pathname === '/identify') {
      sendIdentityPage(res, false, identityFromRequest(req))
      return
    }
    if (req.method === 'POST' && pathname === '/identity/select') {
      try {
        const form = await readForm(req)
        let name
        try {
          name = normalizeUsername(form.get('name'))
        } catch {
          sendIdentityPage(res, true)
          return
        }
        const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted
        const secureFlag = isHttps ? '; Secure' : ''
        redirect(res, '/', `${IDENTITY_COOKIE}=${encodeURIComponent(name)}; Path=/; HttpOnly; SameSite=Lax${secureFlag}`)
      } catch (error) {
        if (!res.headersSent && !res.destroyed) res.writeHead(error.statusCode ?? 400).end()
      }
      return
    }
    if ((req.method === 'GET' || req.method === 'POST') && pathname === '/identity/clear') {
      const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted
      const secureFlag = isHttps ? '; Secure' : ''
      redirect(
        res,
        '/identify',
        `${IDENTITY_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`,
      )
      return
    }

    const identity = identityFromRequest(req)
    if (!identity) {
      rejectUnauthenticated(req, res, pathname)
      return
    }
    try {
      proxyHttp(req, res, await getWorker(identity))
    } catch {
      if (!res.headersSent) res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('Worker unavailable')
    }
  })

  server.on('connection', socket => {
    gatewaySockets.add(socket)
    socket.once('close', () => gatewaySockets.delete(socket))
  })

  server.on('upgrade', async (req, socket, head) => {
    socket.pause()
    const identity = identityFromRequest(req)
    if (!identity) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      return
    }
    let record
    try {
      record = await getWorker(identity)
    } catch {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      return
    }
    record.webSockets++
    clearTimeout(record.idleTimer)
    let released = false
    const release = () => {
      if (released) return
      released = true
      record.webSockets--
      scheduleIdle(record)
    }
    const upstream = netConnect(record.port, workerHost)
    upstream.once('connect', () => {
      const rawHeaders = []
      for (let index = 0; index < req.rawHeaders.length; index += 2) {
        rawHeaders.push(`${req.rawHeaders[index]}: ${req.rawHeaders[index + 1]}`)
      }
      upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${rawHeaders.join('\r\n')}\r\n\r\n`)
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
      socket.resume()
    })
    upstream.once('error', () => {
      if (!socket.destroyed) socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      release()
    })
    upstream.once('close', release)
    socket.once('close', () => {
      upstream.destroy()
      release()
    })
    socket.once('error', () => upstream.destroy())
  })

  const signalHandler = async () => {
    await close()
    process.exitCode = 0
  }

  function installSignals() {
    if (signalsInstalled || options.handleSignals === false) return
    signalsInstalled = true
    process.once('SIGINT', signalHandler)
    process.once('SIGTERM', signalHandler)
  }

  function removeSignals() {
    if (!signalsInstalled) return
    signalsInstalled = false
    process.off('SIGINT', signalHandler)
    process.off('SIGTERM', signalHandler)
  }

  function listen() {
    return new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(listenPort, host, () => {
        server.off('error', reject)
        installSignals()
        resolve(server.address())
      })
    })
  }

  async function close() {
    if (closing) return
    closing = true
    removeSignals()
    await new Promise(resolve => {
      if (!server.listening) {
        resolve()
        return
      }
      server.close(() => resolve())
      for (const socket of gatewaySockets) socket.destroy()
      server.closeAllConnections?.()
    })
    await Promise.allSettled([...workerStarts.values()])
    const active = [...records.values()]
    records.clear()
    for (const record of active) clearTimeout(record.idleTimer)
    await Promise.all(active.map(record => terminateWorker(record.worker, shutdownGrace)))
  }

  return {
    server,
    workers: records,
    listen,
    close,
    address: () => server.address(),
    getWorker,
  }
}

export async function startUserGateway(options = {}) {
  const gateway = createUserGateway(options)
  await gateway.listen()
  return gateway
}
