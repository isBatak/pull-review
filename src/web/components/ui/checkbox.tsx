import { Checkbox as ArkCheckbox } from '@ark-ui/react/checkbox'
import { Check, Minus } from 'lucide-react'
import { css } from 'styled-system/css'
import { checkbox } from 'styled-system/recipes'


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
      <ArkCheckbox.Control className={checkbox()}>
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
