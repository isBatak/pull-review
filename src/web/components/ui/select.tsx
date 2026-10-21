import type { ReactNode } from 'react'
import { Portal } from '@ark-ui/react/portal'
import { createListCollection, Select as ArkSelect } from '@ark-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { useMemo } from 'react'
import { css, cx } from 'styled-system/css'

export interface SelectOption {
  value: string
  label: string
  hint?: ReactNode
}

type SelectVariant = 'outline' | 'compact' | 'ghost' | 'subtle'

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  label: string
  variant?: SelectVariant
  disabled?: boolean
  id?: string
  className?: string
}

// Ark treats an empty string as "nothing selected", so options whose value is '' get a stand-in key.
const EMPTY_KEY = '__empty__'

function toKey(value: string) {
  return value === '' ? EMPTY_KEY : value
}

function fromKey(key: string) {
  return key === EMPTY_KEY ? '' : key
}

const trigger = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1.5',
  minW: '0',
  color: 'fg.default',
  cursor: 'pointer',
  outline: 'none',
  textAlign: 'left',
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
  _focusVisible: { boxShadow: '0 0 0 2px var(--colors-accent-default)' },
  '& > svg': { flexShrink: 0, color: 'fg.subtle', transition: 'transform 150ms' },
  '&[data-state=open] > svg': { transform: 'rotate(180deg)' },
})

const triggerVariants: Record<SelectVariant, string> = {
  outline: css({ w: 'full', maxW: 'sm', h: '9', px: '2.5', fontSize: 'sm', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', '& > svg': { w: '4', h: '4' }, _open: { borderColor: 'accent.default' } }),
  compact: css({ h: '7', px: '2', fontSize: 'xs', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', '& > svg': { w: '3.5', h: '3.5' }, _open: { borderColor: 'accent.default' } }),
  subtle: css({ h: '6', px: '2', fontSize: 'xs', color: 'fg.default', bg: 'bg.muted', borderRadius: 'md', _hover: { bg: 'bg.emphasized' }, _open: { bg: 'bg.emphasized' }, '& > svg': { w: '3', h: '3' } }),
  ghost: css({ h: '6', px: '1.5', fontSize: 'xs', color: 'fg.muted', bg: 'transparent', borderRadius: 'md', _hover: { bg: 'bg.muted', color: 'fg.default' }, _open: { bg: 'bg.muted', color: 'fg.default' }, '& > svg': { w: '3', h: '3' } }),
}

const positioner = css({ zIndex: 'popover' })

const content = css({
  minW: 'var(--reference-width)',
  maxH: '72',
  overflowY: 'auto',
  p: '1',
  bg: 'bg.surface',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  boxShadow: 'popover',
  outline: 'none',
})

const item = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  px: '2',
  py: '1.5',
  fontSize: 'sm',
  color: 'fg.default',
  borderRadius: 'sm',
  cursor: 'pointer',
  userSelect: 'none',
  _highlighted: { bg: 'bg.muted' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
})

export function Select({ value, onChange, options, label, variant = 'outline', disabled, id, className }: SelectProps) {
  const collection = useMemo(() => createListCollection({
    items: options,
    itemToValue: option => toKey(option.value),
    itemToString: option => option.label,
  }), [options])
  const selected = options.find(option => option.value === value)

  return (
    <ArkSelect.Root
      collection={collection}
      value={[toKey(value)]}
      onValueChange={details => details.value[0] !== undefined && onChange(fromKey(details.value[0]))}
      disabled={disabled}
      ids={id ? { trigger: id } : undefined}
      positioning={{ placement: 'bottom-start', gutter: 4 }}
      className={className}
    >
      <ArkSelect.Control>
        <ArkSelect.Trigger aria-label={label} className={cx(trigger, triggerVariants[variant])}>
          <span className={css({ truncate: true })}>{selected?.label ?? value}</span>
          <ChevronDown />
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      <Portal>
        <ArkSelect.Positioner className={positioner}>
          <ArkSelect.Content className={content}>
            {options.map(option => (
              <ArkSelect.Item key={toKey(option.value)} item={option} className={item}>
                <span className={css({ flex: '1', minW: '0' })}>
                  <ArkSelect.ItemText className={css({ display: 'block', truncate: true })}>{option.label}</ArkSelect.ItemText>
                  {option.hint && <span className={css({ display: 'block', fontSize: 'xs', color: 'fg.subtle' })}>{option.hint}</span>}
                </span>
                <ArkSelect.ItemIndicator className={css({ display: 'inline-flex', color: 'accent.fg', '& svg': { w: '3.5', h: '3.5' } })}>
                  <Check />
                </ArkSelect.ItemIndicator>
              </ArkSelect.Item>
            ))}
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      </Portal>
      <ArkSelect.HiddenSelect />
    </ArkSelect.Root>
  )
}
