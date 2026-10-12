import type { SizeDelta } from '../../../shared/bundle'
import { css, cx } from 'styled-system/css'
import { formatDeltaBytes, formatPercentChange } from '../../lib/bytes'

const pill = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  px: '1.5',
  h: '5',
  borderRadius: 'sm',
  fontSize: 'xs',
  fontWeight: 'semibold',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
})

export function DeltaPill({ value, className }: { value: SizeDelta, className?: string }) {
  if (value.kind === 'added')
    return <span className={cx(pill, css({ bg: 'danger.subtle', color: 'danger.fg' }), className)}>New</span>
  if (value.kind === 'removed')
    return <span className={cx(pill, css({ bg: 'success.subtle', color: 'success.fg' }), className)}>Removed</span>
  if (value.kind === 'same')
    return <span className={cx(pill, css({ color: 'fg.subtle', fontWeight: 'medium' }), className)}>{value.delta === 0 ? 'No change' : formatDeltaBytes(value.delta)}</span>
  const grew = value.delta > 0
  const percent = formatPercentChange(value.delta, value.base)
  return (
    <span className={cx(pill, grew ? css({ bg: 'danger.subtle', color: 'danger.fg' }) : css({ bg: 'success.subtle', color: 'success.fg' }), className)}>
      {formatDeltaBytes(value.delta)}
      {percent && <span className={css({ fontWeight: 'medium', opacity: 0.8 })}>{percent}</span>}
    </span>
  )
}
