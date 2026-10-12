import type { ReactNode } from 'react'
import { SegmentGroup } from '@ark-ui/react/segment-group'
import { css } from 'styled-system/css'

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
  gap: '1',
  h: '6',
  px: '2',
  fontSize: 'xs',
  fontWeight: 'medium',
  color: 'fg.muted',
  cursor: 'pointer',
  borderRadius: 'sm',
  _checked: { color: 'fg.default' },
  '& svg': { w: '3.5', h: '3.5' },
})

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  items: { value: T, label: ReactNode, title?: string }[]
  label: string
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
        <SegmentGroup.Item key={entry.value} value={entry.value} className={item} title={entry.title}>
          <SegmentGroup.ItemText>{entry.label}</SegmentGroup.ItemText>
          <SegmentGroup.ItemControl />
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  )
}
