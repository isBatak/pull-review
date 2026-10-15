import type { ReactNode } from 'react'
import { css, cx } from 'styled-system/css'
import { tab as tabRecipe } from 'styled-system/recipes'

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
          className={tabRecipe({ size })}
        >
          {tab.label}
          <TabCount value={tab.count} />
          {tab.badge}
        </button>
      ))}
    </div>
  )
}
