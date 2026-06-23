import { createElement } from 'react'

export function renderBoldText(html) {
  const decoded = String(html)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const parts = decoded.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split(/<b>|<\/b>/i)
  return parts.map((part, i) =>
    i % 2 === 1 ? createElement('strong', { key: i }, part) : part
  )
}
