import type { ReactNode } from 'react'
import { SegmentGroup } from '@ark-ui/react/segment-group'
import { segmented } from 'styled-system/recipes'

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  items: { value: T, label: ReactNode, title?: string }[]
  label: string
}

export function Segmented<T extends string>({ value, onChange, items, label }: SegmentedProps<T>) {
  const classes = segmented()
  return (
    <SegmentGroup.Root
      value={value}
      onValueChange={details => details.value && onChange(details.value as T)}
      className={classes.root}
      aria-label={label}
    >
      <SegmentGroup.Indicator className={classes.indicator} />
      {items.map(entry => (
        <SegmentGroup.Item key={entry.value} value={entry.value} className={classes.item} title={entry.title}>
          <SegmentGroup.ItemText className={classes.itemText}>{entry.label}</SegmentGroup.ItemText>
          <SegmentGroup.ItemControl />
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  )
}
