import type { ComponentProps, ReactNode } from 'react'
import type { ButtonVariantProps } from 'styled-system/recipes'
import type { SystemStyleObject } from 'styled-system/types'
import { Tooltip } from '@ark-ui/react/tooltip'
import { Portal } from '@ark-ui/react/portal'
import { css, cx } from 'styled-system/css'
import { button } from 'styled-system/recipes'

type ButtonProps = ComponentProps<'button'> & ButtonVariantProps

export function Button({ variant, size, iconOnly, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cx(button({ variant, size, iconOnly }), className)} {...props} />
}

const tooltipContent = css.raw({
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

// Zag rotates the tip so its top-left corner always points at the trigger, so the border stays on these two sides for every placement.
const tooltipArrowTip = css({
  borderColor: 'tooltip.border',
  borderTopWidth: '1px',
  borderLeftWidth: '1px',
})

const shortcutKey = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minW: '4.5',
  h: '4.5',
  px: '1',
  fontFamily: 'mono',
  fontSize: '2xs',
  color: 'tooltip.fg',
  opacity: 0.7,
  borderWidth: '1px',
  borderColor: 'tooltip.border',
  borderRadius: 'sm',
})

interface WithTooltipProps {
  label: ReactNode
  shortcut?: string
  children: ReactNode
  contentStyle?: SystemStyleObject
}

export function WithTooltip({ label, shortcut, children, contentStyle }: WithTooltipProps) {
  return (
    <Tooltip.Root openDelay={300} closeDelay={0} positioning={{ placement: 'bottom' }}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content className={css(tooltipContent, contentStyle)}>
            <Tooltip.Arrow>
              <Tooltip.ArrowTip className={tooltipArrowTip} />
            </Tooltip.Arrow>
            {shortcut
              ? (
                  <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '2' })}>
                    {label}
                    <kbd className={shortcutKey}>{shortcut}</kbd>
                  </span>
                )
              : label}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  )
}

type IconButtonProps = Omit<ButtonProps, 'iconOnly' | 'aria-label'> & { label: string, shortcut?: string }

export function IconButton({ label, shortcut, variant = 'ghost', ...props }: IconButtonProps) {
  return (
    <WithTooltip label={label} shortcut={shortcut}>
      <Button aria-label={label} aria-keyshortcuts={shortcut} variant={variant} iconOnly {...props} />
    </WithTooltip>
  )
}
