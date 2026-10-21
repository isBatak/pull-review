import type { ReactNode } from 'react'
import { css, cx } from 'styled-system/css'

const numberFormat = new Intl.NumberFormat('en')

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  count?: number | null
  badge?: ReactNode
}

export function TabCount({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined)
    return null
  return (
    <span className={css({ minW: '5', px: '1.5', h: '5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'full', bg: 'color-mix(in srgb, token(colors.fg.default) 10%, transparent)', color: 'fg.muted', fontSize: '2xs', fontWeight: 'semibold', fontVariantNumeric: 'tabular-nums' })}>
      {numberFormat.format(value)}
    </span>
  )
}

export type FolderLayer = 'surface' | 'subtle' | 'canvas'

const LAYER_BG: Record<FolderLayer, string> = {
  surface: css({ '--folder-tab-bg': 'token(colors.bg.surface)' }),
  subtle: css({ '--folder-tab-bg': 'token(colors.bg.subtle)' }),
  canvas: css({ '--folder-tab-bg': 'token(colors.bg.canvas)' }),
}

// The bar that holds folder tabs draws the bottom line; an active tab overlaps it by 1px and covers it with the layer it opens into.
export const folderBar = css({ display: 'flex', alignItems: 'flex-end', gap: '3', borderBottomWidth: '1px', borderColor: 'border.default' })

const tab = css({
  position: 'relative',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2',
  fontWeight: 'medium',
  color: 'fg.muted',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  outline: 'none',
  borderWidth: '1px',
  borderBottomWidth: '0',
  borderColor: 'transparent',
  borderTopRadius: 'lg',
  isolation: 'isolate',
  _before: { content: '""', position: 'absolute', inset: '1', zIndex: '-1', borderRadius: 'md', transition: 'background 120ms' },
  _hover: { color: 'fg.default', _before: { bg: 'bg.muted' } },
  _focusVisible: { boxShadow: 'inset 0 0 0 2px token(colors.accent.default)' },
  '&[aria-selected=true]': {
    color: 'fg.default',
    bg: 'var(--folder-tab-bg)',
    borderColor: 'border.default',
    _before: { display: 'none' },
  },
})

const SIZES = {
  md: css({ h: '9', px: '3.5', fontSize: 'sm' }),
  sm: css({ h: '8', px: '3', fontSize: 'xs' }),
}

interface FolderTabsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  tabs: TabItem<T>[]
  label: string
  opensInto: FolderLayer
  size?: 'md' | 'sm'
  className?: string
}

export function FolderTabs<T extends string>({ value, onChange, tabs, label, opensInto, size = 'md', className }: FolderTabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cx(css({ display: 'flex', alignItems: 'flex-end', gap: '0.5', mb: '-1px', minW: '0', overflowX: 'auto', scrollbarWidth: 'none' }), LAYER_BG[opensInto], className)}>
      {tabs.map(entry => (
        <button
          key={entry.value}
          type="button"
          role="tab"
          aria-selected={value === entry.value}
          onClick={() => onChange(entry.value)}
          className={cx(tab, SIZES[size])}
        >
          {entry.label}
          <TabCount value={entry.count} />
          {entry.badge}
        </button>
      ))}
    </div>
  )
}
