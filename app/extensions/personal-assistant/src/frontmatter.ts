export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } | undefined {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/)
  if (!match) return undefined
  const data = parseSimpleYaml(match[1] ?? '')
  const body = match[2] ?? ''
  return { data, body }
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [{ indent: -1, obj: root }]
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const indent = line.search(/\S/)
    const trimmed = line.trim()
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop()
    const parent = stack[stack.length - 1]!.obj
    const kv = trimmed.match(/^([^:]+):\s*(.*)$/)
    if (!kv) continue
    const key = kv[1]!.trim()
    const rawValue = kv[2]!.trim()
    if (rawValue === '') {
      const child: Record<string, unknown> = {}
      parent[key] = child
      stack.push({ indent, obj: child })
      continue
    }
    parent[key] = parseScalar(rawValue)
  }
  return root
}

function parseScalar(value: string): unknown {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+$/.test(value)) return Number(value)
  return value
}
