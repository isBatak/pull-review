import type { FeedbackContext, PickedElement } from '../../shared/self-improve'
import { elementLabel, elementText, KEY_STYLES, SOURCE_ATTRIBUTE, trimHtml } from '../../shared/self-improve'

const SELECTOR_DEPTH = 5

function cssPath(element: Element) {
  const parts: string[] = []
  for (let node: Element | null = element; node && node !== document.body && parts.length < SELECTOR_DEPTH; node = node.parentElement) {
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`)
      break
    }
    const tag = node.tagName.toLowerCase()
    const siblings = node.parentElement ? [...node.parentElement.children].filter(child => child.tagName === node!.tagName) : []
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag)
  }
  return parts.join(' > ')
}

export function describeElement(element: Element): PickedElement {
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  const text = element instanceof HTMLElement ? element.innerText : element.textContent ?? ''
  return {
    label: elementLabel({ ariaLabel: element.getAttribute('aria-label'), text, tag: element.tagName }),
    source: element.getAttribute(SOURCE_ATTRIBUTE),
    selector: cssPath(element),
    text: elementText(text),
    html: trimHtml(element.outerHTML),
    styles: Object.fromEntries(KEY_STYLES.map(name => [name, style.getPropertyValue(name)])),
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
  }
}

export function buildFeedbackContext(element: Element | null, theme: 'light' | 'dark', screenshot: string | null): FeedbackContext {
  return {
    appVersion: __APP_VERSION__,
    page: { route: location.hash.replace(/^#/, '') || location.pathname, title: document.title },
    viewport: { width: innerWidth, height: innerHeight },
    theme,
    element: element ? describeElement(element) : null,
    screenshot,
  }
}
