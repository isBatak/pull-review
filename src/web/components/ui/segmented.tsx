import type { ReactNode } from 'react'
import { SegmentGroup } from '@ark-ui/react/segment-group'
import { css } from 'styled-system/css'
import { WithTooltip } from './button'

const root = css({
  position: 'relative',
  display: 'inline-flex',
  p: '0.5',
  gap: '0.5',
  bg: 'bg.muted',
  borderRadius: 'md',
})

const indicator = css({
  bg: 'bg.surface',
  borderRadius: 'sm',
  boxShadow: 'xs',
  width: 'var(--width)',
  height: 'var(--height)',
  top: 'var(--top)',
  left: 'var(--left)',
  transition: 'left 150ms, width 150ms',
})

const item = css({
  position: 'relative',
  zIndex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  h: '6',
  fontSize: 'xs',
  fontWeight: 'medium',
  color: 'fg.muted',
  cursor: 'pointer',
  borderRadius: 'sm',
  _checked: { color: 'fg.default' },
  '& svg': { w: '3.5', h: '3.5' },
})

const itemText = css({ display: 'inline-flex', h: 'full' })

const itemContent = css({ display: 'inline-flex', alignItems: 'center', gap: '1', h: 'full', px: '2' })

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  items: { value: T, label: ReactNode, title?: string, shortcut?: string }[]
  label: string
}

// The tooltip wraps an inner span because a trigger on the item itself would replace the ids the segment group uses to place its indicator.
function SegmentItem<T extends string>({ entry }: { entry: SegmentedProps<T>['items'][number] }) {
  const content = <span className={itemContent}>{entry.label}</span>
  return (
    <SegmentGroup.Item value={entry.value} className={item} aria-keyshortcuts={entry.shortcut}>
      <SegmentGroup.ItemText className={itemText}>
        {entry.title ? <WithTooltip label={entry.title} shortcut={entry.shortcut}>{content}</WithTooltip> : content}
      </SegmentGroup.ItemText>
      <SegmentGroup.ItemControl />
      <SegmentGroup.ItemHiddenInput />
    </SegmentGroup.Item>
  )
}

export function Segmented<T extends string>({ value, onChange, items, label }: SegmentedProps<T>) {
  return (
    <SegmentGroup.Root
      value={value}
      onValueChange={details => details.value && onChange(details.value as T)}
      className={root}
      aria-label={label}
    >
      <SegmentGroup.Indicator className={indicator} />
      {items.map(entry => (
        <SegmentItem key={entry.value} entry={entry} />
      ))}
    </SegmentGroup.Root>
  )
}
