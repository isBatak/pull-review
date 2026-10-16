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
  '--arrow-size': '8px',
  '--arrow-background': 'token(colors.tooltip.bg)',
  bg: 'tooltip.bg',
  color: 'tooltip.fg',
  borderWidth: '1px',
  borderColor: 'tooltip.border',
  fontSize: 'xs',
  lineHeight: '1.5',
  px: '2',
  py: '1',
  borderRadius: 'sm',
  boxShadow: 'popover',
  maxW: '64',
  zIndex: 'tooltip',
  '& strong': { fontWeight: 'semibold', color: 'tooltip.fg' },
})

const tooltipArrowTip = css({
  borderColor: 'tooltip.border',
  borderTopWidth: '1px',
  borderLeftWidth: '1px',
  '[data-placement^=top] &': { borderTopWidth: '0', borderLeftWidth: '0', borderBottomWidth: '1px', borderRightWidth: '1px' },
  '[data-placement^=left] &': { borderLeftWidth: '0', borderBottomWidth: '1px', borderRightWidth: '1px' },
  '[data-placement^=right] &': { borderTopWidth: '0', borderLeftWidth: '1px', borderBottomWidth: '1px' },
})

export function WithTooltip({ label, children }: { label: ReactNode, children: ReactNode }) {
  return (
    <Tooltip.Root openDelay={300} closeDelay={0} positioning={{ placement: 'bottom' }}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content className={tooltipContent}>
            <Tooltip.Arrow>
              <Tooltip.ArrowTip className={tooltipArrowTip} />
            </Tooltip.Arrow>
            {label}
          </Tooltip.Content>
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
