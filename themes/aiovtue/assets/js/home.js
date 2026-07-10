
import { applyTargetScroll, readHomeListScrollMeta } from './page-nav.js'
import { registerPageCleanup } from './page-cleanup.js'
import { escapeHtml, parseJsonData, formatRelativeTime } from './utils.js'
import { initLazyImages } from './lazy-images.js'

const MOBILE_CARDS_MQ = '(max-width: 768px)'

function initHomeMobileListTimes(root) {
  const roots = root
    ? [root]
    : [...document.querySelectorAll('.is-mobile-cards-list')]
  roots.forEach((scope) => {
    scope.querySelectorAll('.sakura-post-card .sakura-post-date time[datetime]').forEach((timeEl) => {
      const absolute = timeEl.textContent.trim()
      const isDateOnly = timeEl.hasAttribute('data-date-only')
      const formatted = formatRelativeTime(timeEl.getAttribute('datetime'), absolute, isDateOnly)
      timeEl.textContent = formatted
      if (formatted !== absolute) {
        timeEl.title = `编辑于${absolute}`
      } else {
        timeEl.removeAttribute('title')
      }
    })
  })
}

function syncHomeMobileListPins() {
  const mobile = window.matchMedia(MOBILE_CARDS_MQ).matches
  document.querySelectorAll('.is-mobile-cards-list .sakura-post-card > .sakura-post-pin').forEach((pin) => {
    const icon = pin.querySelector('iconify-icon')
    if (mobile) {
      pin.classList.add('is-pin-flip')
      icon?.setAttribute('flip', 'horizontal')
    } else {
      pin.classList.remove('is-pin-flip')
      icon?.removeAttribute('flip')
    }
  })
}

let homeMobileListPinsBound = false

export function refreshMobileCardsListPage() {
  initHomeMobileListTimes()
  syncHomeMobileListPins()
}

function initHomeMobileListPins() {
  refreshMobileCardsListPage()
  if (homeMobileListPinsBound) return
  homeMobileListPinsBound = true
  window.addEventListener('resize', syncHomeMobileListPins, { passive: true })
  registerPageCleanup(() => {
    window.removeEventListener('resize', syncHomeMobileListPins)
    homeMobileListPinsBound = false
  })
}

let homePostListRevealObserver = null
let homeTimelineLoader = null
let homeCardsLoader = null
let homeListScrollRestoreToken = 0

function getPostListScrollTop() {
  const target = document.getElementById('home-post-list')
    || document.querySelector('.sakura-post-list')
  if (!target) return 0

  const navHeight = Number.parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--sakura-navbar-height'),
    10,
  ) || 65

  return Math.max(0, window.scrollY + target.getBoundingClientRect().top - navHeight - 8)
}

function applyHomeListScroll(scrollY) {
  applyTargetScroll(scrollY)
}

function prepareHomeTimelineForScroll(targetY, timelineItemsTarget = 0) {
  if (!homeTimelineLoader?.hasMore?.()) return Promise.resolve()

  return new Promise((resolve) => {
    const step = () => {
      const currentCount = document.querySelectorAll('#home-timeline-list .home-timeline-item').length
      if (timelineItemsTarget > 0 && currentCount >= timelineItemsTarget) {
        resolve()
        return
      }
      if (document.documentElement.scrollHeight >= targetY + window.innerHeight * 0.5) {
        resolve()
        return
      }
      if (!homeTimelineLoader?.hasMore?.()) {
        resolve()
        return
      }
      homeTimelineLoader.loadNextBatch({ force: true })
      requestAnimationFrame(step)
    }
    step()
  })
}

function prepareHomeCardsForScroll(targetY, cardsItemsTarget = 0) {
  if (!homeCardsLoader?.hasMore?.()) return Promise.resolve()

  return new Promise((resolve) => {
    const step = () => {
      const currentCount = document.querySelectorAll('#home-cards-list .sakura-post-card').length
      if (cardsItemsTarget > 0 && currentCount >= cardsItemsTarget) {
        resolve()
        return
      }
      if (document.documentElement.scrollHeight >= targetY + window.innerHeight * 0.5) {
        resolve()
        return
      }
      if (!homeCardsLoader?.hasMore?.()) {
        resolve()
        return
      }
      homeCardsLoader.loadNextBatch({ force: true })
      requestAnimationFrame(step)
    }
    step()
  })
}

export function restoreHomeListScroll(meta) {
  const targetY = meta.y
  const token = ++homeListScrollRestoreToken
  homeTimelineLoader?.pauseAutoLoad?.()
  homeCardsLoader?.pauseAutoLoad?.()
  const apply = () => {
    if (token !== homeListScrollRestoreToken) return
    applyHomeListScroll(targetY)
    try {
      history.replaceState(
        { ...(history.state || {}), pjax: true, scrollY: targetY },
        '',
        window.location.href,
      )
    } catch {
      /* ignore */
    }
  }

  return Promise.all([
    prepareHomeTimelineForScroll(targetY, meta.timelineItems),
    prepareHomeCardsForScroll(targetY, meta.cardsItems),
  ]).then(() => {
    if (token !== homeListScrollRestoreToken) return
    apply()
    homeTimelineLoader?.resumeAutoLoad?.()
    homeCardsLoader?.resumeAutoLoad?.()
    syncHomeMobileListPins()
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          apply()
          resolve()
        })
      })
    })
  })
}

export function scrollToPostList() {
  const top = getPostListScrollTop()
  applyHomeListScroll(top)
  return top
}

function scheduleScrollToPostList() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToPostList()
    })
  })
}

function isHomePaginationPath(pathname) {
  const path = pathname.replace(/\/$/, '') || '/'
  return path === '/' || /^\/page\/\d+$/.test(path)
}

export function shouldScrollToPostListForUrl(href) {
  try {
    const url = new URL(href, window.location.href)
    const path = url.pathname.replace(/\/$/, '') || '/'
    if (!isHomePaginationPath(path)) return false
    return url.hash === '#home-post-list'
  } catch {
    return false
  }
}

export function initHomePaginationScroll() {
  if (!document.getElementById('home-post-list')) return

  const picked = readHomeListScrollMeta(window.location.href)
  if (picked && picked.y > 0) return

  const pjaxEnabled = document.querySelector('meta[name="sakura-pjax"]')?.content === '1'
  if (pjaxEnabled) return

  try {
    if (new URL(window.location.href).hash !== '#home-post-list') return
  } catch {
    return
  }
  scheduleScrollToPostList()
}

function observeHomePostListReveal(root, cards) {
  if (!cards.length) return

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cards.forEach((card) => card.classList.add('is-revealed'))
    return
  }

  const supportsScrollTimeline = typeof CSS !== 'undefined'
    && CSS.supports('(animation-timeline: view())')

  if (supportsScrollTimeline) {
    root.classList.add('post-list-scroll-driven')
    return
  }

  if (!homePostListRevealObserver) {
    homePostListRevealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        const card = entry.target
        card.classList.add('is-revealed')
        homePostListRevealObserver.unobserve(card)
      })
    }, {
      root: null,
      rootMargin: '0px 0px -4% 0px',
      threshold: 0.08,
    })
  }

  cards.forEach((card) => homePostListRevealObserver.observe(card))
}

export function initHomePostListScrollAnimation() {
  const root = document.getElementById('home-post-list')
  if (!root) return

  initHomeMobileListTimes()
  initHomeMobileListPins()

  const cards = [...root.querySelectorAll('.sakura-post-card, .home-timeline-item__content')]
  if (!cards.length) return

  root.classList.add('post-list-animated')
  observeHomePostListReveal(root, cards)
}

function createHomeTimelineItem(post) {
  const side = (post.index % 2 === 0) ? 'is-left' : 'is-right'
  const li = document.createElement('li')
  li.className = `home-timeline-item ${side}`
  li.innerHTML = `
    <div class="home-timeline-item__inner">
      <div class="home-timeline-item__content">
        <a class="home-timeline-card__link" href="${escapeHtml(post.url)}" aria-label="阅读全文：${escapeHtml(post.title)}">
          <h2 class="home-timeline-card__title">${escapeHtml(post.title)}</h2>
          <p class="home-timeline-card__excerpt">${escapeHtml(post.excerpt || '')}</p>
        </a>
      </div>
      <time class="home-timeline-card__date" datetime="${escapeHtml(post.dateTime || post.date || '')}"${post.dateOnly ? ' data-date-only="true"' : ''} title="编辑于${escapeHtml(post.date || '')}">
        <span class="home-timeline-card__date-year">${escapeHtml(post.dateYear || '')}</span>
        <span class="home-timeline-card__date-md">${escapeHtml(post.dateMd || '')}</span>
      </time>
    </div>
    <span class="home-timeline-item__dot" aria-hidden="true"></span>
  `
  return li
}

function renderHomeCardCategoriesHtml(categories) {
  if (!Array.isArray(categories) || !categories.length) return ''
  return categories.map((category, index) => {
    const sep = index === 0
      ? ''
      : '<span class="sakura-post-categories__sep">/</span>'
    const icon = index === 0
      ? '<iconify-icon icon="mdi:folder-open-outline" class="sakura-icon sakura-post-categories__icon" aria-hidden="true"></iconify-icon>'
      : ''
    const href = `/categories/?category=${encodeURIComponent(category)}`
    return `${sep}<a class="sakura-post-categories__link" href="${escapeHtml(href)}">${icon}<span>${escapeHtml(category)}</span></a>`
  }).join('')
}

function renderHomeCardCoverHtml(post) {
  if (!post.cover) return ''
  const src = escapeHtml(post.cover)
  const title = escapeHtml(post.title || '')
  if (post.coverIsVideo) {
    return `<video class="sakura-cover-thumb sakura-lazy-img" src="${src}" muted playsinline preload="metadata" disablepictureinpicture aria-hidden="true"></video>`
  }
  return `<img class="sakura-lazy-img" src="${src}" alt="${title}" loading="lazy" decoding="async">`
}

function createHomeCardsItem(post) {
  const side = (post.index % 2 === 0) ? 'left' : 'right'
  const article = document.createElement('article')
  article.className = `sakura-post-card ${side}${post.pinned ? ' is-pinned' : ''}`
  const pinHtml = post.pinned
    ? '<span class="sakura-post-pin" title="置顶" aria-label="置顶"><iconify-icon icon="mdi:pin" aria-hidden="true"></iconify-icon></span>'
    : ''
  const categoriesHtml = renderHomeCardCategoriesHtml(post.categories)
  const metaHtml = categoriesHtml
    ? `<div class="sakura-post-meta"><div class="sakura-post-categories">${categoriesHtml}</div></div>`
    : '<div class="sakura-post-meta"></div>'
  article.innerHTML = `
    ${pinHtml}
    <a class="sakura-post-card__cover aspect-video" href="${escapeHtml(post.url)}">
      ${renderHomeCardCoverHtml(post)}
    </a>
    <div class="sakura-post-card__content has-cover">
      <div class="sakura-post-card-info">
        <div class="sakura-post-date post-date">
          <span class="sakura-post-date__inner" title="编辑于${escapeHtml(post.date || '')}">
            <iconify-icon icon="mdi:clock-outline" class="sakura-icon sakura-post-date__icon" aria-hidden="true"></iconify-icon>
            <span class="sakura-post-date__label">编辑于</span>
            <time datetime="${escapeHtml(post.dateTime || post.date || '')}"${post.dateOnly ? ' data-date-only="true"' : ''} itemprop="dateModified">${escapeHtml(post.date || '')}</time>
          </span>
        </div>
        <h2 class="sakura-post-title sakura-post-card__title">
          <a href="${escapeHtml(post.url)}" aria-label="阅读全文：${escapeHtml(post.title)}">${escapeHtml(post.title)}</a>
        </h2>
        ${metaHtml}
        <div class="sakura-post-excerpt sakura-post-card__excerpt"></div>
      </div>
    </div>
  `
  return article
}

export function initHomeCardsLoadMore() {
  const layout = document.querySelector('.sakura-home-layout[data-mobile-cards-paging="loadMore"]')
  const list = document.getElementById('home-cards-list')
  const dataEl = document.getElementById('home-cards-more-data')
  const sentinel = document.getElementById('home-cards-scroll-sentinel')
  const statusEl = document.getElementById('home-cards-load-status')
  const root = document.getElementById('home-post-list')
  if (!layout || !list || !dataEl || !sentinel || !root) return

  let posts = []
  try {
    posts = parseJsonData(dataEl)
  } catch (err) {
    console.warn('[home-cards]', err)
    sentinel.remove()
    statusEl?.remove()
    return
  }

  if (!posts.length) {
    sentinel.remove()
    dataEl.remove()
    statusEl?.remove()
    return
  }

  const batchSize = Math.max(1, parseInt(sentinel.dataset.batchSize || '10', 10) || 10)
  let loading = false
  let autoLoadPaused = false
  let observing = false
  let scrollObserver = null
  let resizeObserverBound = false

  const setStatus = (mode) => {
    if (!statusEl) return
    if (mode === 'idle') {
      statusEl.hidden = true
      statusEl.textContent = ''
      statusEl.classList.remove('is-loading', 'is-done')
      return
    }
    statusEl.hidden = false
    statusEl.classList.toggle('is-loading', mode === 'loading')
    statusEl.classList.toggle('is-done', mode === 'done')
    statusEl.textContent = mode === 'loading' ? '加载中…' : '没有更多了'
  }

  const finish = () => {
    scrollObserver?.disconnect()
    observing = false
    sentinel.remove()
    dataEl.remove()
    setStatus('done')
  }

  const isMobileCardsContext = () => window.matchMedia(MOBILE_CARDS_MQ).matches

  const isSentinelNearViewport = () => {
    if (!sentinel.isConnected) return false
    return sentinel.getBoundingClientRect().top <= window.innerHeight + 320
  }

  const loadNextBatch = ({ force = false } = {}) => {
    if (!isMobileCardsContext() || loading || (!force && autoLoadPaused) || !posts.length) return
    loading = true
    setStatus('loading')

    const batch = posts.slice(0, batchSize)
    posts = posts.slice(batchSize)

    const newCards = []
    batch.forEach((post) => {
      const item = createHomeCardsItem(post)
      list.appendChild(item)
      newCards.push(item)
    })

    initLazyImages(list)
    initHomeMobileListTimes(layout)
    syncHomeMobileListPins()
    observeHomePostListReveal(root, newCards)

    if (!posts.length) {
      finish()
    } else {
      setStatus('idle')
    }

    loading = false

    if (posts.length && isSentinelNearViewport() && force) {
      loadNextBatch({ force: true })
    }
  }

  const startObserving = () => {
    if (!isMobileCardsContext() || observing || !sentinel.isConnected) return
    scrollObserver?.observe(sentinel)
    observing = true
  }

  const stopObserving = () => {
    if (!observing) return
    scrollObserver?.disconnect()
    observing = false
    setStatus('idle')
  }

  scrollObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadNextBatch()
  }, {
    root: null,
    rootMargin: '0px 0px 320px 0px',
    threshold: 0,
  })

  const syncMobileState = () => {
    if (isMobileCardsContext()) {
      startObserving()
      if (isSentinelNearViewport() && !autoLoadPaused) loadNextBatch()
    } else {
      stopObserving()
    }
  }

  if (!resizeObserverBound) {
    resizeObserverBound = true
    window.addEventListener('resize', syncMobileState, { passive: true })
    registerPageCleanup(() => {
      window.removeEventListener('resize', syncMobileState)
    })
  }

  homeCardsLoader = {
    loadNextBatch,
    hasMore: () => posts.length > 0,
    pauseAutoLoad: () => {
      autoLoadPaused = true
    },
    resumeAutoLoad: () => {
      autoLoadPaused = false
      if (isSentinelNearViewport()) loadNextBatch()
    },
  }

  syncMobileState()

  registerPageCleanup(() => {
    scrollObserver?.disconnect()
    homeCardsLoader = null
  })
}

export function initHomeTimelineLoadMore() {
  const list = document.getElementById('home-timeline-list')
  const dataEl = document.getElementById('home-timeline-more-data')
  const sentinel = document.getElementById('home-timeline-scroll-sentinel')
  const statusEl = document.getElementById('home-timeline-load-status')
  const root = document.getElementById('home-post-list')
  if (!list || !dataEl || !sentinel || !root) return

  let posts = []
  try {
    posts = parseJsonData(dataEl)
  } catch (err) {
    console.warn('[home-timeline]', err)
    sentinel.remove()
    statusEl?.remove()
    return
  }

  if (!posts.length) {
    sentinel.remove()
    dataEl.remove()
    statusEl?.remove()
    return
  }

  const batchSize = Math.max(1, parseInt(sentinel.dataset.batchSize || '10', 10) || 10)
  let loading = false
  let autoLoadPaused = false
  let observing = false

  const setStatus = (mode) => {
    if (!statusEl) return
    if (mode === 'idle') {
      statusEl.hidden = true
      statusEl.textContent = ''
      statusEl.classList.remove('is-loading', 'is-done')
      return
    }
    statusEl.hidden = false
    statusEl.classList.toggle('is-loading', mode === 'loading')
    statusEl.classList.toggle('is-done', mode === 'done')
    statusEl.textContent = mode === 'loading' ? '加载中…' : '没有更多了'
  }

  const finish = () => {
    scrollObserver.disconnect()
    observing = false
    sentinel.remove()
    dataEl.remove()
    setStatus('done')
  }

  const isSentinelNearViewport = () => {
    if (!sentinel.isConnected) return false
    return sentinel.getBoundingClientRect().top <= window.innerHeight + 320
  }

  const loadNextBatch = ({ force = false } = {}) => {
    if (loading || (!force && autoLoadPaused) || !posts.length) return
    loading = true
    setStatus('loading')

    const batch = posts.slice(0, batchSize)
    posts = posts.slice(batchSize)

    const newCards = []
    batch.forEach((post) => {
      const item = createHomeTimelineItem(post)
      list.appendChild(item)
      const content = item.querySelector('.home-timeline-item__content')
      if (content) newCards.push(content)
    })

    observeHomePostListReveal(root, newCards)

    if (!posts.length) {
      finish()
    } else {
      setStatus('idle')
    }

    loading = false

    if (posts.length && isSentinelNearViewport() && (force || !autoLoadPaused)) {
      loadNextBatch({ force })
    }
  }

  const scrollObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadNextBatch()
  }, {
    root: null,
    rootMargin: '0px 0px 320px 0px',
    threshold: 0,
  })

  const startObserving = () => {
    if (observing || !sentinel.isConnected) return
    scrollObserver.observe(sentinel)
    observing = true
  }

  homeTimelineLoader = {
    loadNextBatch,
    hasMore: () => posts.length > 0,
    startObserving,
    pauseAutoLoad: () => {
      autoLoadPaused = true
    },
    resumeAutoLoad: () => {
      autoLoadPaused = false
      if (isSentinelNearViewport()) loadNextBatch()
    },
  }

  startObserving()

  registerPageCleanup(() => {
    scrollObserver.disconnect()
    homeTimelineLoader = null
  })
}

export function cleanupHomeObservers() {
  homePostListRevealObserver?.disconnect()
  homePostListRevealObserver = null
}
