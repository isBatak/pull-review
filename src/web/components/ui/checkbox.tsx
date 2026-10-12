import { Checkbox as ArkCheckbox } from '@ark-ui/react/checkbox'
import { Check, Minus } from 'lucide-react'
import { css } from 'styled-system/css'

const control = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  w: '4',
  h: '4',
  borderRadius: 'sm',
  borderWidth: '1.5px',
  borderColor: 'border.strong',
  bg: 'bg.surface',
  color: 'fg.onAccent',
  cursor: 'pointer',
  transition: 'background 120ms, border-color 120ms',
  _hover: { borderColor: 'accent.default' },
  _checked: { bg: 'success.solid', borderColor: 'success.solid' },
  '&[data-state=indeterminate]': { bg: 'warning.fg', borderColor: 'warning.fg' },
  '& svg': { w: '3', h: '3', strokeWidth: 3 },
})

interface CheckboxProps {
  checked: boolean | 'indeterminate'
  onCheckedChange: (checked: boolean) => void
  label: string
}

export function Checkbox({ checked, onCheckedChange, label }: CheckboxProps) {
  return (
    <ArkCheckbox.Root
      checked={checked}
      onCheckedChange={details => onCheckedChange(details.checked === true)}
      aria-label={label}
      className={css({ display: 'inline-flex', alignItems: 'center' })}
      onClick={event => event.stopPropagation()}
    >
      <ArkCheckbox.Control className={control}>
        <ArkCheckbox.Indicator>
          <Check />
        </ArkCheckbox.Indicator>
        <ArkCheckbox.Indicator indeterminate>
          <Minus />
        </ArkCheckbox.Indicator>
      </ArkCheckbox.Control>
      <ArkCheckbox.HiddenInput />
    </ArkCheckbox.Root>
  )
}
