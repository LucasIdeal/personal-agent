const WEEK = ['一', '二', '三', '四', '五', '六', '日']
const KEY = 'qq-planner-open'
const PANEL_KEY = 'qq-planner-panel'

function readOpenPref() {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

function readPanelPref() {
  try {
    const value = localStorage.getItem(PANEL_KEY)
    if (value === 'memory' || value === 'capabilities') return value
    return 'planner'
  } catch {
    return 'planner'
  }
}

const CAPABILITY_FALLBACK = [
  { id: 'schedule', title: '日程提醒', short: '日程', blurb: '待办、日历与订阅提醒。', accent: '#12b7f5', action: 'open-planner', railLabel: '日程提醒', rail: true, order: 10 },
  { id: 'memory', title: '个人记忆', short: '记忆', blurb: '偏好、习惯与重要事实。', accent: '#7c5cfc', action: 'open-memory', railLabel: '个人记忆', rail: true, order: 20 },
  { id: 'search', title: '信息检索', short: '检索', blurb: '在记忆、待办与笔记里查找。', accent: '#0ea5a4', action: 'prompt', prompt: '请用 info_search 帮我检索：', placeholder: '想查什么？', railLabel: '信息检索', rail: true, order: 30 },
  { id: 'summary', title: '内容摘要', short: '摘要', blurb: '长文与纪要整理成要点。', accent: '#f59e0b', action: 'prompt', prompt: '请帮我做内容摘要：先提炼要点，再列出可执行的下一步。材料如下：\n\n', placeholder: '粘贴要摘要的内容…', railLabel: '内容摘要', rail: true, order: 40 },
  { id: 'tasks', title: '任务跟踪', short: '任务', blurb: '今日优先与阻塞点。', accent: '#ef4444', action: 'prompt', prompt: '请做一次任务跟踪：结合当前待办与记忆，输出今日优先事项、阻塞点和下一步。', placeholder: '可补充关注点…', railLabel: '任务跟踪', rail: true, order: 50 },
  { id: 'social', title: '社交辅助', short: '社交', blurb: '起草消息与会议跟进。', accent: '#ec4899', action: 'prompt', prompt: '请做社交辅助：结合我的沟通偏好，帮我起草一段得体、简洁的中文消息。场景：', placeholder: '例如：催材料、约会议…', railLabel: '社交辅助', rail: true, order: 60 },
  { id: 'translate', title: '中英互译', short: '翻译', blurb: '中英互译并保持语气。', accent: '#2563eb', action: 'prompt', prompt: '请帮我做翻译：自动判断中英方向并互译，保持原文语气与专业术语，必要时给一句备注。原文如下：\n\n', placeholder: '粘贴要翻译的内容…', railLabel: '中英互译', rail: true, order: 70 },
  { id: 'polish', title: '文字润色', short: '润色', blurb: '改写得更通顺得体。', accent: '#10b981', action: 'prompt', prompt: '请帮我润色下面这段文字：让它更通顺、专业、得体，保持原意，并简单说明主要改了什么。原文如下：\n\n', placeholder: '粘贴要润色的文字…', railLabel: '文字润色', rail: true, order: 80 },
  { id: 'brainstorm', title: '头脑风暴', short: '灵感', blurb: '多角度发散好点子。', accent: '#a855f7', action: 'prompt', prompt: '请围绕下面的主题做一次头脑风暴：从不同角度给出 6-8 个有新意且可落地的点子，并标注亮点。主题：', placeholder: '想发散的主题…', railLabel: '头脑风暴', rail: true, order: 90 },
  { id: 'email', title: '邮件起草', short: '邮件', blurb: '正式邮件一键成稿。', accent: '#f97316', action: 'prompt', prompt: '请帮我起草一封中文邮件：语气专业礼貌，包含合适的称呼、正文与结尾。收件对象与目的如下：', placeholder: '例如：向客户说明延期…', railLabel: '邮件起草', rail: true, order: 100 },
  { id: 'meeting', title: '会议纪要', short: '纪要', blurb: '要点、决议与待办。', accent: '#06b6d4', action: 'prompt', prompt: '请把下面的会议内容整理成纪要：分为讨论要点、达成的决议、后续待办（含负责人与时间，若有）。内容如下：\n\n', placeholder: '粘贴会议记录…', railLabel: '会议纪要', rail: true, order: 110 },
]

const state = {
  open: readOpenPref(),
  /** @type {'planner' | 'memory' | 'capabilities'} */
  panel: readPanelPref(),
  tab: readPanelPref() === 'memory' ? 'memory' : readPanelPref() === 'capabilities' ? 'capabilities' : 'calendar',
  month: startOfMonth(new Date()),
  selected: formatDate(new Date()),
  data: {
    todos: [],
    subscriptions: [],
    inbox: [],
    memories: [],
    hints: [
      { id: 'fb-today', title: '📅 今天该做什么？', prompt: '帮我看看今天有哪些待办和订阅，按紧急程度排一下，并给一句建议。', reason: '日程' },
      { id: 'fb-memory', title: '🧠 你还记得我什么？', prompt: '用几句话说说你目前记住的我的偏好和事实，漏了什么我再补。', reason: '画像' },
      { id: 'fb-defense', title: '🎤 帮我准备部门答辩', prompt: '我在准备部门答辩，请根据你记得的信息，先列一个简洁提纲和下一步。', reason: '答辩' },
      { id: 'fb-remind', title: '🔔 本周安排一个提醒', prompt: '帮我看看本周有没有适合设提醒的事项，给出订阅或待办建议。', reason: '订阅' },
    ],
    capabilities: CAPABILITY_FALLBACK,
  },
  draft: '',
  memoryQuery: '',
}

/**
 * SkillHub store UI state. Declared near the top so it is initialized before
 * the module-level mount() call renders the capability panel (avoids TDZ).
 * @type {{ q: string; items: any[]; warning: string; busy: string; force: boolean }}
 */
const skillStore = { q: '', items: [], warning: '', busy: '', force: false }

/** Built once while the column is expanded so the chat input is not remounted. */
let wideShell = null
/** @type {'planner' | 'memory' | 'capabilities' | null} */
let widePanel = null
/** Last panel painted into wideShell.body — force repaint on change. */
let lastBodyPanel = null
let lastPayload = ''

const root = document.createElement('aside')
root.className = 'qq-planner'
document.addEventListener('DOMContentLoaded', mount)
// Defer to a microtask so the entire module (all const/let below) is fully
// initialized before the first render, avoiding temporal-dead-zone errors.
if (document.readyState !== 'loading') queueMicrotask(mount)

function mount() {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
    return
  }
  if (!document.body.contains(root) && !document.querySelector('aside.qq-planner')) {
    document.body.appendChild(root)
    try {
      render()
    } catch (error) {
      console.warn('[planner] render failed', error)
    }
    void refresh()
    if (readPanelPref() === 'capabilities') {
      void refreshSkillsMeta()
      void refreshCapabilities(true)
    }
    setInterval(() => { void refresh() }, 5000)
    mountComposerHook()
  }
  mountHints()
  mountCapabilityDock()
  mountLlmSetup()
}

async function refresh() {
  const res = await fetch('/planner-api')
  if (!res.ok) return
  const data = await res.json()
  const prevSkills = state.data?.skills
  data.capabilities = pickCapabilities(data.capabilities, state.data?.capabilities)
  if (prevSkills && !data.skills) data.skills = prevSkills
  const payload = JSON.stringify(data)
  if (payload === lastPayload && wideShell !== null && state.open) return
  lastPayload = payload
  state.data = data
  render()
}

/** Never treat an empty API array as valid — keep builtins visible. */
function pickCapabilities(incoming, previous) {
  if (Array.isArray(incoming) && incoming.length > 0) return incoming
  if (Array.isArray(previous) && previous.length > 0) return previous
  return CAPABILITY_FALLBACK.slice()
}

async function refreshCapabilities(force = false) {
  try {
    const res = await fetch('/planner-api/capabilities')
    if (!res.ok) return
    const data = await res.json()
    const items = pickCapabilities(data.items, state.data?.capabilities)
    const same = JSON.stringify(state.data.capabilities) === JSON.stringify(items)
    state.data.capabilities = items
    if (!same || force) {
      lastDockPaint = ''
      paintCapabilityDock()
      if (state.panel === 'capabilities') rerenderCapabilitiesBody()
    }
  } catch (error) {
    console.warn('[capability] refresh failed', error)
  }
}

function render() {
  root.toggleAttribute('data-collapsed', !state.open)
  root.dataset.panel = state.panel
  if (!state.open) {
    wideShell = null
    widePanel = null
    lastBodyPanel = null
    root.replaceChildren(renderRail())
    try { paintHints() } catch (error) { console.warn('[planner] hints', error) }
    try { paintCapabilityDock() } catch (error) { console.warn('[planner] dock', error) }
    return
  }
  const shellRecreated = wideShell === null || !root.contains(wideShell.wrap) || widePanel !== state.panel
  if (shellRecreated) {
    wideShell = createWide()
    widePanel = state.panel
    lastBodyPanel = null
    root.replaceChildren(wideShell.wrap)
  }
  paintTabs()
  paintWideBody(shellRecreated || lastBodyPanel !== state.panel)
  try { paintHints() } catch (error) { console.warn('[planner] hints', error) }
  try { paintCapabilityDock() } catch (error) { console.warn('[planner] dock', error) }
}

function paintWideBody(force = false) {
  if (!wideShell?.body) return
  const active = document.activeElement
  const bodyEmpty = wideShell.body.childElementCount === 0
  const typingInBody = isTypingField(active)
    && wideShell.body.contains(active)
    && active.getAttribute('placeholder') !== '搜索记忆…'
  if (!force && !bodyEmpty && typingInBody) return
  try {
    wideShell.inbox.replaceChildren(state.panel === 'planner' ? renderInbox() : el('div'))
    wideShell.body.replaceChildren(buildBodyRoot())
    lastBodyPanel = state.panel
  } catch (error) {
    console.error('[planner] body paint failed', error)
    const detail = error instanceof Error ? `${error.message}` : String(error)
    wideShell.body.replaceChildren(el('div', {
      className: 'qq-cap-empty',
      text: `面板加载失败：${detail}`,
    }))
    lastBodyPanel = state.panel
  }
}

function renderRail() {
  const wrap = el('div', { className: 'qq-planner-rail' })
  const unread = (state.data.inbox ?? []).length
  const memories = (state.data.memories ?? []).length
  wrap.append(
    capabilityRailButton(),
    memoryRailButton(),
    memories > 0 ? el('span', { className: 'qq-planner-badge qq-planner-badge-mem', text: String(memories) }) : '',
    openRailButton(),
    unread > 0 ? el('span', { className: 'qq-planner-badge', text: String(unread) }) : '',
    setupRailButton(),
  )
  return wrap
}

function capabilityRailButton() {
  const btn = el('button', {
    className: 'qq-planner-icon qq-planner-open qq-planner-open-cap',
    type: 'button',
    'aria-label': '能力中心',
  })
  btn.innerHTML = `${sparkSvg()}<span class="qq-planner-open-label">能力中心</span>`
  btn.addEventListener('click', () => openPanel('capabilities'))
  return btn
}

function memoryRailButton() {
  const btn = el('button', {
    className: 'qq-planner-icon qq-planner-open qq-planner-open-mem',
    type: 'button',
    'aria-label': '记忆管理',
  })
  btn.innerHTML = `${memorySvg()}<span class="qq-planner-open-label">记忆管理</span>`
  btn.addEventListener('click', () => openPanel('memory'))
  return btn
}

function openRailButton() {
  const btn = el('button', {
    className: 'qq-planner-icon qq-planner-open',
    type: 'button',
    'aria-label': '待办订阅管理',
  })
  btn.innerHTML = `${calendarSvg()}<span class="qq-planner-open-label">待办订阅管理</span>`
  btn.addEventListener('click', () => openPanel('planner'))
  return btn
}

function setupRailButton() {
  const btn = el('button', {
    className: 'qq-planner-icon qq-planner-open qq-planner-open-setup',
    type: 'button',
    'aria-label': '配置模型',
  })
  btn.innerHTML = `${gearSvg()}<span class="qq-planner-open-label">配置模型</span>`
  btn.addEventListener('click', () => { void openLlmSetup(true) })
  return btn
}

const SETUP_SKIP_KEY = 'qq-setup-skip'
/** @type {HTMLElement | null} */
let setupDialog = null
/** @type {any} */
let setupState = null

function mountLlmSetup() {
  void openLlmSetup(false)
}

async function openLlmSetup(force) {
  try {
    const res = await fetch('/planner-api/setup')
    if (!res.ok) return
    setupState = await res.json()
  } catch (error) {
    console.warn('[setup] load failed', error)
    if (!force) return
    setupState = { presets: [], current: { configured: false }, keys: {} }
  }
  const skip = !force && localStorage.getItem(SETUP_SKIP_KEY) === '1'
  if (skip && setupState?.current?.configured) return
  paintLlmSetup()
}

function paintLlmSetup() {
  document.querySelector('.qq-setup-mask')?.remove()
  const current = setupState?.current ?? {}
  const presets = setupState?.presets ?? []
  const mask = el('div', { className: 'qq-setup-mask', role: 'dialog', 'aria-label': '配置模型' })
  const box = el('div', { className: 'qq-setup-dialog' })
  box.append(
    el('div', { className: 'qq-setup-title', text: '配置模型接口' }),
    el('div', { className: 'qq-setup-hint', text: '支持 DeepSeek、OpenAI、Claude，以及任意 OpenAI 兼容网关。密钥只保存在本机。' }),
  )
  const form = el('div', { className: 'qq-setup-form' })
  const preset = el('select', { className: 'qq-setup-input' })
  for (const item of presets) {
    const option = el('option', { value: item.id, text: item.label })
    if (item.id === current.preset) option.selected = true
    preset.append(option)
  }
  const provider = el('input', { className: 'qq-setup-input', placeholder: '提供方 ID，如 openai-compat' })
  provider.value = current.preset === 'custom' ? (current.provider || '') : ''
  const key = el('input', { className: 'qq-setup-input', type: 'password', placeholder: current.configured ? '已配置，留空则保持原密钥' : 'API 密钥', autocomplete: 'off' })
  const baseURL = el('input', { className: 'qq-setup-input', placeholder: 'API 地址（可选）' })
  baseURL.value = current.baseURL || ''
  const model = el('input', { className: 'qq-setup-input', placeholder: '模型 ID', list: 'qq-setup-models' })
  model.value = current.model || ''
  const models = el('datalist', { id: 'qq-setup-models' })
  const note = el('div', { className: 'qq-setup-note' })
  const error = el('div', { className: 'qq-setup-error' })

  function selectedPreset() {
    return presets.find(item => item.id === preset.value) ?? presets[0]
  }
  function syncFields() {
    const item = selectedPreset()
    if (!item) return
    note.textContent = item.hint
    baseURL.placeholder = item.baseUrlPlaceholder || 'API 地址'
    const custom = item.id === 'custom'
    provider.hidden = !custom
    if (provider.parentElement) provider.parentElement.hidden = !custom
    if (!custom) provider.value = item.provider
    models.replaceChildren()
    for (const id of item.models ?? []) models.append(el('option', { value: id }))
    if (!model.value && item.defaultModel) model.value = item.defaultModel
  }
  preset.addEventListener('change', () => {
    const item = selectedPreset()
    model.value = item?.defaultModel || ''
    if (item?.id !== 'custom') baseURL.value = ''
    syncFields()
  })

  form.append(
    labeled('提供方', preset),
    labeled('提供方 ID', provider),
    labeled('API 密钥', key),
    labeled('API 地址', baseURL),
    labeled('模型 ID', model),
    models,
    note,
    error,
  )
  syncFields()
  const skipLabel = el('label', { className: 'qq-setup-skip' })
  const skipBox = el('input', { type: 'checkbox' })
  skipBox.checked = localStorage.getItem(SETUP_SKIP_KEY) === '1'
  skipLabel.append(skipBox, document.createTextNode(' 下次打开不再弹出（可随时点侧栏「配置模型」）'))
  const actions = el('div', { className: 'qq-setup-actions' })
  const later = el('button', { type: 'button', className: 'qq-planner-ghost', text: current.configured ? '使用当前配置' : '稍后配置' })
  const save = el('button', { type: 'button', className: 'qq-planner-primary', text: '保存并开始' })
  later.addEventListener('click', () => {
    if (skipBox.checked || current.configured) {
      try { localStorage.setItem(SETUP_SKIP_KEY, skipBox.checked ? '1' : '0') } catch { /* ignore */ }
    }
    mask.remove()
    setupDialog = null
  })
  save.addEventListener('click', () => {
    save.disabled = true
    save.textContent = '保存中…'
    error.textContent = ''
    void fetch('/planner-api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        preset: preset.value,
        provider: provider.value,
        apiKey: key.value,
        baseURL: baseURL.value,
        model: model.value,
      }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '保存失败')
      try { localStorage.setItem(SETUP_SKIP_KEY, '1') } catch { /* ignore */ }
      setupState = data
      mask.remove()
      setupDialog = null
    }).catch((err) => {
      error.textContent = err instanceof Error ? err.message : '保存失败'
    }).finally(() => {
      save.disabled = false
      save.textContent = '保存并开始'
    })
  })
  actions.append(later, save)
  box.append(form, skipLabel, actions)
  mask.append(box)
  document.body.appendChild(mask)
  setupDialog = mask
  key.focus()
}

function labeled(label, control) {
  const wrap = el('label', { className: 'qq-setup-field' })
  wrap.append(el('span', { text: label }), control)
  return wrap
}

function gearSvg() {
  return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6.4 1.8h3.2l.4 1.5a4.8 4.8 0 0 1 1.3.8l1.5-.5 1.6 2.8-1.2 1a4.8 4.8 0 0 1 0 1.6l1.2 1-1.6 2.8-1.5-.5a4.8 4.8 0 0 1-1.3.8l-.4 1.5H6.4l-.4-1.5a4.8 4.8 0 0 1-1.3-.8l-1.5.5L1.6 9.9l1.2-1a4.8 4.8 0 0 1 0-1.6l-1.2-1 1.6-2.8 1.5.5a4.8 4.8 0 0 1 1.3-.8l.4-1.5Z" stroke="currentColor"/><circle cx="8" cy="8" r="1.8" stroke="currentColor"/></svg>'
}


function createWide() {
  const wrap = el('div', { className: 'qq-planner-wide' })
  wrap.dataset.panel = state.panel
  wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0'
  const header = renderHeader()
  const tabs = el('div', { className: 'qq-planner-tabs' })
  if (state.panel !== 'planner') tabs.hidden = true
  const inbox = el('div')
  const body = el('div', { className: 'qq-planner-body' })
  wrap.append(header, tabs, inbox, body, renderChat())
  return { wrap, header, tabs, inbox, body }
}

function paintTabs() {
  if (wideShell === null) return
  const title = wideShell.header.querySelector('.qq-planner-title')
  if (title) title.textContent = panelTitle(state.panel)
  const chatInput = wideShell.wrap.querySelector('.qq-planner-chat input')
  if (chatInput instanceof HTMLInputElement) {
    chatInput.placeholder = state.panel === 'memory'
      ? '新开会话管理记忆…'
      : state.panel === 'capabilities'
        ? '直接点能力卡片，或在此输入…'
        : '新开会话管理待办/订阅…'
  }
  wideShell.tabs.replaceChildren()
  if (state.panel !== 'planner') {
    wideShell.tabs.hidden = true
    return
  }
  wideShell.tabs.hidden = false
  for (const [id, label] of [['calendar', '日历'], ['list', '列表'], ['subs', '订阅']]) {
    const btn = el('button', { className: 'qq-planner-tab', type: 'button', text: label })
    if (state.tab === id) btn.dataset.active = ''
    btn.addEventListener('click', () => { state.tab = id; render() })
    wideShell.tabs.append(btn)
  }
}

function panelTitle(panel) {
  return {
    memory: '记忆与偏好',
    capabilities: '能力中心',
    planner: '待办与订阅',
  }[panel] ?? '待办与订阅'
}

function renderHeader() {
  const header = el('div', { className: 'qq-planner-header' })
  header.append(
    el('div', { className: 'qq-planner-title', text: panelTitle(state.panel) }),
    iconButton('收起', chevronSvg(), () => setOpen(false)),
  )
  return header
}

function renderInbox() {
  const wrap = el('div')
  const hints = (state.data.hints ?? []).slice(0, 4)
  if (hints.length > 0) {
    const strip = el('div', { className: 'qq-planner-hint-strip' })
    strip.append(el('div', { className: 'qq-planner-hint-strip-title', text: '你可以这样开始' }))
    const row = el('div', { className: 'qq-planner-hint-strip-row' })
    for (const item of hints) {
      const btn = el('button', { type: 'button', className: 'qq-planner-hint-chip', text: item.title })
      btn.title = item.prompt
      btn.addEventListener('click', () => { void useHint(item) })
      row.append(btn)
    }
    strip.append(row)
    wrap.append(strip)
  }
  const items = state.data.inbox ?? []
  if (items.length === 0) return wrap
  const box = el('div', { className: 'qq-planner-inbox' })
  box.style.margin = '8px 12px 0'
  const first = items[0]
  box.append(el('div', { text: `到期：${first.title}` }))
  const run = el('button', { type: 'button', text: '交给助理处理' })
  run.addEventListener('click', () => {
    void sendToComposer(`订阅「${first.title}」已到期，请立即执行：${first.prompt}`)
    void api('POST', `/planner-api/inbox/read/${first.id}`)
  })
  box.append(run)
  wrap.append(box)
  return wrap
}

function buildBodyRoot() {
  if (state.panel === 'memory') return renderMemoryPanel()
  if (state.panel === 'capabilities') return renderCapabilitiesPanel()
  const body = el('div')
  if (state.tab === 'calendar') body.append(renderCalendar(), renderDayList())
  else if (state.tab === 'list') body.append(renderTodoForm(), renderGroupedTodos())
  else if (state.tab === 'subs') body.append(renderSubForm(), renderSubscriptions())
  else body.append(renderCalendar(), renderDayList())
  return body
}

function renderCapabilitiesPanel() {
  const wrap = el('div', { className: 'qq-cap-panel' })
  const builtins = capabilityList().filter(item => item.kind !== 'skill')
  const skills = capabilityList().filter(item => item.kind === 'skill')
  wrap.append(el('div', {
    className: 'qq-cap-panel-intro',
    text: '点卡片可打开面板或直接填入输入框。已安装 Skill 与 SkillHub 在上方，预置能力在下方。',
  }))
  if (skills.length) {
    wrap.append(el('div', { className: 'qq-cap-section-title', text: '已安装 Skill' }))
    const grid = el('div', { className: 'qq-cap-grid' })
    for (const item of skills) grid.append(capabilityCard(item))
    wrap.append(grid)
  }
  const store = renderSkillHubStore()
  if (!skills.length) store.classList.add('qq-skill-store-lead')
  wrap.append(store)
  if (builtins.length) {
    wrap.append(el('div', { className: 'qq-cap-section-title', text: '预置能力' }))
    const grid = el('div', { className: 'qq-cap-grid' })
    for (const item of builtins) grid.append(capabilityCard(item))
    wrap.append(grid)
  }
  return wrap
}

function renderSkillHubStore() {
  const section = el('div', { className: 'qq-skill-store' })
  section.append(
    el('div', { className: 'qq-skill-store-head', text: 'SkillHub 商店' }),
    el('div', {
      className: 'qq-skill-store-note',
      text: '搜索并安装技能到 DSH skills 目录，安装后会出现在上方「已安装 Skill」。',
    }),
  )
  const form = el('div', { className: 'qq-skill-store-form' })
  const input = el('input', {
    type: 'search',
    className: 'qq-skill-store-input',
    placeholder: '搜索技能或输入 slug（如 pdf、translate）',
    value: skillStore.q,
  })
  input.addEventListener('input', () => { skillStore.q = input.value })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void searchSkillHub(input)
  })
  const searchBtn = el('button', { type: 'button', className: 'qq-skill-store-btn', text: skillStore.busy === 'search' ? '搜索中…' : '搜索' })
  searchBtn.addEventListener('click', () => { void searchSkillHub(input) })
  const installBtn = el('button', { type: 'button', className: 'qq-skill-store-btn qq-skill-store-btn-accent', text: skillStore.busy === 'install' ? '安装中…' : '按 slug 安装' })
  installBtn.addEventListener('click', () => { void installSkillSlug(input.value.trim(), installBtn) })
  const forceLabel = el('label', { className: 'qq-skill-store-force' })
  const forceBox = el('input', { type: 'checkbox' })
  forceBox.checked = skillStore.force
  forceBox.addEventListener('change', () => { skillStore.force = forceBox.checked })
  forceLabel.append(forceBox, document.createTextNode(' 覆盖已安装'))
  form.append(input, searchBtn, installBtn, forceLabel)
  section.append(form)
  if (skillStore.warning) {
    section.append(el('div', { className: 'qq-skill-store-warn', text: skillStore.warning }))
  }
  if (skillStore.items.length) {
    section.append(el('div', {
      className: 'qq-skill-store-count',
      text: `找到 ${skillStore.items.length} 个技能`,
    }))
    const installedSlugs = new Set((state.data.skills?.slugs ?? []).map(String))
    const list = el('div', { className: 'qq-skill-store-list' })
    for (const hit of skillStore.items) {
      list.append(skillStoreRow(hit, installedSlugs))
    }
    section.append(list)
  }
  const installed = (state.data.skills?.installed ?? []).filter(Boolean)
  if (installed.length) {
    const tags = el('div', { className: 'qq-skill-store-tags' })
    tags.append(el('span', { className: 'qq-skill-store-tags-label', text: '已安装：' }))
    for (const skill of installed) {
      tags.append(el('span', { className: 'qq-skill-store-tag', text: skill.name || skill }))
    }
    section.append(tags)
  }
  return section
}

function skillStoreRow(hit, installedSlugs) {
  const row = el('div', { className: 'qq-skill-store-row' })
  const head = el('div', { className: 'qq-skill-store-row-head' })
  head.append(el('span', { className: 'qq-skill-store-name', text: hit.title || hit.slug }))
  if (hit.version) head.append(el('span', { className: 'qq-skill-store-ver', text: `v${hit.version}` }))
  const shortSlug = shortSkillName(hit.slug)
  const isInstalled = installedSlugs.has(hit.slug) || installedSlugs.has(shortSlug)
  const btn = el('button', {
    type: 'button',
    className: 'qq-skill-store-btn' + (isInstalled ? '' : ' qq-skill-store-btn-accent'),
    text: isInstalled ? '重装' : '安装',
  })
  btn.addEventListener('click', () => { void installSkillSlug(hit.slug, btn) })
  head.append(btn)
  row.append(head)
  row.append(el('div', { className: 'qq-skill-store-slug', text: hit.slug }))
  const desc = String(hit.description || '').trim()
  if (desc && desc !== (hit.title || '')) {
    row.append(el('div', { className: 'qq-skill-store-desc', text: desc, title: desc }))
  }
  return row
}

function shortSkillName(slug) {
  const s = String(slug || '')
  const scoped = s.match(/^@[^/]+\/(.+)$/)
  return scoped ? scoped[1] : s
}

async function searchSkillHub(input) {
  const q = String(input?.value ?? skillStore.q ?? '').trim()
  if (!q) return
  skillStore.q = q
  skillStore.busy = 'search'
  skillStore.warning = ''
  rerenderCapabilitiesBody()
  try {
    const res = await fetch('/planner-api/skills/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q }),
    })
    const data = await res.json()
    skillStore.items = Array.isArray(data.items) ? data.items : []
    skillStore.warning = data.warning ?? (skillStore.items.length ? '' : '无搜索结果，可尝试直接输入 slug 安装。')
  } catch (error) {
    skillStore.warning = error instanceof Error ? error.message : '搜索失败'
    skillStore.items = []
  } finally {
    skillStore.busy = ''
    rerenderCapabilitiesBody()
  }
}

async function installSkillSlug(slug, btn) {
  const cleaned = String(slug ?? '').trim()
  if (!cleaned) return
  skillStore.busy = 'install'
  if (btn instanceof HTMLElement) btn.textContent = '安装中…'
  rerenderCapabilitiesBody()
  try {
    const res = await fetch('/planner-api/skills/install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: cleaned, force: skillStore.force }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || data.error || '安装失败')
    if (Array.isArray(data.capabilities) && data.capabilities.length > 0) {
      state.data.capabilities = data.capabilities
    } else {
      state.data.capabilities = pickCapabilities(state.data.capabilities, CAPABILITY_FALLBACK)
    }
    await refreshSkillsMeta()
    skillStore.warning = data.message || `已安装 ${cleaned}`
    lastDockPaint = ''
    paintCapabilityDock()
  } catch (error) {
    skillStore.warning = error instanceof Error ? error.message : '安装失败'
  } finally {
    skillStore.busy = ''
    if (btn instanceof HTMLElement) btn.textContent = '安装'
    rerenderCapabilitiesBody()
  }
}

async function refreshSkillsMeta() {
  try {
    const res = await fetch('/planner-api/skills')
    if (!res.ok) return
    state.data.skills = await res.json()
  } catch {
    // ignore
  }
}

function rerenderCapabilitiesBody() {
  if (state.panel !== 'capabilities' || !wideShell?.body) return
  try {
    wideShell.body.replaceChildren(renderCapabilitiesPanel())
    lastBodyPanel = 'capabilities'
  } catch (error) {
    console.warn('[capability] rerender failed', error)
  }
}

function capabilityList() {
  return pickCapabilities(state.data?.capabilities, CAPABILITY_FALLBACK)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** Items shown in the composer dock — builtins always, skills only when rail=true. */
function dockCapabilityList() {
  return capabilityList().filter((item) => {
    if (item.kind === 'skill') return item.rail === true
    return item.rail !== false
  }).slice(0, 12)
}

function capabilityCard(item) {
  const card = el('button', { type: 'button', className: 'qq-cap-card' })
  if (item.kind === 'skill') card.dataset.skill = item.skillName || ''
  card.style.setProperty('--qq-cap-accent', item.accent || '#12b7f5')
  const blurbText = String(item.blurb || '').trim()
  let blurbNode
  if (blurbText.length > 48) {
    const block = el('div', { className: 'qq-cap-card-blurb-block' })
    const blurb = el('div', {
      className: 'qq-cap-card-blurb qq-cap-card-blurb-clamp',
      text: blurbText,
      title: blurbText,
    })
    const toggle = el('span', { className: 'qq-cap-card-blurb-toggle', text: '展开' })
    const onToggle = (event) => {
      event.preventDefault()
      event.stopPropagation()
      const expanded = blurb.classList.toggle('is-expanded')
      toggle.textContent = expanded ? '收起' : '展开'
    }
    blurb.addEventListener('click', onToggle)
    toggle.addEventListener('click', onToggle)
    block.append(blurb, toggle)
    blurbNode = block
  } else {
    blurbNode = el('div', {
      className: 'qq-cap-card-blurb',
      text: blurbText,
      title: blurbText,
    })
  }
  card.append(
    el('div', { className: 'qq-cap-card-title', text: item.title }),
    blurbNode,
    el('div', { className: 'qq-cap-card-cta', text: actionLabel(item) }),
  )
  card.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void runCapability(item, card)
  })
  return card
}

function actionLabel(item) {
  if (item.action === 'open-planner') return '打开日程 →'
  if (item.action === 'open-memory') return '打开记忆 →'
  if (item.action === 'invoke-skill') return '调用技能 →'
  return '填入输入框 →'
}

async function runCapability(item, card) {
  if (item.action === 'open-planner') {
    openPanel('planner')
    return
  }
  if (item.action === 'open-memory') {
    openPanel('memory')
    return
  }
  const prompt = String(item.prompt ?? '').trim()
  if (!prompt && item.action !== 'invoke-skill') return
  const draft = prompt || (item.skillName ? `请按 ${item.skillName} 技能处理：` : '')
  if (!draft) return
  if (card instanceof HTMLElement) {
    card.dataset.busy = ''
    const cta = card.querySelector('.qq-cap-card-cta')
    if (cta) cta.textContent = '正在填入…'
  }
  fillPlannerDraft(draft)
  try {
    const textarea = await ensureComposerForFill()
    if (textarea instanceof HTMLTextAreaElement) {
      await fillComposerDraft(textarea, draft)
      if (item.placeholder) textarea.placeholder = item.placeholder
      textarea.focus()
    }
    flashCapabilityDock(item.id)
  } catch (error) {
    console.warn('[capability] fill composer failed', error)
  } finally {
    if (card instanceof HTMLElement) {
      card.removeAttribute('data-busy')
      const cta = card.querySelector('.qq-cap-card-cta')
      if (cta) cta.textContent = actionLabel(item)
    }
  }
}

function fillPlannerDraft(text) {
  state.draft = text
  const input = wideShell?.wrap.querySelector('.qq-planner-chat input')
  if (input instanceof HTMLInputElement) {
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.focus()
    try { input.setSelectionRange(text.length, text.length) } catch { /* ignore */ }
  }
}

function findChatHomeButton() {
  return [...document.querySelectorAll('button')].find((btn) => {
    const text = (btn.textContent ?? '').replace(/\s+/g, '')
    return text.includes('纯聊天') && (btn.closest('[data-composer-seat]') || btn.closest('[data-phase="hero"]') || btn.closest('[data-hero-hints]')?.previousElementSibling)
  }) ?? [...document.querySelectorAll('button')].find((btn) => (btn.textContent ?? '').replace(/\s+/g, '').includes('纯聊天'))
}

function findLiveComposer() {
  for (const node of document.querySelectorAll('textarea[data-phase]')) {
    if (!(node instanceof HTMLTextAreaElement)) continue
    if (node.closest('.qq-planner')) continue
    if (node.disabled || node.readOnly) continue
    return node
  }
  return null
}

async function ensureComposerForFill() {
  const existing = findLiveComposer()
  if (existing) return existing
  const chatBtn = findChatHomeButton()
  if (chatBtn instanceof HTMLButtonElement) {
    chatBtn.click()
    const ready = await waitForReadyComposer(2500)
    if (ready) return ready
  }
  try {
    const sessionId = await createPlannerSession('新会话')
    if (sessionId) {
      await disablePlannerThinking(sessionId)
      await openSessionInUi('新会话')
    }
  } catch (error) {
    console.warn('[capability] open session failed', error)
  }
  return waitForReadyComposer(2500)
}

function renderMemoryPanel() {
  const wrap = el('div')
  wrap.append(renderMemoryForm(), renderMemoryToolbar(), renderMemoryList())
  return wrap
}

function renderMemoryForm() {
  const form = el('form', { className: 'qq-planner-form' })
  const content = el('textarea', { placeholder: '一条偏好或事实，例如：喜欢美式、不吃香菜' })
  const row = el('div', { className: 'qq-planner-form-row qq-planner-form-row-3' })
  const kind = el('select')
  for (const [value, label] of [['preference', '偏好'], ['fact', '事实'], ['note', '备注']]) {
    kind.append(el('option', { value, text: label }))
  }
  const category = el('input', { placeholder: '分类（饮食/工作…）' })
  const submit = el('button', { className: 'qq-planner-primary', type: 'submit', text: '添加记忆' })
  row.append(kind, category)
  form.append(content, row, submit)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!content.value.trim()) return
    void api('POST', '/planner-api/memories', {
      content: content.value.trim(),
      kind: kind.value,
      category: category.value.trim(),
    }).then(() => { content.value = ''; void refresh() })
  })
  return form
}

function renderMemoryToolbar() {
  const row = el('div', { className: 'qq-planner-form-row' })
  const search = el('input', { placeholder: '搜索记忆…', value: state.memoryQuery })
  search.addEventListener('input', () => {
    state.memoryQuery = search.value
    const pos = search.selectionStart
    render()
    const next = wideShell?.body.querySelector('input[placeholder="搜索记忆…"]')
    if (next instanceof HTMLInputElement) {
      next.focus()
      if (typeof pos === 'number') next.setSelectionRange(pos, pos)
    }
  })
  const scan = el('button', { className: 'qq-planner-ghost', type: 'button', text: '扫描昨日' })
  scan.addEventListener('click', () => {
    scan.disabled = true
    scan.textContent = '扫描中…'
    void api('POST', '/planner-api/memory/scan').then(refresh).finally(() => {
      scan.disabled = false
      scan.textContent = '扫描昨日'
    })
  })
  row.append(search, scan)
  return row
}

function renderMemoryList() {
  const wrap = el('div')
  const q = state.memoryQuery.trim()
  const items = (state.data.memories ?? []).filter((item) => {
    if (!q) return true
    return `${item.content} ${item.category} ${item.kind}`.includes(q)
  })
  if (items.length === 0) {
    wrap.append(el('div', {
      className: 'qq-planner-empty',
      text: q ? '没有匹配的记忆' : '还没有记忆。对话里说「记住我喜欢…」就会弹出确认框。',
    }))
    return wrap
  }
  for (const item of items) wrap.append(memoryRow(item))
  return wrap
}

function memoryRow(item) {
  const row = el('div', { className: 'qq-planner-item qq-memory-item' })
  const main = el('div', { className: 'qq-planner-item-main' })
  const content = el('input', { className: 'qq-memory-content', value: item.content })
  content.addEventListener('change', () => {
    if (!content.value.trim()) return
    void api('PATCH', `/planner-api/memories/${item.id}`, { content: content.value.trim() }).then(refresh)
  })
  const meta = el('div', { className: 'qq-planner-meta' })
  meta.append(
    kindBadge(item.kind),
    el('span', { text: ` · ${sourceLabel(item.source)}${item.category ? ` · ${item.category}` : ''}` }),
  )
  main.append(content, meta)
  const del = el('button', { className: 'qq-planner-ghost', type: 'button', text: '删除' })
  del.addEventListener('click', () => { void api('DELETE', `/planner-api/memories/${item.id}`).then(refresh) })
  row.append(main, del)
  return row
}

function kindBadge(kind) {
  const label = { preference: '偏好', fact: '事实', note: '备注' }[kind] ?? kind
  const node = el('span', { className: 'qq-planner-status', text: label })
  if (kind === 'fact') node.dataset.paused = ''
  return node
}

function sourceLabel(source) {
  return { active: '主动', scan: '流水', manual: '手动' }[source] ?? source
}

function openMemory() {
  openPanel('memory')
}

/** Open the planner, memory, or capabilities panel (separate shells). */
function openPanel(panel) {
  const next = panel === 'memory' || panel === 'capabilities' ? panel : 'planner'
  if (state.panel !== next) {
    state.panel = next
    try { localStorage.setItem(PANEL_KEY, next) } catch { /* ignore */ }
    if (next === 'memory') state.tab = 'memory'
    else if (next === 'capabilities') state.tab = 'capabilities'
    else if (state.tab === 'memory' || state.tab === 'capabilities') state.tab = 'calendar'
    wideShell = null
    widePanel = null
  }
  setOpen(true)
  if (next === 'capabilities') {
    paintWideBody(true)
    void refreshSkillsMeta()
    void refreshCapabilities(true)
  } else if (next === 'memory') {
    paintWideBody(true)
  }
}

function renderCalendar() {
  const wrap = el('div')
  const nav = el('div', { className: 'qq-planner-cal-nav' })
  const prev = el('button', { type: 'button', text: '‹' })
  const next = el('button', { type: 'button', text: '›' })
  prev.addEventListener('click', () => { state.month = addMonths(state.month, -1); render() })
  next.addEventListener('click', () => { state.month = addMonths(state.month, 1); render() })
  nav.append(prev, el('strong', { text: `${state.month.getFullYear()}年${state.month.getMonth() + 1}月` }), next)
  const week = el('div', { className: 'qq-planner-week' })
  for (const label of WEEK) week.append(el('span', { text: label }))
  const grid = el('div', { className: 'qq-planner-grid' })
  const counts = todoCounts()
  const today = formatDate(new Date())
  for (const cell of monthCells(state.month)) {
    const btn = el('button', { className: 'qq-planner-day', type: 'button', text: String(cell.date.getDate()) })
    const key = formatDate(cell.date)
    if (!cell.inMonth) btn.dataset.mute = ''
    if (key === today) btn.dataset.today = ''
    if (key === state.selected) btn.dataset.selected = ''
    const n = counts.get(key) ?? 0
    if (n > 0) {
      const dots = el('span', { className: 'qq-planner-dots' })
      for (let i = 0; i < Math.min(n, 3); i += 1) dots.append(el('i'))
      btn.append(dots)
    }
    btn.addEventListener('click', () => {
      state.selected = key
      state.tab = 'calendar'
      render()
    })
    grid.append(btn)
  }
  wrap.append(nav, week, grid)
  return wrap
}

function renderDayList() {
  const section = el('div', { className: 'qq-planner-section' })
  section.append(el('h3', { text: `${state.selected} 的待办` }))
  const items = (state.data.todos ?? []).filter(todo => todo.dueDate === state.selected)
  if (items.length === 0) section.append(el('div', { className: 'qq-planner-empty', text: '这一天还没有待办' }))
  else for (const todo of items) section.append(todoRow(todo))
  return section
}

function renderTodoForm() {
  const form = el('form', { className: 'qq-planner-form' })
  const title = el('input', { placeholder: '添加待办…' })
  const row = el('div', { className: 'qq-planner-form-row' })
  const date = el('input', { type: 'date', value: state.selected })
  const time = el('input', { type: 'time' })
  row.append(date, time)
  const submit = el('button', { className: 'qq-planner-primary', type: 'submit', text: '添加待办' })
  form.append(title, row, submit)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!title.value.trim()) return
    void api('POST', '/planner-api/todos', {
      title: title.value.trim(),
      dueDate: date.value || null,
      dueTime: time.value || null,
    }).then(refresh)
  })
  return form
}

function renderGroupedTodos() {
  const wrap = el('div')
  const groups = [
    ['已过期', overdueTodos()],
    ['今天', dayTodos(formatDate(new Date()))],
    ['即将到来', upcomingTodos()],
    ['无日期', (state.data.todos ?? []).filter(todo => todo.status !== 'completed' && !todo.dueDate)],
    ['已完成', (state.data.todos ?? []).filter(todo => todo.status === 'completed')],
  ]
  for (const [label, items] of groups) {
    if (items.length === 0) continue
    const section = el('div', { className: 'qq-planner-section' })
    section.append(el('h3', { text: `${label} · ${items.length}` }))
    for (const todo of items) section.append(todoRow(todo))
    wrap.append(section)
  }
  if (!wrap.children.length) wrap.append(el('div', { className: 'qq-planner-empty', text: '还没有待办，可以在下面跟助理说一声。' }))
  return wrap
}

function todoRow(todo) {
  const row = el('div', { className: 'qq-planner-item' })
  if (todo.status === 'completed') row.dataset.done = ''
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = todo.status === 'completed'
  box.addEventListener('change', () => {
    void api('PATCH', `/planner-api/todos/${todo.id}`, {
      status: box.checked ? 'completed' : 'pending',
    }).then(refresh)
  })
  const main = el('div', { className: 'qq-planner-item-main' })
  main.append(el('div', { className: 'qq-planner-item-title', text: todo.title }))
  const when = [todo.dueDate, todo.dueTime].filter(Boolean).join(' ')
  if (when || todo.notes) main.append(el('div', { className: 'qq-planner-meta', text: [when, todo.notes].filter(Boolean).join(' · ') }))
  const del = el('button', { className: 'qq-planner-ghost', type: 'button', text: '删除' })
  del.addEventListener('click', () => { void api('DELETE', `/planner-api/todos/${todo.id}`).then(refresh) })
  row.append(box, main, del)
  return row
}

function renderSubForm() {
  const form = el('form', { className: 'qq-planner-form' })
  const title = el('input', { placeholder: '订阅名称，如每日早报' })
  const prompt = el('textarea', { placeholder: '到期后让助理做什么' })
  const type = el('select')
  for (const [value, label] of [['daily', '每天'], ['weekly', '每周'], ['monthly', '每月'], ['once', '单次']]) {
    type.append(el('option', { value, text: label }))
  }
  const row = el('div', { className: 'qq-planner-form-row' })
  const weekday = el('select')
  for (const [value, label] of [['MO', '周一'], ['TU', '周二'], ['WE', '周三'], ['TH', '周四'], ['FR', '周五'], ['SA', '周六'], ['SU', '周日']]) {
    weekday.append(el('option', { value, text: label }))
  }
  const time = el('input', { type: 'time', value: '08:30' })
  row.append(weekday, time)
  const submit = el('button', { className: 'qq-planner-primary', type: 'submit', text: '创建订阅' })
  form.append(title, prompt, type, row, submit)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!title.value.trim() || !prompt.value.trim()) return
    const [hour, minute] = (time.value || '08:30').split(':').map(Number)
    const ruleType = type.value
    const rule = { type: ruleType, hour, minute, onlyWorkday: ruleType !== 'once' }
    if (ruleType === 'weekly') rule.dayOfWeek = weekday.value
    if (ruleType === 'monthly') rule.dayOfMonth = 1
    if (ruleType === 'once') {
      const soon = new Date(Date.now() + 3600_000)
      rule.executeAt = `${formatDate(soon)} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
    }
    void api('POST', '/planner-api/subscriptions', {
      title: title.value.trim(),
      description: title.value.trim(),
      prompt: prompt.value.trim(),
      rule,
    }).then(refresh)
  })
  return form
}

function renderSubscriptions() {
  const wrap = el('div')
  const items = state.data.subscriptions ?? []
  if (items.length === 0) {
    wrap.append(el('div', { className: 'qq-planner-empty', text: '还没有订阅。可以说「每天早上提醒我看待办」。' }))
    return wrap
  }
  for (const item of items) {
    const card = el('div', { className: 'qq-planner-sub' })
    const top = el('div', { className: 'qq-planner-sub-top' })
    const main = el('div', { className: 'qq-planner-sub-main' })
    main.append(el('div', { className: 'qq-planner-sub-title', text: item.title }))
    main.append(el('div', { className: 'qq-planner-meta', text: `${item.ruleLabel}${item.nextRunLabel ? ` · 下次 ${item.nextRunLabel}` : ''}` }))
    const status = el('span', { className: 'qq-planner-status', text: statusLabel(item.status) })
    if (item.status === 'paused') status.dataset.paused = ''
    top.append(main, status)
    const actions = el('div', { className: 'qq-planner-sub-actions' })
    if (item.status === 'running') {
      const pause = el('button', { className: 'qq-planner-ghost', type: 'button', text: '暂停' })
      pause.addEventListener('pointerdown', (event) => { event.stopPropagation() })
      pause.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        void api('POST', `/planner-api/subscriptions/${item.id}/pause`).then(refresh)
      })
      actions.append(pause)
    } else if (item.status === 'paused') {
      const resume = el('button', { className: 'qq-planner-ghost', type: 'button', text: '恢复' })
      resume.addEventListener('pointerdown', (event) => { event.stopPropagation() })
      resume.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        void api('POST', `/planner-api/subscriptions/${item.id}/resume`).then(refresh)
      })
      actions.append(resume)
    }
    const talk = el('button', { className: 'qq-planner-ghost', type: 'button', text: '对话' })
    talk.addEventListener('pointerdown', (event) => { event.stopPropagation() })
    talk.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void openSubscriptionChat(item).catch((error) => {
        console.warn('[planner] openSubscriptionChat failed', error)
      })
    })
    const del = el('button', { className: 'qq-planner-ghost', type: 'button', text: '删除' })
    del.addEventListener('pointerdown', (event) => { event.stopPropagation() })
    del.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void api('DELETE', `/planner-api/subscriptions/${item.id}`).then(refresh)
    })
    actions.append(talk, del)
    card.append(top, actions)
    wrap.append(card)
  }
  return wrap
}

function renderChat() {
  const bar = el('form', { className: 'qq-planner-chat' })
  const input = el('input', {
    placeholder: state.panel === 'memory'
      ? '新开会话管理记忆…'
      : '新开会话管理待办/订阅…',
    autocomplete: 'off',
  })
  input.value = state.draft
  input.addEventListener('input', () => { state.draft = input.value })
  const send = el('button', { type: 'submit', text: '↑' })
  bar.append(input, send)
  bar.addEventListener('submit', (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    state.draft = ''
    if (state.panel === 'memory') {
      if (isRememberIntent(text)) {
        void beginMemoryConfirm(text)
        return
      }
      void sendMemoryToComposer(text)
      return
    }
    if (isRecallIntent(text)) {
      openMemory()
      void sendMemoryToComposer(text)
      return
    }
    if (isRememberIntent(text)) {
      void beginMemoryConfirm(text)
      return
    }
    void sendToComposer(text)
  })
  return bar
}

function todoCounts() {
  const map = new Map()
  for (const todo of state.data.todos ?? []) {
    if (!todo.dueDate || todo.status === 'completed') continue
    map.set(todo.dueDate, (map.get(todo.dueDate) ?? 0) + 1)
  }
  return map
}

function dayTodos(day) {
  return (state.data.todos ?? []).filter(todo => todo.status !== 'completed' && todo.dueDate === day)
}

function overdueTodos() {
  const today = formatDate(new Date())
  return (state.data.todos ?? []).filter(todo => todo.status !== 'completed' && todo.dueDate && todo.dueDate < today)
}

function upcomingTodos() {
  const today = formatDate(new Date())
  return (state.data.todos ?? []).filter(todo => todo.status !== 'completed' && todo.dueDate && todo.dueDate > today)
}

function statusLabel(status) {
  return { running: '运行中', paused: '已暂停', completed: '已完成' }[status] ?? status
}

function setOpen(open) {
  state.open = open
  try { localStorage.setItem(KEY, open ? '1' : '0') } catch { /* ignore */ }
  if (open) {
    try { localStorage.setItem(PANEL_KEY, state.panel) } catch { /* ignore */ }
  }
  render()
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

async function sendToComposer(text) {
  await openPlannerSession({
    draft: [
      '【待办管理】只用 todo_manage / subscription_manage；需要数据时再 list。',
      '缺具体时刻最多追问一次；一句话确认，禁止展示内部 id。',
      '',
      text,
    ].join('\n'),
    send: true,
  })
}

async function sendMemoryToComposer(text) {
  await openPlannerSession({
    title: '记忆管理',
    draft: [
      '【记忆管理】只用 memory_manage；需要数据时再 list / search。',
      '缺信息最多追问一次；一句话确认，禁止展示内部 id。',
      '',
      text,
    ].join('\n'),
    send: true,
  })
}

/** Open a planner session for one subscription: show a chip, wait for the user. */
async function openSubscriptionChat(item) {
  await openPlannerSession({
    send: false,
    title: `待办·${item.title}`,
    chip: {
      kind: 'subscription',
      title: item.title,
      ruleLabel: item.ruleLabel || '（未知）',
      status: statusLabel(item.status),
      nextRunLabel: item.nextRunLabel || '',
      prompt: String(item.prompt ?? '').trim(),
    },
  })
}

/**
 * Create a dedicated planner session, turn thinking off, open it in the main pane.
 * @param {{ draft?: string, send?: boolean, title?: string, chip?: object }} options
 */
async function openPlannerSession({ draft = '', send = false, title = '待办管理', chip = null }) {
  document.querySelector('button[aria-label="打开侧边栏"]')?.click()

  let sessionId = null
  try {
    sessionId = await createPlannerSession(title)
  } catch (error) {
    console.warn('[planner] session.create failed', error)
  }
  if (!sessionId) {
    await ensureBlankChatSession()
    sessionId = await findLatestBlankChatSession()
  }
  if (sessionId) {
    await disablePlannerThinking(sessionId)
    try {
      await rpc('session.rename', { sessionId, title })
    } catch {
      // blank rename may fail until first prompt
    }
  }
  if (!(await openSessionInUi(title))) await openSessionInUi('新会话')
  const textarea = await waitForReadyComposer()
  if (!(textarea instanceof HTMLTextAreaElement)) return

  if (chip) {
    showContextChip(chip, textarea)
    await fillComposerDraft(textarea, '')
    textarea.placeholder = '接着说说你想怎么改…'
    return
  }

  if (send) {
    if (sessionId) {
      try {
        await rpc('session.prompt', {
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text: draft }],
          clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
        })
        try {
          await rpc('session.rename', { sessionId, title })
        } catch {
          // ignore
        }
        void openSessionInUi(title)
        return
      } catch (error) {
        console.warn('[planner] session.prompt failed, falling back to composer', error)
      }
    }
    await fillAndSend(textarea, draft)
    return
  }
  await fillComposerDraft(textarea, draft)
}

/** Always open a fresh「待办管理」session; tools fetch state when needed. */
async function startPlannerChat(userText) {
  await sendToComposer(userText)
}

async function disablePlannerThinking(sessionId) {
  try {
    const models = await rpc('session.models', { sessionId })
    const current = models.current
    if (!current?.provider || !current?.model) return
    if (current.reasoningEffort === 'off') return
    const efforts = (models.groups ?? [])
      .flatMap(group => group.models ?? [])
      .find(model => model.id === current.model)
      ?.reasoning?.efforts ?? []
    const hasOff = efforts.some(effort => effort.id === 'off')
    if (!hasOff && current.reasoningEffort === undefined) return
    await rpc('session.selectModel', {
      sessionId,
      provider: current.provider,
      model: current.model,
      ...(hasOff || efforts.length === 0 ? { reasoningEffort: 'off' } : {}),
    })
  } catch (error) {
    console.warn('[planner] disable thinking failed', error)
  }
}

async function findLatestBlankChatSession() {
  for (let i = 0; i < 10; i += 1) {
    try {
      const list = await rpc('session.list', {})
      const blanks = [...(list.items ?? [])]
        .filter(item => item.blank && (item.cwd ?? '').endsWith('/chat'))
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      if (blanks[0]?.sessionId) return blanks[0].sessionId
    } catch {
      // retry
    }
    await wait(50)
  }
  return null
}

async function createPlannerSession(title = '待办管理') {
  const workspaces = await rpc('workspace.list', {})
  const chat = (workspaces.items ?? []).find(item => item.title === '对话' || /\/chat\/?$/.test(item.path ?? ''))
  if (!chat) throw new Error('chat workspace not found')
  const created = await rpc('session.create', { workspaceId: chat.workspaceId })
  const sessionId = created.sessionId
  try {
    await rpc('session.rename', { sessionId, title })
  } catch {
    // Blank sessions may reject rename until the first prompt; retry later.
  }
  return sessionId
}

async function ensureBlankChatSession() {
  const createInChat = document.querySelector('button[aria-label="在“对话”中新建会话"]')
  if (createInChat instanceof HTMLButtonElement) {
    createInChat.click()
    await wait(180)
    return
  }
  document.querySelector('button[aria-label="新建会话"]')?.click()
  await wait(180)
}

async function openSessionInUi(title) {
  for (let i = 0; i < 12; i += 1) {
    const row = [...document.querySelectorAll('[role="treeitem"]')]
      .find(el => (el.textContent ?? '').includes(title))
    if (row) {
      row.click()
      return true
    }
    await wait(50)
  }
  return false
}

async function renameLatestPlannerSession() {
  try {
    const list = await rpc('session.list', {})
    const items = [...(list.items ?? [])]
      .filter(item => (item.cwd ?? '').endsWith('/chat'))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    const target = items[0]
    if (target?.sessionId) {
      await rpc('session.rename', { sessionId: target.sessionId, title: '待办管理' })
      await openSessionInUi('待办管理')
    }
  } catch (error) {
    console.warn('[planner] rename failed', error)
  }
}

async function waitForReadyComposer(timeoutMs = 4000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const textarea = findLiveComposer()
    if (textarea) return textarea
    await wait(50)
  }
  return null
}

async function fillAndSend(textarea, text) {
  await fillComposerDraft(textarea, text)
  await wait(60)
  const send = document.querySelector('button[aria-label="发送消息"]')
  if (send instanceof HTMLButtonElement && !send.disabled) send.click()
}

async function fillComposerDraft(textarea, text) {
  const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  const tracker = textarea._valueTracker
  if (tracker && typeof tracker.setValue === 'function') tracker.setValue('')
  desc?.set?.call(textarea, text)
  textarea.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertFromPaste',
    data: text,
  }))
  textarea.dispatchEvent(new Event('change', { bubbles: true }))
  textarea.focus()
  try {
    textarea.setSelectionRange(text.length, text.length)
  } catch {
    // ignore
  }
  await wait(30)
}

/** @type {{ root: HTMLElement, data: object, editing: boolean } | null} */
let contextChip = null

function removeContextChip() {
  if (contextChip?.root) contextChip.root.remove()
  contextChip = null
  window.removeEventListener('resize', placeContextChip)
  window.removeEventListener('scroll', placeContextChip, true)
}

function showContextChip(data, textarea) {
  removeContextChip()
  const root = el('div', { className: 'qq-ctx-chip', role: 'button', tabindex: '0' })
  root.title = '点击编辑上下文'
  contextChip = { root, data: { ...data }, editing: false, textarea }
  paintContextChip()
  root.addEventListener('click', (event) => {
    if (event.target.closest('.qq-ctx-chip-edit')) return
    if (event.target.closest('.qq-ctx-chip-close')) {
      event.stopPropagation()
      removeContextChip()
      return
    }
    if (!contextChip.editing) {
      contextChip.editing = true
      paintContextChip()
      placeContextChip()
    }
  })
  document.body.appendChild(root)
  placeContextChip()
  window.addEventListener('resize', placeContextChip)
  window.addEventListener('scroll', placeContextChip, true)
  ensureChipSendHook()
}

function placeContextChip() {
  if (!contextChip?.root) return
  const textarea = contextChip.textarea instanceof HTMLTextAreaElement
    ? contextChip.textarea
    : document.querySelector('textarea[data-phase]')
  if (!(textarea instanceof HTMLTextAreaElement)) return
  const rect = textarea.getBoundingClientRect()
  const plannerLeft = document.querySelector('.qq-planner')?.getBoundingClientRect().left
    ?? window.innerWidth
  const left = Math.max(16, rect.left)
  const maxWidth = Math.max(220, plannerLeft - left - 16)
  const width = Math.min(Math.max(rect.width, 280), maxWidth)
  contextChip.root.style.left = `${left}px`
  contextChip.root.style.width = `${width}px`
  // Place just above the composer; measure after width is set.
  const height = contextChip.root.offsetHeight || 72
  const top = Math.max(12, rect.top - height - 10)
  contextChip.root.style.top = `${top}px`
}

function paintContextChip() {
  if (!contextChip) return
  const { root, data, editing } = contextChip
  root.replaceChildren()
  if (editing) {
    const edit = el('div', { className: 'qq-ctx-chip-edit' })
    const title = el('input', { value: data.title, placeholder: '订阅名称' })
    title.value = data.title
    const rule = el('input', { placeholder: '规则' })
    rule.value = data.ruleLabel
    const status = el('input', { placeholder: '状态 / 下次' })
    status.value = [data.status, data.nextRunLabel].filter(Boolean).join(' · ')
    const prompt = el('textarea', { placeholder: '执行指令' })
    prompt.value = data.prompt || ''
    const row = el('div', { className: 'qq-ctx-chip-edit-actions' })
    const save = el('button', { type: 'button', className: 'qq-ctx-chip-save', text: '完成' })
    const cancel = el('button', { type: 'button', className: 'qq-ctx-chip-cancel', text: '取消' })
    save.addEventListener('click', (event) => {
      event.stopPropagation()
      data.title = title.value.trim() || data.title
      data.ruleLabel = rule.value.trim() || data.ruleLabel
      const statusParts = status.value.split('·').map(part => part.trim()).filter(Boolean)
      data.status = statusParts[0] || data.status
      data.nextRunLabel = statusParts.slice(1).join(' · ')
      data.prompt = prompt.value.trim()
      contextChip.editing = false
      paintContextChip()
      placeContextChip()
    })
    cancel.addEventListener('click', (event) => {
      event.stopPropagation()
      contextChip.editing = false
      paintContextChip()
      placeContextChip()
    })
    row.append(cancel, save)
    edit.append(title, rule, status, prompt, row)
    root.append(edit)
    root.dataset.editing = ''
    return
  }
  delete root.dataset.editing
  const head = el('div', { className: 'qq-ctx-chip-head' })
  head.append(
    el('span', { className: 'qq-ctx-chip-badge', text: '订阅' }),
    el('strong', { className: 'qq-ctx-chip-title', text: data.title }),
    el('button', { type: 'button', className: 'qq-ctx-chip-close', text: '×', 'aria-label': '移除上下文' }),
  )
  const meta = el('div', { className: 'qq-ctx-chip-meta', text: [data.ruleLabel, data.status, data.nextRunLabel ? `下次 ${data.nextRunLabel}` : ''].filter(Boolean).join(' · ') })
  root.append(head, meta)
  if (data.prompt) {
    root.append(el('div', { className: 'qq-ctx-chip-prompt', text: data.prompt }))
  }
  root.append(el('div', { className: 'qq-ctx-chip-hint', text: '点击卡片可编辑 · 发送时自动带上' }))
}

function buildChipMessage(data, userText) {
  return [
    `【待办管理 · 订阅「${data.title}」】`,
    `规则：${data.ruleLabel}`,
    `状态：${data.status}${data.nextRunLabel ? ` · 下次 ${data.nextRunLabel}` : ''}`,
    data.prompt ? `执行指令：${data.prompt}` : '',
    '工具：只用 todo_manage / subscription_manage；需要时再 list。',
    '',
    userText.trim() || '我想：',
  ].filter(Boolean).join('\n')
}

let chipHookInstalled = false
function ensureChipSendHook() {
  if (chipHookInstalled) return
  chipHookInstalled = true
  document.addEventListener('click', (event) => {
    if (!contextChip) return
    const btn = event.target.closest?.('button[aria-label="发送消息"]')
    if (!(btn instanceof HTMLButtonElement)) return
    event.preventDefault()
    event.stopPropagation()
    void flushChipAndSend()
  }, true)
  document.addEventListener('keydown', (event) => {
    if (!contextChip) return
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    const textarea = event.target
    if (!(textarea instanceof HTMLTextAreaElement) || !textarea.matches('textarea[data-phase]')) return
    event.preventDefault()
    event.stopPropagation()
    void flushChipAndSend()
  }, true)
}

async function flushChipAndSend() {
  if (!contextChip) return
  const textarea = document.querySelector('textarea[data-phase]')
  if (!(textarea instanceof HTMLTextAreaElement)) return
  const userText = textarea.value
  const full = buildChipMessage(contextChip.data, userText)
  removeContextChip()
  await fillAndSend(textarea, full)
}

async function rpc(method, payload) {
  const rpcId = crypto.randomUUID()
  const res = await fetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  })
  const data = await res.json()
  if (!data?.result?.ok) {
    const message = data?.result?.error?.message || `rpc ${method} failed`
    throw new Error(message)
  }
  return data.result.value
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let interceptingSend = false
let memoryPromptOpen = false

function isRecallIntent(text) {
  return /你记[得着]什么|我的(偏好|记忆)|记忆列表|查看记忆|看看记忆|你还记得/.test(text)
}

function isRememberIntent(text) {
  return /(?:请你?|麻烦你?|帮我)?(?:记住|记下|记一下|记着)/.test(text) && !isRecallIntent(text)
}

function mountComposerHook() {
  document.addEventListener('click', onComposerClick, true)
  document.addEventListener('keydown', onComposerKey, true)
}

/** @type {HTMLElement | null} */
let hintsBox = null
let lastHintsPaint = ''
let hintSending = false

function mountHints() {
  if (!hintsBox) {
    hintsBox = el('div', { className: 'qq-hints', id: 'qq-hints-box' })
    document.body.appendChild(hintsBox)
    window.addEventListener('qq-use-hint', (event) => {
      const item = event instanceof CustomEvent ? event.detail : null
      if (item && item.prompt) void useHint(item)
    })
    setInterval(() => {
      if (hintsBox) {
        try { paintHints() } catch (error) { console.warn('[planner] hints', error) }
      }
    }, 400)
  }
  paintHints()
}

function paintHints() {
  if (!hintsBox) return
  const items = state.data.hints ?? []
  const payload = JSON.stringify(items.map(item => [item.id, item.title, item.prompt]))
  if (payload !== lastHintsPaint) {
    lastHintsPaint = payload
    hintsBox.replaceChildren()
    const head = el('div', { className: 'qq-hints-head' })
    const refresh = el('button', { type: 'button', className: 'qq-hints-refresh', text: '换一批' })
    refresh.addEventListener('click', (event) => {
      event.stopPropagation()
      void regenerateHints()
    })
    head.append(el('span', { className: 'qq-hints-title', text: '你可以这样开始' }), refresh)
    const grid = el('div', { className: 'qq-hints-grid' })
    for (const item of items.slice(0, 4)) {
      const btn = el('button', { type: 'button', className: 'qq-hint' })
      btn.title = item.prompt
      btn.append(el('span', { className: 'qq-hint-title', text: item.title }))
      if (item.reason) btn.append(el('span', { className: 'qq-hint-reason', text: item.reason }))
      btn.addEventListener('click', () => { void useHint(item) })
      grid.append(btn)
    }
    if (items.length === 0) {
      grid.append(el('div', { className: 'qq-hints-empty', text: '正在准备建议…' }))
    }
    hintsBox.append(head, grid)
  }
  placeHints(hintsBox)
}

function findHomeModeRow() {
  const seat = document.querySelector('[data-composer-seat]')
  const scope = seat instanceof HTMLElement ? seat : document
  const buttons = scope.querySelectorAll('button')
  for (const btn of buttons) {
    const text = (btn.textContent ?? '').replace(/\s+/g, '')
    if (text.includes('纯聊天') || text.includes('基于工作区') || text.includes('Chat') || text.includes('Workspace')) {
      return btn.parentElement
    }
  }
  return null
}

function isHomeHero() {
  if (hintSending) return false
  if (findHomeModeRow()) return true
  const phase = document.querySelector('[data-composer-seat]')?.closest('[data-phase]')?.getAttribute('data-phase')
    ?? document.querySelector('[data-phase]:not(textarea)')?.getAttribute('data-phase')
  return phase === 'hero' || phase === 'settling'
}

function placeHints(box) {
  box.hidden = false
  box.removeAttribute('hidden')
  if (document.querySelector('[data-hero-hints]') || !isHomeHero()) {
    box.classList.add('qq-hints-hide')
    return
  }
  box.classList.remove('qq-hints-hide')
  if (box.parentElement !== document.body) document.body.appendChild(box)
  const modes = findHomeModeRow()
  const planner = document.querySelector('aside.qq-planner')
  const plannerLeft = planner instanceof HTMLElement ? planner.getBoundingClientRect().left : window.innerWidth
  box.style.position = 'fixed'
  box.style.zIndex = '4000'
  box.style.right = 'auto'
  box.style.bottom = 'auto'
  if (modes instanceof HTMLElement) {
    const rect = modes.getBoundingClientRect()
    box.style.left = `${Math.max(16, rect.left)}px`
    box.style.width = `${Math.max(280, rect.width)}px`
    box.style.top = `${rect.bottom + 12}px`
    return
  }
  const width = Math.min(640, Math.max(320, plannerLeft - 48))
  box.style.left = `${Math.max(24, (plannerLeft - width) / 2)}px`
  box.style.width = `${width}px`
  box.style.top = 'auto'
  box.style.bottom = '24px'
}

async function regenerateHints() {
  if (!hintsBox) return
  hintsBox.dataset.loading = ''
  try {
    const data = await api('POST', '/planner-api/hints/refresh')
    state.data.hints = data.items ?? []
    lastPayload = ''
    render()
  } catch (error) {
    console.warn('[hints] refresh failed', error)
  } finally {
    hintsBox?.removeAttribute('data-loading')
  }
}

async function useHint(item) {
  if (hintSending) return
  hintSending = true
  if (hintsBox) hintsBox.classList.add('qq-hints-hide')
  try {
    const prompt = String(item.prompt ?? '').trim()
    if (!prompt) return
    const textarea = document.querySelector('textarea[data-phase]')
    if (textarea instanceof HTMLTextAreaElement && !textarea.disabled && !textarea.readOnly) {
      await sendPlainPrompt(textarea, prompt)
      return
    }
    await startHintChat(item.title || '新会话', prompt)
  } finally {
    hintSending = false
    paintHints()
  }
}

async function sendPlainPrompt(textarea, prompt) {
  interceptingSend = true
  try {
    await fillAndSend(textarea, prompt)
  } finally {
    interceptingSend = false
  }
}

async function startHintChat(title, prompt) {
  const chatCard = [...document.querySelectorAll('button')].find((btn) => {
    const text = btn.textContent ?? ''
    return text.includes('纯聊天') && (btn.closest('[data-composer-seat]') || btn.closest('[data-phase="hero"]'))
  })
  if (chatCard instanceof HTMLButtonElement) {
    chatCard.click()
    const textarea = await waitForReadyComposer()
    if (textarea) {
      await sendPlainPrompt(textarea, prompt)
      return
    }
  }

  document.querySelector('button[aria-label="打开侧边栏"]')?.click()
  let sessionId = null
  try {
    sessionId = await createPlannerSession(title)
  } catch (error) {
    console.warn('[hints] session.create failed', error)
  }
  if (!sessionId) {
    await ensureBlankChatSession()
    sessionId = await findLatestBlankChatSession()
  }
  if (sessionId) {
    try {
      await rpc('session.prompt', {
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: prompt }],
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
      })
      try {
        await rpc('session.rename', { sessionId, title })
      } catch {
        // blank rename may fail until first prompt
      }
      await openSessionInUi(title)
      return
    } catch (error) {
      console.warn('[hints] session.prompt failed', error)
    }
  }
  const textarea = await waitForReadyComposer()
  if (textarea) await sendPlainPrompt(textarea, prompt)
}

function onComposerClick(event) {
  const btn = event.target instanceof Element
    ? event.target.closest('button[aria-label="发送消息"]')
    : null
  if (!(btn instanceof HTMLButtonElement)) return
  interceptComposerEvent(event)
}

function onComposerKey(event) {
  if (event.key !== 'Enter' || event.shiftKey) return
  const textarea = document.querySelector('textarea[data-phase]')
  if (event.target !== textarea) return
  interceptComposerEvent(event)
}

function interceptComposerEvent(event) {
  if (interceptingSend) return
  if (memoryPromptOpen) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }
  const textarea = document.querySelector('textarea[data-phase]')
  if (!(textarea instanceof HTMLTextAreaElement)) return
  const text = textarea.value.trim()
  if (!text || text.startsWith('【')) return
  if (isRecallIntent(text)) {
    openMemory()
    return
  }
  if (!isRememberIntent(text)) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  void beginMemoryConfirm(text, textarea)
}

async function beginMemoryConfirm(text, textarea) {
  if (memoryPromptOpen) return
  memoryPromptOpen = true
  const sheet = showMemorySheet('正在整理要记住的内容…')
  try {
    let draft
    try {
      draft = await api('POST', '/planner-api/memory/extract', { text })
    } catch (error) {
      sheet.remove()
      console.warn('[memory] extract failed', error)
      await continueSend(text, textarea)
      return
    }
    if ((!draft.memories || draft.memories.length === 0) && (!draft.todos || draft.todos.length === 0)) {
      draft = {
        memories: [{ kind: 'preference', content: text.replace(/^(?:请你?|麻烦你?|帮我)?(?:记住|记下|记一下|记着)(?:一下)?[：:，,\s]*/, ''), category: '偏好' }],
        todos: [],
      }
    }
    const selected = await promptMemoryDraft(sheet, draft)
    if (selected) {
      try {
        await api('POST', '/planner-api/memory/commit', selected)
        await refresh()
      } catch (error) {
        console.warn('[memory] commit failed', error)
      }
    }
    await continueSend(text, textarea)
  } finally {
    memoryPromptOpen = false
    document.querySelector('.qq-memory-sheet')?.remove()
  }
}

async function continueSend(text, textarea) {
  if (textarea instanceof HTMLTextAreaElement) {
    interceptingSend = true
    try {
      await fillAndSend(textarea, text)
    } finally {
      interceptingSend = false
    }
    return
  }
  const composer = await waitForReadyComposer()
  if (composer instanceof HTMLTextAreaElement) {
    interceptingSend = true
    try {
      await fillAndSend(composer, text)
    } finally {
      interceptingSend = false
    }
  }
}

function showMemorySheet(loadingText) {
  document.querySelector('.qq-memory-sheet')?.remove()
  const sheet = el('div', { className: 'qq-memory-sheet' })
  sheet.append(el('div', { className: 'qq-memory-sheet-title', text: '写入记忆' }))
  sheet.append(el('div', { className: 'qq-planner-empty', text: loadingText }))
  document.body.appendChild(sheet)
  return sheet
}

function promptMemoryDraft(sheet, draft) {
  return new Promise((resolve) => {
    sheet.replaceChildren()
    sheet.append(el('div', { className: 'qq-memory-sheet-title', text: '确认要记住的内容' }))
    sheet.append(el('div', { className: 'qq-memory-sheet-hint', text: '默认全部写入。取消勾选或改文字后再确认。' }))
    const rows = []
    const memories = draft.memories ?? []
    const todos = draft.todos ?? []
    if (memories.length > 0) sheet.append(el('div', { className: 'qq-memory-sheet-label', text: '记忆 / 偏好' }))
    for (const item of memories) {
      rows.push(draftRow(sheet, {
        type: 'memory',
        kind: item.kind || 'preference',
        content: item.content,
        category: item.category || '',
      }))
    }
    if (todos.length > 0) sheet.append(el('div', { className: 'qq-memory-sheet-label', text: '待办（含明确时间）' }))
    for (const item of todos) {
      rows.push(draftRow(sheet, {
        type: 'todo',
        title: item.title,
        notes: item.notes || '',
        dueDate: item.dueDate || '',
        dueTime: item.dueTime || '',
      }))
    }
    const actions = el('div', { className: 'qq-memory-sheet-actions' })
    const cancel = el('button', { className: 'qq-planner-ghost', type: 'button', text: '取消' })
    const confirm = el('button', { className: 'qq-planner-primary', type: 'button', text: '写入选中项' })
    cancel.addEventListener('click', () => { sheet.remove(); resolve(null) })
    confirm.addEventListener('click', () => {
      const payload = { memories: [], todos: [] }
      for (const row of rows) {
        if (!row.box.checked) continue
        if (row.type === 'memory') {
          const content = row.content.value.trim()
          if (!content) continue
          payload.memories.push({ kind: row.kind.value, content, category: row.category.value.trim() })
        } else {
          const title = row.content.value.trim()
          if (!title) continue
          payload.todos.push({
            title,
            notes: row.notes,
            dueDate: row.dueDate.value || null,
            dueTime: row.dueTime.value || null,
          })
        }
      }
      sheet.remove()
      resolve(payload)
    })
    actions.append(cancel, confirm)
    sheet.append(actions)
  })
}

function draftRow(sheet, item) {
  const row = el('label', { className: 'qq-memory-draft' })
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = true
  const content = el('input', { value: item.type === 'memory' ? item.content : item.title })
  row.append(box, content)
  if (item.type === 'memory') {
    const kind = el('select')
    for (const [value, label] of [['preference', '偏好'], ['fact', '事实'], ['note', '备注']]) {
      const option = el('option', { value, text: label })
      if (value === item.kind) option.selected = true
      kind.append(option)
    }
    const category = el('input', { placeholder: '分类', value: item.category })
    row.append(kind, category)
    sheet.append(row)
    return { type: 'memory', box, content, kind, category }
  }
  const dueDate = el('input', { type: 'date', value: item.dueDate })
  const dueTime = el('input', { type: 'time', value: item.dueTime })
  row.append(dueDate, dueTime)
  sheet.append(row)
  return { type: 'todo', box, content, dueDate, dueTime, notes: item.notes }
}

function isTypingField(node) {
  return node instanceof HTMLInputElement
    || node instanceof HTMLTextAreaElement
    || node instanceof HTMLSelectElement
}

function monthCells(month) {
  const first = startOfMonth(month)
  const startOffset = (first.getDay() + 6) % 7
  const start = addDays(first, -startOffset)
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i)
    return { date, inMonth: date.getMonth() === month.getMonth() }
  })
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function formatDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function el(tag, props = {}) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === '') continue
    if (key === 'text') node.textContent = value
    else if (key === 'className') node.className = value
    else if (key === 'style') node.setAttribute('style', value)
    else node.setAttribute(key, value)
  }
  return node
}

function iconButton(label, svg, onClick) {
  const btn = el('button', { className: 'qq-planner-icon', type: 'button', 'aria-label': label })
  btn.innerHTML = svg
  btn.addEventListener('click', onClick)
  return btn
}

function calendarSvg() {
  return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor"/><path d="M2 6h12M5 2v2M11 2v2" stroke="currentColor"/></svg>'
}

function memorySvg() {
  return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2.5c2.2 0 4 1.7 4 4.1 0 2.2-1.5 3.6-3 4.6v1.3H7V11.2C5.5 10.2 4 8.8 4 6.6 4 4.2 5.8 2.5 8 2.5Z" stroke="currentColor"/><path d="M6.5 14h3" stroke="currentColor" stroke-linecap="round"/></svg>'
}

function sparkSvg() {
  return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.2 3.8L13 6.5l-3.8 1.2L8 11.5 6.8 7.7 3 6.5l3.8-1.2L8 1.5Z" stroke="currentColor" stroke-linejoin="round"/><path d="M12.5 10.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" stroke="currentColor" stroke-linejoin="round"/></svg>'
}

function chevronSvg() {
  return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
}

/** @type {HTMLElement | null} */
let capabilityDock = null
let lastDockPaint = ''
let dockFlashId = ''

function mountCapabilityDock() {
  if (!capabilityDock) {
    capabilityDock = el('div', { className: 'qq-cap-dock', id: 'qq-cap-dock' })
    document.body.appendChild(capabilityDock)
    setInterval(() => {
      try { paintCapabilityDock() } catch (error) { console.warn('[planner] dock', error) }
    }, 400)
  }
  paintCapabilityDock()
}

function paintCapabilityDock() {
  if (!capabilityDock) return
  const items = dockCapabilityList()
  const payload = `${JSON.stringify(items.map(item => [item.id, item.title]))}|${dockFlashId}`
  if (payload !== lastDockPaint) {
    lastDockPaint = payload
    capabilityDock.replaceChildren()
    const head = el('div', { className: 'qq-cap-dock-head' })
    head.append(
      el('span', { className: 'qq-cap-dock-title', text: '能力插件' }),
      el('button', { type: 'button', className: 'qq-cap-dock-more', text: '全部' }),
    )
    head.querySelector('.qq-cap-dock-more')?.addEventListener('click', () => openPanel('capabilities'))
    const row = el('div', { className: 'qq-cap-dock-row' })
    for (const item of items) {
      const btn = el('button', { type: 'button', className: 'qq-cap-dock-chip' })
      btn.style.setProperty('--qq-cap-accent', item.accent || '#12b7f5')
      if (item.id === dockFlashId) btn.dataset.active = ''
      btn.append(
        el('span', { className: 'qq-cap-dock-chip-title', text: item.short || item.title }),
        el('span', { className: 'qq-cap-dock-chip-sub', text: item.title }),
      )
      btn.title = item.blurb
      btn.addEventListener('click', () => { void runCapability(item) })
      row.append(btn)
    }
    capabilityDock.append(head, row)
  }
  placeCapabilityDock(capabilityDock)
}

function flashCapabilityDock(id) {
  dockFlashId = id
  lastDockPaint = ''
  paintCapabilityDock()
  setTimeout(() => {
    if (dockFlashId === id) {
      dockFlashId = ''
      lastDockPaint = ''
      paintCapabilityDock()
    }
  }, 1800)
}

function placeCapabilityDock(box) {
  box.hidden = false
  box.removeAttribute('hidden')
  const textarea = document.querySelector('textarea[data-phase]')
  if (!(textarea instanceof HTMLTextAreaElement) || textarea.offsetParent === null) {
    box.classList.add('qq-cap-dock-hide')
    return
  }
  // Keep dock visible beside the composer in both hero and active chat.
  box.classList.remove('qq-cap-dock-hide')
  if (box.parentElement !== document.body) document.body.appendChild(box)
  const rect = textarea.getBoundingClientRect()
  const planner = document.querySelector('aside.qq-planner')
  const plannerLeft = planner instanceof HTMLElement ? planner.getBoundingClientRect().left : window.innerWidth
  const maxRight = Math.max(24, plannerLeft - 16)
  const left = Math.max(16, rect.left)
  const available = maxRight - left
  if (available < 120) {
    box.classList.add('qq-cap-dock-hide')
    return
  }
  const width = Math.min(rect.width, available)
  box.style.position = 'fixed'
  box.style.zIndex = '11'
  box.style.left = `${left}px`
  box.style.width = `${Math.max(160, width)}px`
  box.style.right = 'auto'
  box.style.bottom = 'auto'
  // Place the dock below the WHOLE composer (textarea + toolbar/send button),
  // otherwise it still covers the buttons that sit under the textarea.
  let top = composerBottomEdge(textarea, rect) + 8
  const dockHeight = box.offsetHeight || 100
  const maxTop = window.innerHeight - dockHeight - 8
  if (top > maxTop) top = Math.max(8, maxTop)
  box.style.top = `${top}px`
}

/** Bottom edge of the full composer, including the send button/toolbar row. */
function composerBottomEdge(textarea, rect) {
  let bottom = rect.bottom
  const send = document.querySelector('button[aria-label="发送消息"]')
  if (send instanceof HTMLElement && send.offsetParent !== null) {
    // Find the nearest common ancestor of the textarea and the send button:
    // that element is the composer container whose bottom we want.
    const ancestors = new Set()
    for (let node = textarea; node; node = node.parentElement) ancestors.add(node)
    let container = send
    while (container && !ancestors.has(container)) container = container.parentElement
    const measured = container instanceof HTMLElement ? container : send
    const cr = measured.getBoundingClientRect()
    if (cr.bottom > bottom && cr.bottom < rect.bottom + 400) bottom = cr.bottom
  }
  return bottom
}
