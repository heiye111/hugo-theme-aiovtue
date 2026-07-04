const DEFAULT_STORAGE_KEY = 'sakura-music-state'
const API_CACHE_KEY = 'sakura-music-api'
const APLAYER_CSS_URL = 'https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.css'
const APLAYER_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.js'
const METING_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/meting@2/dist/Meting.min.js'
const DEFAULT_APIS = [
  'https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r',
  'https://api.injahow.cn/meting/?server=:server&type=:type&id=:id',
  'https://meting.qjqq.cn/?server=:server&type=:type&id=:id',
]

function readState(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}')
  } catch {
    return {}
  }
}

function writeState(storageKey, state) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    /* storage unavailable */
  }
}

function readJsonData(el, fallback) {
  if (!el) return fallback
  try {
    const raw = JSON.parse(el.textContent || '')
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function readApiList() {
  const parsed = readJsonData(document.getElementById('sakura-music-apis'), null)
  if (Array.isArray(parsed) && parsed.length) return parsed.filter(Boolean)
  return [...DEFAULT_APIS]
}

function prioritizeApiList(apis) {
  try {
    const cached = sessionStorage.getItem(API_CACHE_KEY)
    if (cached && apis.includes(cached)) {
      return [cached, ...apis.filter((item) => item !== cached)]
    }
  } catch {
    /* ignore */
  }
  return apis
}

function rememberWorkingApi(api) {
  try {
    sessionStorage.setItem(API_CACHE_KEY, api)
  } catch {
    /* ignore */
  }
}

function loadStylesheet(href) {
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = () => resolve()
    link.onerror = () => reject(new Error(`Failed to load ${href}`))
    document.head.appendChild(link)
  })
}

function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.body.appendChild(script)
  })
}

let musicLibsPromise = null

async function ensureMusicLibs() {
  if (window.APlayer && customElements.get('meting-js')) return
  if (!musicLibsPromise) {
    musicLibsPromise = Promise.all([
      loadStylesheet(APLAYER_CSS_URL),
      loadScript(APLAYER_SCRIPT_URL),
      loadScript(METING_SCRIPT_URL),
    ]).then(() => waitForMusicLibs())
  }
  await musicLibsPromise
}

function waitForMusicLibs(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (window.APlayer && customElements.get('meting-js')) {
        resolve()
        return
      }
      if (Date.now() - started > timeout) {
        reject(new Error('music libs timeout'))
        return
      }
      window.setTimeout(tick, 80)
    }
    tick()
  })
}

function buildMetingApiUrl(metingEl, apiTemplate) {
  const read = (name) => metingEl.getAttribute(name) || ''
  const api = apiTemplate || read('api') || DEFAULT_APIS[0]
  return api
    .replace(':server', read('server'))
    .replace(':type', read('type'))
    .replace(':id', read('id'))
    .replace(':auth', read('auth'))
    .replace(':r', String(Math.random()))
}

async function fetchPlaylist(metingEl, apiTemplate) {
  let res
  try {
    res = await fetch(buildMetingApiUrl(metingEl, apiTemplate), { cache: 'no-store' })
  } catch (err) {
    throw new Error(`无法连接 API（${err?.message || 'network error'}）`)
  }
  if (!res.ok) throw new Error(`API 响应 ${res.status}`)
  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('API 返回格式无效')
  }
  if (Array.isArray(data) && data.length) return data
  const message = data?.message || data?.msg || '歌单为空或 API 不可用'
  throw new Error(message)
}

function createMetingElement(root, apiTemplate) {
  const metingEl = document.createElement('meting-js')
  metingEl.setAttribute('api', apiTemplate)
  metingEl.setAttribute('server', root.dataset.server || 'netease')
  metingEl.setAttribute('type', root.dataset.type || 'playlist')
  metingEl.setAttribute('id', root.dataset.id || '')
  metingEl.setAttribute('fixed', 'false')
  metingEl.setAttribute('mini', 'false')
  metingEl.setAttribute('list-folded', 'false')
  metingEl.setAttribute('list-max-height', '220px')
  metingEl.setAttribute('preload', 'metadata')
  metingEl.setAttribute('mutex', 'true')
  metingEl.setAttribute('theme', root.dataset.theme || '#DF9193')
  return metingEl
}

function resetMetingHost(host) {
  host.querySelectorAll('meting-js').forEach((el) => el.remove())
}

function waitForAPlayer(metingEl, timeout = 18000) {
  return new Promise((resolve, reject) => {
    if (!metingEl) {
      reject(new Error('meting element missing'))
      return
    }

    const started = Date.now()
    const tick = () => {
      const ap = metingEl.aplayer || metingEl.__aplayer
      if (ap?.list?.audios?.length) {
        resolve(ap)
        return
      }
      if (Date.now() - started > timeout) {
        reject(new Error('播放器初始化超时'))
        return
      }
      window.setTimeout(tick, 120)
    }
    tick()
  })
}

async function mountWithApi(root, host, apiTemplate) {
  resetMetingHost(host)
  const metingEl = createMetingElement(root, apiTemplate)
  host.appendChild(metingEl)
  await fetchPlaylist(metingEl, apiTemplate)
  const ap = await waitForAPlayer(metingEl)
  return { ap, metingEl, apiTemplate }
}

async function mountWithFallback(root, host) {
  const apis = prioritizeApiList(readApiList())
  let lastError = null

  for (const apiTemplate of apis) {
    try {
      const result = await mountWithApi(root, host, apiTemplate)
      rememberWorkingApi(apiTemplate)
      return result
    } catch (err) {
      lastError = err
      console.warn('[music-player] api failed:', apiTemplate, err)
      resetMetingHost(host)
    }
  }

  throw lastError || new Error('所有音乐 API 均不可用')
}

function bindPlayingIndicator(ap, root, toggle) {
  const sync = () => {
    const playing = !ap.audio.paused
    root.classList.toggle('is-playing', playing)
    toggle?.setAttribute('aria-label', playing ? '音乐播放中，打开播放器' : '打开音乐播放器')
  }

  ap.on('play', sync)
  ap.on('pause', sync)
  ap.on('ended', sync)
  sync()
}

function bindStatePersistence(ap, storageKey, getPanelOpen) {
  let saveTimer = 0

  const save = () => {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      writeState(storageKey, {
        ...readState(storageKey),
        index: ap.list.index,
        time: ap.audio.currentTime || 0,
        volume: ap.audio.volume,
        paused: ap.audio.paused,
        panelOpen: getPanelOpen(),
      })
    }, 200)
  }

  ap.on('play', save)
  ap.on('pause', save)
  ap.on('ended', save)
  ap.on('listswitch', save)
  ap.on('volumechange', save)
  ap.audio.addEventListener('timeupdate', save)

  window.addEventListener('pagehide', save)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save()
  })
}

function restorePlaybackState(ap, storageKey) {
  const state = readState(storageKey)
  if (typeof state.volume === 'number') {
    ap.volume(state.volume, true, false)
  }

  const index = Number.isInteger(state.index) ? state.index : 0
  const time = typeof state.time === 'number' ? state.time : 0
  const shouldPlay = state.paused === false

  const apply = () => {
    if (index > 0 && index < ap.list.audios.length) {
      ap.list.switch(index)
    }
    if (time > 0) ap.seek(time)
    if (shouldPlay) ap.play()
  }

  if (ap.list.audios.length) apply()
  else ap.on('loadeddata', apply)
}

function refreshAPlayerLayout(ap, onLayout) {
  if (!ap) return
  window.dispatchEvent(new Event('resize'))
  if (typeof ap.resize === 'function') ap.resize()
  onLayout?.()
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function readMusicGap(root) {
  const raw = getComputedStyle(root).getPropertyValue('--sakura-music-gap').trim()
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 10
}

function clampMusicRootPosition(root, x, y) {
  const maxX = Math.max(0, window.innerWidth - root.offsetWidth)
  const maxY = Math.max(0, window.innerHeight - root.offsetHeight)
  return {
    x: clamp(x, 0, maxX),
    y: clamp(y, 0, maxY),
  }
}

function resetMusicPanelPosition(panel) {
  if (!panel) return
  panel.style.top = ''
  panel.style.left = ''
  panel.style.bottom = ''
  panel.style.right = ''
  panel.style.transform = ''
  panel.classList.remove('is-fitted')
}

function fitMusicPanelInViewport(root, panel, toggle) {
  if (!panel || !toggle) return
  if (!panel.classList.contains('is-visible')) return

  const margin = 12
  const gap = readMusicGap(root)
  const toggleRect = toggle.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  const panelWidth = panel.offsetWidth
  if (!panelWidth) return

  const toggleCenterX = toggleRect.left + toggleRect.width / 2
  let left = toggleCenterX - panelWidth / 2
  if (left + panelWidth > window.innerWidth - margin) {
    left = window.innerWidth - margin - panelWidth
  }
  if (left < margin) {
    left = margin
  }

  panel.style.right = 'auto'
  panel.style.transform = 'none'
  panel.style.left = `${left - rootRect.left}px`

  // 底部对齐按钮上方，歌单展开时面板向上增高，避免压住按钮或突变
  panel.style.bottom = `calc(var(--sakura-music-size) + var(--sakura-music-gap))`
  panel.style.top = 'auto'

  const panelRect = panel.getBoundingClientRect()
  if (panelRect.top < margin) {
    panel.style.bottom = 'auto'
    const panelHeight = panel.offsetHeight
    const minTop = margin - rootRect.top
    const maxTop = window.innerHeight - margin - panelHeight - rootRect.top
    const belowTop = toggleRect.bottom + gap - rootRect.top
    panel.style.top = `${clamp(belowTop, minTop, Math.max(minTop, maxTop))}px`
  }

  panel.classList.add('is-fitted')
}

function scheduleMusicPanelFit(root, panel, toggle) {
  window.requestAnimationFrame(() => {
    fitMusicPanelInViewport(root, panel, toggle)
  })
}

function bindMusicPanelLayoutSync(ap, root, panel, toggle, getPanelOpen) {
  if (!ap || !panel) return

  let fitTimer = 0
  const refit = () => {
    if (!getPanelOpen()) return
    window.clearTimeout(fitTimer)
    fitTimer = window.setTimeout(() => {
      scheduleMusicPanelFit(root, panel, toggle)
    }, 16)
  }

  ap.on('listshow', refit)
  ap.on('listhide', refit)

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(refit)
    observer.observe(panel)
  }
}

function applyMusicPosition(root, storageKey) {
  const state = readState(storageKey)
  const position = state.position
  if (
    root.dataset.draggable === 'true'
    && position
    && Number.isFinite(position.x)
    && Number.isFinite(position.y)
  ) {
    const { x, y } = clampMusicRootPosition(root, position.x, position.y)
    root.classList.add('is-custom-position')
    root.style.left = `${x}px`
    root.style.top = `${y}px`
    root.style.right = 'auto'
    root.style.bottom = 'auto'
    if (x !== position.x || y !== position.y) {
      writeState(storageKey, { ...state, position: { x, y } })
    }
  }
}

function bindMusicDrag(root, storageKey, toggle, panel) {
  if (root.dataset.draggable !== 'true' || !toggle) return

  let pointerId = null
  let startX = 0
  let startY = 0
  let originX = 0
  let originY = 0
  let moved = false

  const savePosition = () => {
    const rect = root.getBoundingClientRect()
    const state = readState(storageKey)
    writeState(storageKey, {
      ...state,
      position: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      },
    })
  }

  toggle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    const rect = root.getBoundingClientRect()
    originX = rect.left
    originY = rect.top
    moved = false
    toggle.setPointerCapture(event.pointerId)
  })

  toggle.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (!moved && Math.hypot(dx, dy) < 8) return

    moved = true
    root.dataset.dragMoved = '1'
    root.classList.add('is-custom-position', 'is-dragging')

    const maxX = Math.max(0, window.innerWidth - root.offsetWidth)
    const maxY = Math.max(0, window.innerHeight - root.offsetHeight)
    const x = clamp(originX + dx, 0, maxX)
    const y = clamp(originY + dy, 0, maxY)

    root.style.left = `${x}px`
    root.style.top = `${y}px`
    root.style.right = 'auto'
    root.style.bottom = 'auto'
  })

  const finishDrag = (event) => {
    if (pointerId !== event.pointerId) return
    pointerId = null
    root.classList.remove('is-dragging')
    if (toggle.hasPointerCapture(event.pointerId)) {
      toggle.releasePointerCapture(event.pointerId)
    }
    if (moved) {
      savePosition()
      if (panel?.classList.contains('is-visible')) {
        scheduleMusicPanelFit(root, panel, toggle)
      }
    }
  }

  toggle.addEventListener('pointerup', finishDrag)
  toggle.addEventListener('pointercancel', finishDrag)
}

export function initMusicPlayer() {
  const root = document.getElementById('sakura-music')
  if (!root || root.dataset.shellReady === '1') return

  const toggle = document.getElementById('sakura-music-toggle')
  const closeBtn = document.getElementById('sakura-music-close')
  const panel = document.getElementById('sakura-music-panel')
  const host = document.getElementById('sakura-music-meting-host')
  const loadingEl = document.getElementById('sakura-music-loading')
  const errorEl = document.getElementById('sakura-music-error')
  if (!toggle || !panel || !host || !loadingEl || !errorEl) return

  root.dataset.shellReady = '1'

  const storageKey = root.dataset.storageKey || DEFAULT_STORAGE_KEY

  applyMusicPosition(root, storageKey)
  bindMusicDrag(root, storageKey, toggle, panel)

  let panelOpen = false
  let aplayerRef = null
  let playerReadyPromise = null
  let playerBound = false

  const setStatus = (state, message = '') => {
    loadingEl.hidden = state !== 'loading'
    errorEl.hidden = state !== 'error'
    if (state === 'error' && message) errorEl.textContent = message
    if (state === 'error') {
      errorEl.hidden = false
      loadingEl.hidden = true
    }
  }

  const bindPlayer = (ap) => {
    if (playerBound) return ap
    playerBound = true
    aplayerRef = ap
    restorePlaybackState(ap, storageKey)
    bindStatePersistence(ap, storageKey, () => panelOpen)
    bindPlayingIndicator(ap, root, toggle)
    bindMusicPanelLayoutSync(ap, root, panel, toggle, () => panelOpen)
    setStatus('ready')
    refreshAPlayerLayout(ap, () => scheduleMusicPanelFit(root, panel, toggle))
    return ap
  }

  const ensurePlayer = () => {
    if (aplayerRef) return Promise.resolve(aplayerRef)
    if (playerReadyPromise) return playerReadyPromise

    playerReadyPromise = (async () => {
      setStatus('loading')
      await ensureMusicLibs()
      const { ap } = await mountWithFallback(root, host)
      return bindPlayer(ap)
    })().catch((err) => {
      console.warn('[music-player]', err)
      const message = err?.message
        ? `音乐加载失败：${err.message}`
        : '音乐播放器加载失败，请稍后重试'
      setStatus('error', message)
      toggle?.setAttribute('aria-label', '音乐播放器加载失败')
      playerReadyPromise = null
      throw err
    })

    return playerReadyPromise
  }

  const setPanelOpen = (open, persist = true) => {
    panelOpen = open
    panel.classList.toggle('is-visible', open)
    panel.setAttribute('aria-hidden', open ? 'false' : 'true')
    root.classList.toggle('is-open', open)
    toggle?.setAttribute('aria-expanded', open ? 'true' : 'false')
    if (open) {
      scheduleMusicPanelFit(root, panel, toggle)
      window.requestAnimationFrame(() => {
        refreshAPlayerLayout(aplayerRef, () => scheduleMusicPanelFit(root, panel, toggle))
      })
    } else {
      resetMusicPanelPosition(panel)
    }
    if (persist) {
      const state = readState(storageKey)
      writeState(storageKey, { ...state, panelOpen: open })
    }
  }

  const openPanel = () => {
    setPanelOpen(true)
    ensurePlayer().then((ap) => {
      refreshAPlayerLayout(ap, () => scheduleMusicPanelFit(root, panel, toggle))
    }).catch(() => {})
  }

  window.addEventListener('resize', () => {
    if (root.classList.contains('is-custom-position')) {
      const rect = root.getBoundingClientRect()
      const { x, y } = clampMusicRootPosition(root, rect.left, rect.top)
      root.style.left = `${x}px`
      root.style.top = `${y}px`
      if (root.dataset.draggable === 'true') {
        const state = readState(storageKey)
        writeState(storageKey, { ...state, position: { x, y } })
      }
    }
    if (panelOpen) scheduleMusicPanelFit(root, panel, toggle)
  })

  const stored = readState(storageKey)
  if (stored.panelOpen) openPanel()

  toggle?.addEventListener('click', (event) => {
    event.stopPropagation()
    if (root.dataset.dragMoved === '1') {
      root.dataset.dragMoved = '0'
      return
    }
    if (panelOpen) setPanelOpen(false)
    else openPanel()
  })

  closeBtn?.addEventListener('click', (event) => {
    event.stopPropagation()
    setPanelOpen(false)
  })

  document.addEventListener('click', (event) => {
    if (!panelOpen) return
    if (root.contains(event.target)) return
    setPanelOpen(false)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panelOpen) setPanelOpen(false)
  })
}

export function scheduleMusicPlayerInit() {
  const root = document.getElementById('sakura-music')
  if (!root) return

  const storageKey = root.dataset.storageKey || DEFAULT_STORAGE_KEY
  try {
    if (readState(storageKey).panelOpen) {
      initMusicPlayer()
      return
    }
  } catch {
    /* ignore */
  }

  const run = () => initMusicPlayer()
  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: 5000 })
  } else {
    window.setTimeout(run, 2000)
  }
}
