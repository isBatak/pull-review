import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useStoredState } from './stored-state'

export const ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const
export type ZoomLevel = typeof ZOOM_LEVELS[number]

const ROOT_FONT_SIZE = 14
const CODE_FONT_FAMILY = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

function isZoomLevel(value: unknown): value is ZoomLevel {
  return ZOOM_LEVELS.includes(value as ZoomLevel)
}

export function stepZoom(zoom: ZoomLevel, step: -1 | 1): ZoomLevel {
  const index = ZOOM_LEVELS.indexOf(zoom) + step
  return ZOOM_LEVELS[Math.min(Math.max(index, 0), ZOOM_LEVELS.length - 1)]!
}

export function formatZoom(zoom: number) {
  return `${Math.round(zoom * 100)}%`
}

export function useZoom(): [ZoomLevel, (zoom: ZoomLevel) => void] {
  const [stored, setStored] = useStoredState<number>('pull-review:zoom', 1)
  return [isZoomLevel(stored) ? stored : 1, setStored]
}

export function codeMetrics(zoom: number, fontSize: number, lineHeight: number) {
  return { fontSize: Math.round(fontSize * zoom * 10) / 10, lineHeight: Math.round(lineHeight * zoom) }
}

export function useCodeStyle(fontSize = 12, lineHeight = 20) {
  const [zoom] = useZoom()
  return useMemo(() => {
    const metrics = codeMetrics(zoom, fontSize, lineHeight)
    return {
      '--diffs-font-family': CODE_FONT_FAMILY,
      '--diffs-font-size': `${metrics.fontSize}px`,
      '--diffs-line-height': `${metrics.lineHeight}px`,
    } as React.CSSProperties
  }, [zoom, fontSize, lineHeight])
}

function zoomStep(event: KeyboardEvent): -1 | 0 | 1 | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey)
    return null
  if (event.key === '=' || event.key === '+')
    return 1
  if (event.key === '-' || event.key === '_')
    return -1
  if (event.key === '0')
    return 0
  return null
}

export function useZoomController() {
  const [zoom, setZoom] = useZoom()

  useLayoutEffect(() => {
    document.documentElement.style.fontSize = `${ROOT_FONT_SIZE * zoom}px`
  }, [zoom])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const step = zoomStep(event)
      if (step === null)
        return
      event.preventDefault()
      setZoom(step === 0 ? 1 : stepZoom(zoom, step))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoom, setZoom])
}
