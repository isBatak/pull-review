import { useEffect, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { useTheme } from '../../lib/preferences'
import { isTinyApp, transport } from '../../lib/platform'

const ICON_VERSION = 2

const iconClass = css({ w: '4', h: '4', flexShrink: 0, userSelect: 'none', pointerEvents: 'none' })

const bridgedIcons = new Map<string, Promise<string>>()

function bridgedIcon(path: string) {
  let pending = bridgedIcons.get(path)
  if (!pending) {
    pending = transport('GET', path)
      .then(response => response.text())
      .then(svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    bridgedIcons.set(path, pending)
  }
  return pending
}

function useIconSource(path: string) {
  const [source, setSource] = useState<string | null>(isTinyApp ? null : path)
  useEffect(() => {
    if (!isTinyApp) {
      setSource(path)
      return
    }
    let active = true
    void bridgedIcon(path).then((value) => {
      if (active)
        setSource(value)
    })
    return () => {
      active = false
    }
  }, [path])
  return source
}

function Icon({ path, className }: { path: string, className?: string }) {
  const source = useIconSource(path)
  if (!source)
    return <span aria-hidden className={cx(iconClass, css({ display: 'inline-block' }), className)} />
  return <img src={source} alt="" aria-hidden width={16} height={16} className={cx(iconClass, className)} />
}

export function FileIcon({ name, className }: { name: string, className?: string }) {
  const [theme] = useTheme()
  return <Icon path={`/icons/file/${encodeURIComponent(name)}?theme=${theme}&v=${ICON_VERSION}`} className={className} />
}

export function FolderIcon({ name, open, className }: { name: string, open: boolean, className?: string }) {
  const [theme] = useTheme()
  const leaf = name.slice(name.lastIndexOf('/') + 1)
  return <Icon path={`/icons/folder/${encodeURIComponent(leaf)}?theme=${theme}&v=${ICON_VERSION}${open ? '&open=1' : ''}`} className={className} />
}
