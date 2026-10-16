import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { css } from 'styled-system/css'
import { WithTooltip } from './ui/button'

const group = css({
  display: 'inline-flex',
  alignItems: 'stretch',
  h: '7',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  bg: 'bg.surface',
  overflow: 'hidden',
  fontSize: 'xs',
  '& > * + *': { borderLeftWidth: '1px', borderColor: 'border.default' },
})

const segment = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1.5',
  minW: '7',
  px: '2',
  color: 'fg.muted',
  cursor: 'pointer',
  _hover: { _enabled: { bg: 'bg.muted', color: 'fg.default' } },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
  _focusVisible: { outline: '2px solid', outlineColor: 'accent.default', outlineOffset: '-2px' },
  '& svg': { w: '3.5', h: '3.5' },
})

interface FindingNavigatorProps {
  count: number
  index: number
  onJump: (index: number) => void
}

export function FindingNavigator({ count, index, onJump }: FindingNavigatorProps) {
  const position = index < 0 ? '–' : String(index + 1)
  const previous = index <= 0 ? count - 1 : index - 1
  const next = index < 0 || index >= count - 1 ? 0 : index + 1

  return (
    <div role="group" aria-label="Claude findings" className={group}>
      <WithTooltip label="Previous finding">
        <button type="button" aria-label="Previous finding" className={segment} disabled={!count} onClick={() => onJump(previous)}>
          <ChevronUp />
        </button>
      </WithTooltip>
      <WithTooltip label="Next finding">
        <button type="button" aria-label="Next finding" className={segment} disabled={!count} onClick={() => onJump(next)}>
          <ChevronDown />
        </button>
      </WithTooltip>
      <WithTooltip label={index < 0 ? 'Jump to the first finding' : 'Jump back to this finding'}>
        <button type="button" className={segment} disabled={!count} onClick={() => onJump(Math.max(0, index))}>
          <Sparkles />
          <span className={css({ fontVariantNumeric: 'tabular-nums', fontWeight: 'medium', color: 'fg.default' })}>
            {position}/{count}
          </span>
        </button>
      </WithTooltip>
    </div>
  )
}
