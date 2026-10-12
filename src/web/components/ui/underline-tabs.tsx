import type { ReactNode } from 'react'
import { css, cx } from 'styled-system/css'

const numberFormat = new Intl.NumberFormat('en')

export interface UnderlineTab<T extends string> {
  value: T
  label: ReactNode
  count?: number | null
  badge?: ReactNode
}

interface UnderlineTabsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  tabs: UnderlineTab<T>[]
  label: string
  size?: 'md' | 'sm'
  className?: string
}

export function TabCount({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined)
    return null
  return (
    <span className={css({ minW: '5', px: '1.5', h: '5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'full', bg: 'bg.muted', color: 'fg.muted', fontSize: '2xs', fontWeight: 'semibold', fontVariantNumeric: 'tabular-nums' })}>
      {numberFormat.format(value)}
    </span>
  )
}

export function UnderlineTabs<T extends string>({ value, onChange, tabs, label, size = 'md', className }: UnderlineTabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cx(css({ display: 'flex', gap: '1', overflowX: 'auto', scrollbarWidth: 'none' }), className)}>
      {tabs.map(tab => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={css({
            position: 'relative',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2',
            h: size === 'md' ? '10' : '8',
            px: size === 'md' ? '3' : '2.5',
            fontSize: size === 'md' ? 'sm' : 'xs',
            fontWeight: 'medium',
            color: 'fg.muted',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            outline: 'none',
            borderRadius: 'md',
            _hover: { color: 'fg.default' },
            _focusVisible: { boxShadow: 'inset 0 0 0 2px token(colors.accent.default)' },
            '&[aria-selected=true]': { color: 'fg.default' },
            '&[aria-selected=true]::after': { content: '""', position: 'absolute', insetInline: '2', bottom: '-1px', h: '2px', borderRadius: 'full', bg: 'accent.default' },
          })}
        >
          {tab.label}
          <TabCount value={tab.count} />
          {tab.badge}
        </button>
      ))}
    </div>
  )
}
