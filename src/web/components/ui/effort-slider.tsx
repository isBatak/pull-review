import { Slider } from '@ark-ui/react/slider'
import { css } from 'styled-system/css'
import { CHAT_EFFORTS } from '../../../shared/chat'

const THUMB_SIZE = 10
const PADDING = 2
const WIDTH = 52

const root = css({
  position: 'relative',
  display: 'inline-flex',
  flexShrink: 0,
  w: `${WIDTH}px`,
  p: `${PADDING}px`,
  bg: 'bg.emphasized',
  borderRadius: 'full',
  _disabled: { opacity: 0.5 },
})

const fill = css({
  position: 'absolute',
  top: `-${PADDING}px`,
  bottom: `-${PADDING}px`,
  left: `-${PADDING}px`,
  w: `calc(var(--slider-thumb-offset-0) + ${THUMB_SIZE / 2 + PADDING * 2}px)`,
  bg: 'accent.default',
  borderRadius: 'full',
  pointerEvents: 'none',
  transition: 'width 120ms ease-out',
})

const control = css({
  position: 'relative',
  display: 'flex',
  flex: '1',
  h: `${THUMB_SIZE}px`,
  cursor: 'pointer',
  '[data-disabled] &': { cursor: 'not-allowed' },
})

const track = css({ position: 'relative', flex: '1' })

const markerGroup = css({ position: 'absolute!', inset: '0', top: '50%' })

const marker = css({
  mt: '-1px',
  w: '2px',
  h: '2px',
  borderRadius: 'full',
  bg: 'fg.subtle',
  opacity: 0.7,
  '&[data-state=under-value]': { bg: 'white', opacity: 0.7 },
})

const thumb = css({
  w: `${THUMB_SIZE}px`,
  h: `${THUMB_SIZE}px`,
  borderRadius: 'full',
  bg: 'white',
  boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
  outline: 'none',
  _focusVisible: { boxShadow: '0 0 0 2px token(colors.accent.default)' },
})

const tooltip = css({
  position: 'absolute',
  bottom: 'calc(100% + 9px)',
  left: '50%',
  transform: 'translateX(-50%)',
  px: '2',
  py: '1',
  bg: 'tooltip.bg',
  color: 'tooltip.fg',
  borderWidth: '1px',
  borderColor: 'tooltip.border',
  fontSize: 'xs',
  fontWeight: 'medium',
  whiteSpace: 'nowrap',
  borderRadius: 'sm',
  boxShadow: 'popover',
  pointerEvents: 'none',
  zIndex: 'tooltip',
  _hidden: { display: 'none' },
  _after: {
    content: '""',
    position: 'absolute',
    top: '100%',
    left: '50%',
    w: '8px',
    h: '8px',
    mt: '-4px',
    bg: 'tooltip.bg',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderColor: 'tooltip.border',
    transform: 'translateX(-50%) rotate(45deg)',
  },
})

function indexOf(effort: string) {
  return Math.max(0, CHAT_EFFORTS.findIndex(option => option.id === effort))
}

interface EffortSliderProps {
  value: string
  onChange: (effort: string) => void
  label: string
  disabled?: boolean
}

export function EffortSlider({ value, onChange, label, disabled }: EffortSliderProps) {
  const index = indexOf(value)
  return (
    <Slider.Root
      className={root}
      min={0}
      max={CHAT_EFFORTS.length - 1}
      step={1}
      value={[index]}
      disabled={disabled}
      thumbAlignment="contain"
      thumbSize={{ width: THUMB_SIZE, height: THUMB_SIZE }}
      aria-label={[label]}
      getAriaValueText={details => CHAT_EFFORTS[details.value]?.label ?? ''}
      onValueChange={(details) => {
        const next = CHAT_EFFORTS[details.value[0] ?? 0]
        if (next && next.id !== value)
          onChange(next.id)
      }}
    >
      <Slider.Control className={control}>
        <span className={fill} />
        <Slider.Track className={track} />
        <Slider.MarkerGroup className={markerGroup}>
          {CHAT_EFFORTS.map((option, position) => <Slider.Marker key={option.id || 'default'} value={position} className={marker} />)}
        </Slider.MarkerGroup>
        <Slider.Thumb index={0} className={thumb}>
          <Slider.HiddenInput />
          <Slider.DraggingIndicator className={tooltip}>{CHAT_EFFORTS[index]?.label}</Slider.DraggingIndicator>
        </Slider.Thumb>
      </Slider.Control>
    </Slider.Root>
  )
}
