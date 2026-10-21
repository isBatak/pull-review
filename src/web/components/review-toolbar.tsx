import type { DiffLayout, ThemeMode } from '../lib/preferences'
import { Columns2, ExternalLink, Moon, RefreshCw, Rows2, Settings, Sparkles, Sun, WrapText } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { css, cx } from 'styled-system/css'
import { openExternal } from '../lib/platform'
import { IconButton } from './ui/button'
import { Segmented } from './ui/segmented'

interface ReviewToolbarProps {
  layout: DiffLayout
  onLayoutChange: (layout: DiffLayout) => void
  wrap: boolean
  onWrapChange: (wrap: boolean) => void
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
  onRefresh: () => void
  refreshing: boolean
  webUrl: string
  chatOpen: boolean | null
  onChatOpenChange: (open: boolean) => void
  onOpenSettings: () => void
}

const panel = css({
  position: 'absolute',
  bottom: '2',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 'sticky',
  display: 'flex',
  alignItems: 'center',
  gap: '1',
  p: '1.5',
  bg: 'bg.surface',
  borderRadius: 'xl',
  boxShadow: 'inset 0 0 0 1px color-mix(in srgb, token(colors.fg.default) 6%, transparent), token(shadows.popover)',
})

const tool = css({
  w: '8',
  h: '8',
  px: '0',
  borderRadius: 'lg',
  '& svg': { w: '4', h: '4' },
})

const active = css({
  bg: 'bg.muted',
  color: 'accent.default',
  _hover: { _enabled: { bg: 'bg.muted', color: 'accent.default' } },
})

const SHORTCUTS = {
  split: 'S',
  unified: 'U',
  wrap: 'W',
  theme: 'T',
  reload: 'R',
  gitlab: 'G',
  chat: 'C',
  settings: ',',
} as const

function isTyping(event: KeyboardEvent) {
  const target = event.composedPath()[0]
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

function dialogOpen() {
  return document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') !== null
}

function useToolbarShortcuts(props: ReviewToolbarProps) {
  const latest = useRef(props)
  latest.current = props
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTyping(event) || dialogOpen())
        return
      const current = latest.current
      const actions: Record<string, () => void> = {
        [SHORTCUTS.split]: () => current.onLayoutChange('split'),
        [SHORTCUTS.unified]: () => current.onLayoutChange('unified'),
        [SHORTCUTS.wrap]: () => current.onWrapChange(!current.wrap),
        [SHORTCUTS.theme]: () => current.onThemeChange(current.theme === 'dark' ? 'light' : 'dark'),
        [SHORTCUTS.reload]: () => !current.refreshing && current.onRefresh(),
        [SHORTCUTS.gitlab]: () => openExternal(current.webUrl),
        [SHORTCUTS.settings]: current.onOpenSettings,
        ...(current.chatOpen !== null ? { [SHORTCUTS.chat]: () => current.onChatOpenChange(!current.chatOpen) } : {}),
      }
      const action = actions[event.key.toUpperCase()]
      if (!action)
        return
      event.preventDefault()
      action()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}

function Divider() {
  return <span aria-hidden className={css({ alignSelf: 'stretch', w: '1px', mx: '1', my: '1', bg: 'border.default' })} />
}

export function ReviewToolbar(props: ReviewToolbarProps) {
  const { layout, wrap, theme, refreshing, chatOpen } = props
  useToolbarShortcuts(props)
  return (
    <div role="toolbar" aria-label="Review tools" className={panel}>
      <Segmented
        label="Diff layout"
        value={layout}
        onChange={props.onLayoutChange}
        items={[
          { value: 'split', label: <Columns2 />, title: 'Split view', shortcut: SHORTCUTS.split },
          { value: 'unified', label: <Rows2 />, title: 'Unified view', shortcut: SHORTCUTS.unified },
        ]}
      />
      <IconButton label={wrap ? 'Disable line wrap' : 'Wrap long lines'} shortcut={SHORTCUTS.wrap} aria-pressed={wrap} onClick={() => props.onWrapChange(!wrap)} className={cx(tool, wrap && active)}>
        <WrapText />
      </IconButton>
      <Divider />
      <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} shortcut={SHORTCUTS.theme} onClick={() => props.onThemeChange(theme === 'dark' ? 'light' : 'dark')} className={tool}>
        {theme === 'dark' ? <Sun /> : <Moon />}
      </IconButton>
      <IconButton label="Reload from GitLab" shortcut={SHORTCUTS.reload} onClick={props.onRefresh} disabled={refreshing} className={tool}>
        <RefreshCw className={refreshing ? css({ animation: 'spin' }) : undefined} />
      </IconButton>
      <IconButton label="Open in GitLab" shortcut={SHORTCUTS.gitlab} onClick={() => openExternal(props.webUrl)} className={tool}>
        <ExternalLink />
      </IconButton>
      <Divider />
      {chatOpen !== null && (
        <IconButton label={chatOpen ? 'Close Claude chat' : 'Ask Claude about this merge request'} shortcut={SHORTCUTS.chat} aria-pressed={chatOpen} onClick={() => props.onChatOpenChange(!chatOpen)} className={cx(tool, chatOpen && active)}>
          <Sparkles />
        </IconButton>
      )}
      <IconButton label="Settings" shortcut={SHORTCUTS.settings} onClick={props.onOpenSettings} className={tool}>
        <Settings />
      </IconButton>
    </div>
  )
}
