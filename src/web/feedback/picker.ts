import { SELF_IMPROVE_UI_ATTRIBUTE, SOURCE_ATTRIBUTE } from '../../shared/self-improve'

export interface PickerOptions {
  onPick: (element: Element) => void
  onCancel: () => void
}

const OVERLAY_STYLES = `
  :host { all: initial; position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; }
  .box { position: fixed; display: none; box-sizing: border-box; border-radius: 3px; }
  .outline { border: 1.5px solid #6366f1; background: rgb(99 102 241 / 0.12); }
  .margin { border-style: solid; border-color: rgb(249 115 22 / 0.35); }
  .padding { border-style: solid; border-color: rgb(34 197 94 / 0.35); background: rgb(99 102 241 / 0.10); }
  .label { position: fixed; display: none; padding: 3px 6px; border-radius: 4px; background: #4f46e5; color: #fff;
    font: 500 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; box-shadow: 0 2px 8px rgb(0 0 0 / 0.25); }
`

const CURSOR_STYLES = `*:not([${SELF_IMPROVE_UI_ATTRIBUTE}], [${SELF_IMPROVE_UI_ATTRIBUTE}] *) { cursor: crosshair !important; }`

const BLOCKED_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu'] as const

function px(value: string) {
  return Number.parseFloat(value) || 0
}

function sides(style: CSSStyleDeclaration, prefix: 'margin' | 'padding' | 'border') {
  const suffix = prefix === 'border' ? '-width' : ''
  return {
    top: px(style.getPropertyValue(`${prefix}-top${suffix}`)),
    right: px(style.getPropertyValue(`${prefix}-right${suffix}`)),
    bottom: px(style.getPropertyValue(`${prefix}-bottom${suffix}`)),
    left: px(style.getPropertyValue(`${prefix}-left${suffix}`)),
  }
}

function shortSides({ top, right, bottom, left }: ReturnType<typeof sides>) {
  if (top === bottom && left === right)
    return top === left ? `${top}` : `${top} ${left}`
  return `${top} ${right} ${bottom} ${left}`
}

function isOwnUi(node: EventTarget | null) {
  return node instanceof Element && Boolean(node.closest(`[${SELF_IMPROVE_UI_ATTRIBUTE}]`))
}

function createOverlay() {
  const host = document.createElement('self-improve-overlay')
  host.setAttribute(SELF_IMPROVE_UI_ATTRIBUTE, '')
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = OVERLAY_STYLES
  const [margin, padding, outline, label] = ['box margin', 'box padding', 'box outline', 'label'].map((className) => {
    const element = document.createElement('div')
    element.className = className
    return element
  }) as [HTMLDivElement, HTMLDivElement, HTMLDivElement, HTMLDivElement]
  root.append(style, margin, padding, outline, label)
  document.documentElement.append(host)

  function place(element: HTMLElement, left: number, top: number, width: number, height: number) {
    Object.assign(element.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${Math.max(0, width)}px`, height: `${Math.max(0, height)}px` })
  }

  function hide() {
    for (const element of [margin, padding, outline, label])
      element.style.display = 'none'
  }

  function show(target: Element, measure: boolean) {
    hide()
    const rect = target.getBoundingClientRect()
    const style = getComputedStyle(target)
    const source = target.getAttribute(SOURCE_ATTRIBUTE) ?? ''
    if (measure) {
      const m = sides(style, 'margin')
      const p = sides(style, 'padding')
      const b = sides(style, 'border')
      place(margin, rect.left - m.left, rect.top - m.top, rect.width + m.left + m.right, rect.height + m.top + m.bottom)
      margin.style.borderWidth = `${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`
      place(padding, rect.left + b.left, rect.top + b.top, rect.width - b.left - b.right, rect.height - b.top - b.bottom)
      padding.style.borderWidth = `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`
      label.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}  padding ${shortSides(p)}  margin ${shortSides(m)}${style.gap && style.gap !== 'normal' ? `  gap ${style.gap}` : ''}`
    }
    else {
      place(outline, rect.left, rect.top, rect.width, rect.height)
      label.textContent = `${target.tagName.toLowerCase()}  ${source}`
    }
    label.style.display = 'block'
    const labelHeight = label.offsetHeight
    const top = rect.top - labelHeight - 6 >= 0 ? rect.top - labelHeight - 6 : Math.min(rect.bottom + 6, innerHeight - labelHeight - 4)
    const left = Math.min(Math.max(4, rect.left), innerWidth - label.offsetWidth - 4)
    Object.assign(label.style, { top: `${top}px`, left: `${left}px` })
  }

  return { show, hide, remove: () => host.remove() }
}

export function startPicker({ onPick, onCancel }: PickerOptions) {
  const overlay = createOverlay()
  const cursor = document.createElement('style')
  cursor.textContent = CURSOR_STYLES
  document.head.append(cursor)

  let pointer: { x: number, y: number } | null = null
  let target: Element | null = null
  let measure = false

  function targetAt(x: number, y: number) {
    const element = document.elementFromPoint(x, y)
    return element && !isOwnUi(element) ? element.closest(`[${SOURCE_ATTRIBUTE}]`) : null
  }

  function refresh() {
    target = pointer ? targetAt(pointer.x, pointer.y) : null
    if (target)
      overlay.show(target, measure)
    else
      overlay.hide()
  }

  function onPointerMove(event: PointerEvent) {
    pointer = { x: event.clientX, y: event.clientY }
    measure = event.altKey
    refresh()
  }

  function block(event: Event) {
    if (isOwnUi(event.target))
      return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function onClick(event: MouseEvent) {
    if (isOwnUi(event.target))
      return
    block(event)
    const picked = targetAt(event.clientX, event.clientY)
    if (picked)
      onPick(picked)
  }

  function onKey(event: KeyboardEvent) {
    if (event.type === 'keydown' && event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key === 'Alt') {
      event.preventDefault()
      measure = event.type === 'keydown'
      refresh()
    }
  }

  const listeners: Array<[string, EventListener]> = [
    ['pointermove', onPointerMove as EventListener],
    ['click', onClick as EventListener],
    ['keydown', onKey as EventListener],
    ['keyup', onKey as EventListener],
    ['scroll', refresh],
    ['resize', refresh],
    ...BLOCKED_EVENTS.map(type => [type, block] as [string, EventListener]),
  ]
  for (const [type, listener] of listeners)
    window.addEventListener(type, listener, true)

  return function stop() {
    for (const [type, listener] of listeners)
      window.removeEventListener(type, listener, true)
    overlay.remove()
    cursor.remove()
  }
}
