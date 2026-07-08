
import { cleanupPageComments, initPageComments } from './comments.js'
import { runPageCleanups } from './page-cleanup.js'
import { bootShell, bindCopyYmlBtn } from './shell.js'
import { updateSidebarNavActive } from './sidebar.js'
import { refreshHomeNavbar, refreshMobileNavbarCollapse } from './navbar.js'
import { bindHeroScrollDown, initHeroMedia, initHeroHitokoto, cleanupHero } from './hero.js'
import { initLazyImages } from './lazy-images.js'
import {
  initMarkdownCodeBlocks,
  initPostSponsor,
  initPostImageRows,
  initPostToc,
  initPostAiSummary,
  initAlbumPasswordGate,
} from './post-content.js'
import { initNoticeBoard } from './notice-board.js'
import { initSiteRuntime } from './site-runtime.js'
import {
  initHomePaginationScroll,
  initHomePostListScrollAnimation,
  initHomeTimelineLoadMore,
  initHomeCardsLoadMore,
  refreshMobileCardsListPage,
  cleanupHomeObservers,
} from './home.js'
import { customizeTwikooCommentForm, observeTwikooCommentForm, cleanupTwikooFormObserver } from './twikoo-form.js'
import { initLightbox, initAlbumVideoThumbs, cleanupLightbox } from './lightbox.js'
import { initCharts, cleanupCharts } from './charts.js'
import { initFooterLinks, initLinksPreviewShuffle, initLinksRssSpotlight, cleanupLinksRssSpotlight } from './links.js'
import { initMomentsModule, initExcalidrawModule, initGalleryPostModule } from './lazy-modules.js'
import { isPjaxContentMounting } from './page-nav.js'
import { initSearchPage } from './search-page.js'
import { initEnvelope, initEnvelopeDanmaku } from './envelope.js'
import { cancelTypeWriter } from './typewriter.js'

function unmountPage() {
  runPageCleanups()
  cleanupHero()
  cleanupCharts()
  cleanupTwikooFormObserver()
  cleanupPageComments()
  cleanupLinksRssSpotlight()
  cleanupHomeObservers()
  cleanupLightbox()
  cancelTypeWriter()
  refreshHomeNavbar?.()
  refreshMobileNavbarCollapse?.()
}

function mountPage() {
  updateSidebarNavActive()
  initHeroMedia()
  initHeroHitokoto()
  initLazyImages()
  initMarkdownCodeBlocks()
  initPostSponsor()
  bindHeroScrollDown()
  initNoticeBoard()
  initSiteRuntime()
  initHomePaginationScroll()
  initHomePostListScrollAnimation()
  initHomeTimelineLoadMore()
  initHomeCardsLoadMore()
  refreshMobileCardsListPage()
  initPostToc()
  initPageComments({
    onTwikooReady: () => {
      customizeTwikooCommentForm()
      observeTwikooCommentForm()
    },
  })
  initAlbumPasswordGate()
  initPostImageRows()
  initPostAiSummary()
  initLightbox()
  initAlbumVideoThumbs()
  void initCharts().catch((err) => console.warn('[charts]', err))
  initFooterLinks()
  initLinksPreviewShuffle()
  initLinksRssSpotlight()
  if (!isPjaxContentMounting()) {
    void initMomentsModule().catch((err) => console.warn('[moments]', err))
    void initExcalidrawModule().catch((err) => console.warn('[excalidraw]', err))
    void initGalleryPostModule().catch((err) => console.warn('[gallery-post]', err))
  }
  void initSearchPage().catch((err) => console.warn('[search]', err))
  initEnvelope()
  initEnvelopeDanmaku()
  window.SignatureWidget?.boot()
  bindCopyYmlBtn()
  refreshHomeNavbar?.()
  refreshMobileNavbarCollapse?.()
}

document.addEventListener('DOMContentLoaded', () => {
  bootShell({ mountPage, unmountPage })
  mountPage()
})
