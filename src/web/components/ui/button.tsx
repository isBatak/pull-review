import type { ComponentProps, ReactNode } from 'react'
import type { ButtonVariantProps } from 'styled-system/recipes'
import { Tooltip } from '@ark-ui/react/tooltip'
import { Portal } from '@ark-ui/react/portal'
import { css, cx } from 'styled-system/css'
import { button } from 'styled-system/recipes'

type ButtonProps = ComponentProps<'button'> & ButtonVariantProps

export function Button({ variant, size, iconOnly, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cx(button({ variant, size, iconOnly }), className)} {...props} />
}

const tooltipContent = css({
  bg: 'fg.default',
  color: 'bg.canvas',
  fontSize: 'xs',
  px: '2',
  py: '1',
  borderRadius: 'sm',
  boxShadow: 'popover',
  maxW: '64',
  zIndex: 'tooltip',
})

export function WithTooltip({ label, children }: { label: ReactNode, children: ReactNode }) {
  return (
    <Tooltip.Root openDelay={300} closeDelay={0} positioning={{ placement: 'bottom' }}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content className={tooltipContent}>{label}</Tooltip.Content>
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
