
export function preservePjaxHistoryState(url) {
  history.replaceState(
    { ...(history.state || {}), pjax: true, scrollY: window.scrollY },
    '',
    url,
  )
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function stripHtml(html) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

export function parseJsonData(el) {
  const raw = JSON.parse(el.textContent || '[]')
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

export function shuffleArray(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
