import type { DiffSide } from '../../shared/types'

export interface DiffTextSelection {
  side: DiffSide
  startLine: number | null
  endLine: number | null
  discussionIds: string[]
}

export type DiffTextSelectionResult = DiffTextSelection | 'outside' | 'cleared'

type ComposedSelection = Selection & {
  getComposedRanges?: (...args: unknown[]) => StaticRange[]
}

const EDGE_TOLERANCE_PX = 1

function shadowRootsIn(container: HTMLElement) {
  return [...container.querySelectorAll('*')].flatMap(element => element.shadowRoot ? [element.shadowRoot] : [])
}

function composedContains(container: HTMLElement, node: Node) {
  let current: Node | null = node
  while (current) {
    if (container.contains(current))
      return true
    const root = current.getRootNode()
    current = root instanceof ShadowRoot ? root.host : null
  }
  return false
}

function readRange(selection: ComposedSelection, shadowRoots: ShadowRoot[]): AbstractRange | null {
  if (selection.rangeCount === 0)
    return null
  if (!selection.getComposedRanges)
    return selection.getRangeAt(0)
  try {
    return selection.getComposedRanges({ shadowRoots })[0] ?? null
  }
  catch {
    return selection.getComposedRanges(...shadowRoots)[0] ?? null
  }
}

function elementAt(node: Node, offset: number, edge: 'start' | 'end') {
  if (node instanceof Element) {
    const child = node.childNodes[edge === 'start' ? offset : offset - 1]
    return child instanceof Element ? child : node
  }
  return node.parentElement
}

function sideOf(line: HTMLElement): DiffSide {
  if (line.closest('[data-deletions]'))
    return 'deletions'
  if (line.closest('[data-additions]'))
    return 'additions'
  return line.dataset.lineType === 'change-deletion' ? 'deletions' : 'additions'
}

function columnOf(element: Element | null): DiffSide | null {
  if (element?.closest('[data-deletions]'))
    return 'deletions'
  if (element?.closest('[data-additions]'))
    return 'additions'
  return null
}

function overlaps(rect: DOMRect, top: number, bottom: number) {
  return rect.height > 0 && rect.bottom > top + EDGE_TOLERANCE_PX && rect.top < bottom - EDGE_TOLERANCE_PX
}

function isTextField(element: Element | null): element is HTMLElement {
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement || (element instanceof HTMLElement && element.isContentEditable)
}

export function readDiffTextSelection(container: HTMLElement): DiffTextSelectionResult {
  const selection = document.getSelection() as ComposedSelection | null
  const active = document.activeElement
  if (isTextField(active))
    return 'outside'
  if (!selection || selection.rangeCount === 0)
    return 'cleared'
  // Shadow DOM selections are retargeted to their host here, which is inside the container, so this stays cheap for selections elsewhere.
  const touches = [selection.anchorNode, selection.focusNode].some(node => node && composedContains(container, node))
  if (!touches)
    return selection.isCollapsed ? 'cleared' : 'outside'
  const shadowRoots = shadowRootsIn(container)
  const range = selection && readRange(selection, shadowRoots)
  if (!range || range.collapsed)
    return 'cleared'
  const startInside = composedContains(container, range.startContainer)
  const endInside = composedContains(container, range.endContainer)
  if (!startInside && !endInside)
    return 'outside'

  const startElement = startInside ? elementAt(range.startContainer, range.startOffset, 'start') : null
  const endElement = endInside ? elementAt(range.endContainer, range.endOffset, 'end') : null
  const startRect = startElement?.getBoundingClientRect()
  const endRect = endElement?.getBoundingClientRect()
  // Slotted review threads sort after all shadow DOM lines, so a range can run visually upward.
  const top = startRect && endRect ? Math.min(startRect.top, endRect.top) : startRect?.top ?? -Infinity
  const bottom = startRect && endRect ? Math.max(startRect.bottom, endRect.bottom) : endRect?.bottom ?? Infinity

  const linesBySide: Record<DiffSide, number[]> = { additions: [], deletions: [] }
  for (const root of shadowRoots) {
    for (const line of root.querySelectorAll<HTMLElement>('[data-line]')) {
      const number = Number(line.dataset.line)
      if (Number.isInteger(number) && overlaps(line.getBoundingClientRect(), top, bottom))
        linesBySide[sideOf(line)].push(number)
    }
  }

  const discussionIds = [...container.querySelectorAll<HTMLElement>('[data-discussion-id]')]
    .filter(element => overlaps(element.getBoundingClientRect(), top, bottom))
    .map(element => element.dataset.discussionId!)

  const side = columnOf(startElement) ?? columnOf(endElement) ?? (linesBySide.additions.length ? 'additions' : 'deletions')
  const lines = linesBySide[side]
  if (!lines.length && !discussionIds.length)
    return 'cleared'
  return {
    side,
    startLine: lines.length ? Math.min(...lines) : null,
    endLine: lines.length ? Math.max(...lines) : null,
    discussionIds,
  }
}

export function sameTextSelection(a: DiffTextSelection | null, b: DiffTextSelection | null) {
  if (a === b)
    return true
  if (!a || !b)
    return false
  return a.side === b.side && a.startLine === b.startLine && a.endLine === b.endLine && a.discussionIds.join() === b.discussionIds.join()
}
