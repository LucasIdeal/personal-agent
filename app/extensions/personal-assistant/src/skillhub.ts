import { execFile, execFileSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'
import { resolveSkillRoots } from './skill-catalog.ts'

const execFileAsync = promisify(execFile)

export interface SkillHubHit {
  slug: string
  title?: string
  description?: string
  version?: string
}

export interface SkillHubInstallResult {
  ok: boolean
  slug: string
  message: string
}

const SKILLHUB_BIN = process.env.SKILLHUB_BIN ?? 'skillhub'
const COS_ZIP_TEMPLATE = 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills/{slug}.zip'

export function skillInstallTargets(notesDir: string): { primary: string; mirror: string } {
  const [primary, mirror] = resolveSkillRoots(notesDir)
  return { primary, mirror }
}

export async function searchSkillHub(query: string): Promise<{ items: SkillHubHit[]; warning?: string }> {
  const q = query.trim()
  if (!q) return { items: [] }
  try {
    const { stdout } = await runSkillhub(['search', q])
    const items = parseSearchOutput(stdout)
    if (items.length) return { items }
    return { items: [], warning: '远程搜索无结果，可尝试精确 slug 安装。' }
  } catch (error) {
    return {
      items: [],
      warning: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function installSkillHubSkill(notesDir: string, slug: string, force = false): Promise<SkillHubInstallResult> {
  // Keep SkillHub slug syntax intact (scoped names like @scope/name), only
  // stripping whitespace and characters that could be unsafe as CLI args.
  const cleaned = slug.trim().replace(/[^A-Za-z0-9@/_.\-]+/g, '')
  if (!cleaned) return { ok: false, slug, message: '无效的 skill slug' }
  const { primary, mirror } = skillInstallTargets(notesDir)
  await mkdir(primary, { recursive: true })

  try {
    const args = ['--dir', primary, 'install', ...installArgsForSlug(cleaned)]
    if (force) args.push('--force')
    const { stdout, stderr } = await runSkillhub(args)
    await mirrorAllSkills(primary, mirror)
    return { ok: true, slug: cleaned, message: (stdout || stderr || `已安装 ${cleaned}`).trim() }
  } catch (cliError) {
    try {
      await installFromCosZip(primary, cleaned, force)
      await mirrorAllSkills(primary, mirror)
      return { ok: true, slug: cleaned, message: `已从 COS 安装 ${cleaned}` }
    } catch (zipError) {
      const msg = [
        cliError instanceof Error ? cliError.message : String(cliError),
        zipError instanceof Error ? zipError.message : String(zipError),
      ].join(' · ')
      return { ok: false, slug: cleaned, message: msg }
    }
  }
}

/** Convert `@scope/name` into `name --namespace scope`, which the CLI expects. */
function installArgsForSlug(slug: string): string[] {
  const scoped = slug.match(/^@([^/]+)\/(.+)$/)
  if (scoped) return [scoped[2]!, '--namespace', scoped[1]!]
  return [slug]
}

export async function listInstalledSkillSlugs(notesDir: string): Promise<string[]> {
  const { primary } = skillInstallTargets(notesDir)
  try {
    const { stdout } = await runSkillhub(['--dir', primary, 'list'])
    const fromCli = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !line.startsWith('No installed'))
    if (fromCli.length) return fromCli
  } catch {
    // fall through to directory scan
  }
  try {
    const names = await readdir(primary)
    const slugs: string[] = []
    for (const name of names) {
      try {
        await readFile(join(primary, name, 'SKILL.md'), 'utf8')
        slugs.push(name)
      } catch {
        // skip
      }
    }
    return slugs.sort()
  } catch {
    return []
  }
}

async function runSkillhub(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const env = { ...process.env, ...skillhubEnv() }
  try {
    return await execFileAsync(SKILLHUB_BIN, args, {
      env,
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    const message = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n').trim()
    throw new Error(message || 'skillhub 命令失败')
  }
}

let cachedCertFile: string | null | undefined

function resolveCertFile(): string | null {
  if (cachedCertFile !== undefined) return cachedCertFile
  if (process.env.SSL_CERT_FILE) {
    cachedCertFile = process.env.SSL_CERT_FILE
    return cachedCertFile
  }
  try {
    const out = execFileSync('python3', ['-m', 'certifi'], { encoding: 'utf8', timeout: 5000 }).trim()
    cachedCertFile = out || null
  } catch {
    cachedCertFile = null
  }
  return cachedCertFile
}

function skillhubEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  const cert = resolveCertFile()
  // The skillhub CLI (Python) needs a valid CA bundle to reach its search API;
  // DSH's process usually lacks SSL_CERT_FILE, so fall back to certifi's bundle.
  if (cert) env.SSL_CERT_FILE = cert
  return env
}

const SLUG_RE = /^[@A-Za-z0-9][A-Za-z0-9@/_.\-]*$/

function parseSearchOutput(stdout: string): SkillHubHit[] {
  // CLI layout per hit:
  //   "  <slug>  <title>"                 (indent 2)
  //   "    - <description>"               (indent 4)
  //   "<description wrapped again>"        (indent 0 — duplicate noise, skip)
  //   "    - version: x"                  (indent 4)
  //   "    - install: skillhub install …"  (indent 4 — skip)
  const hits: SkillHubHit[] = []
  let current: SkillHubHit | undefined
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim()) continue
    const trimmed = line.trim()
    const indent = line.length - line.trimStart().length
    if (indent === 0) continue
    if (/^(You can use|Error:|Warning:|info:|warn:)/.test(trimmed)) continue
    const detail = trimmed.match(/^-\s*(.*)$/)
    if (indent >= 4 && detail) {
      if (!current) continue
      const text = detail[1]!.trim()
      const version = text.match(/^version\s*:\s*(.+)$/i)
      if (version) current.version = version[1]!.trim()
      else if (/^install\s*:/i.test(text)) { /* skip install hint */ }
      else if (!current.description) current.description = text
      continue
    }
    if (indent <= 3) {
      const head = trimmed.match(/^(\S+)(?:\s{2,}(.*))?$/)
      if (head && SLUG_RE.test(head[1]!)) {
        current = { slug: head[1]!, title: head[2]?.trim() || head[1]! }
        hits.push(current)
      }
    }
  }
  const seen = new Set<string>()
  return hits.filter(item => {
    if (seen.has(item.slug)) return false
    seen.add(item.slug)
    return true
  })
}

async function installFromCosZip(skillsDir: string, slug: string, force: boolean): Promise<void> {
  const url = COS_ZIP_TEMPLATE.replace('{slug}', encodeURIComponent(slug))
  const tmpZip = join(skillsDir, `.${slug}.zip`)
  const target = join(skillsDir, slug)
  if (!force) {
    try {
      await readFile(join(target, 'SKILL.md'), 'utf8')
      throw new Error(`${slug} 已存在，如需覆盖请勾选强制安装`)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('已存在')) {
        // not installed yet
      } else {
        throw error
      }
    }
  }
  await downloadFile(url, tmpZip)
  try {
    await extractZip(tmpZip, target, force)
  } finally {
    await rm(tmpZip, { force: true })
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`下载失败 HTTP ${res.status}: ${url}`)
  await mkdir(dirname(dest), { recursive: true })
  const file = createWriteStream(dest)
  await pipeline(res.body as unknown as NodeJS.ReadableStream, file)
}

async function extractZip(zipPath: string, targetDir: string, force: boolean): Promise<void> {
  const staging = join(dirname(targetDir), `.${Date.now()}-staging`)
  if (force) await rm(targetDir, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  try {
    await execFileAsync('unzip', ['-oq', zipPath, '-d', staging], { timeout: 60_000 })
    const skillAtRoot = join(staging, 'SKILL.md')
    let source = staging
    try {
      await readFile(skillAtRoot, 'utf8')
    } catch {
      const children = await readdir(staging)
      const nested = children.length === 1 ? join(staging, children[0]!) : staging
      try {
        await readFile(join(nested, 'SKILL.md'), 'utf8')
        source = nested
      } catch {
        throw new Error('压缩包内未找到 SKILL.md')
      }
    }
    await mkdir(dirname(targetDir), { recursive: true })
    await cpDir(source, targetDir)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/**
 * Mirror every skill directory under `primary` into `mirror`, so both the DSH
 * user root and the chat `.agents/skills` root see freshly installed skills.
 * Handles flat (`name/SKILL.md`) and scoped (`@scope/name/SKILL.md`) layouts.
 */
async function mirrorAllSkills(primary: string, mirror: string): Promise<void> {
  for (const rel of await findSkillDirs(primary)) {
    const src = join(primary, rel)
    const dest = join(mirror, rel)
    await mkdir(dirname(dest), { recursive: true })
    await rm(dest, { recursive: true, force: true })
    await cpDir(src, dest)
  }
}

async function findSkillDirs(root: string, prefix = '', depth = 0): Promise<string[]> {
  if (depth > 2) return []
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return []
  }
  const found: string[] = []
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const abs = join(root, name)
    try {
      if (!(await stat(abs)).isDirectory()) continue
    } catch {
      continue
    }
    const rel = prefix ? `${prefix}/${name}` : name
    try {
      await readFile(join(abs, 'SKILL.md'), 'utf8')
      found.push(rel)
    } catch {
      found.push(...await findSkillDirs(abs, rel, depth + 1))
    }
  }
  return found
}

async function cpDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  for (const name of await readdir(src)) {
    const from = join(src, name)
    const to = join(dest, name)
    if ((await stat(from)).isDirectory()) await cpDir(from, to)
    else await writeFile(to, await readFile(from))
  }
}

export async function writeSkillFromBody(
  notesDir: string,
  slug: string,
  body: string,
): Promise<void> {
  const { primary, mirror } = skillInstallTargets(notesDir)
  for (const root of [primary, mirror]) {
    const dir = join(root, slug)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), body, 'utf8')
  }
}
