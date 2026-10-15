import type { ComponentProps, ReactNode } from 'react'
import type { ButtonVariantProps, TooltipVariantProps } from 'styled-system/recipes'
import { Tooltip } from '@ark-ui/react/tooltip'
import { Portal } from '@ark-ui/react/portal'
import { cx } from 'styled-system/css'
import { button, tooltip } from 'styled-system/recipes'

type ButtonProps = ComponentProps<'button'> & ButtonVariantProps

export function Button({ variant, size, iconOnly, frame, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cx(button({ variant, size, iconOnly, frame }), className)} {...props} />
}

export function WithTooltip({ label, rarity, children }: { label: ReactNode, children: ReactNode } & TooltipVariantProps) {
  return (
    <Tooltip.Root openDelay={300} closeDelay={0} positioning={{ placement: 'bottom' }}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content className={tooltip({ rarity })}>{label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  )
}

type IconButtonProps = Omit<ButtonProps, 'iconOnly' | 'aria-label'> & { label: string }

export function IconButton({ label, variant = 'ghost', ...props }: IconButtonProps) {
  return (
    <WithTooltip label={label}>
      <Button aria-label={label} variant={variant} iconOnly {...props} />
    </WithTooltip>
  )
}
