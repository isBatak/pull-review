import type { ReactNode } from 'react'
import { Dialog } from '@ark-ui/react/dialog'
import { Portal } from '@ark-ui/react/portal'
import { X } from 'lucide-react'
import { css } from 'styled-system/css'
import { IconButton } from './ui/button'

interface ChangesDialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  children: ReactNode
}

export function ChangesDialog({ open, title, description, onClose, children }: ChangesDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={details => !details.open && onClose()} lazyMount unmountOnExit>
      <Portal>
        <Dialog.Backdrop className={css({ position: 'fixed', inset: '0', zIndex: 'overlay', bg: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' })} />
        <Dialog.Positioner className={css({ position: 'fixed', inset: '0', zIndex: 'modal', display: 'flex', alignItems: 'center', justifyContent: 'center', p: { base: '3', md: '6' } })}>
          <Dialog.Content className={css({ display: 'flex', flexDir: 'column', w: 'full', maxW: '1200px', maxH: 'calc(100dvh - 48px)', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'xl', boxShadow: 'popover', outline: 'none', overflow: 'hidden' })}>
            <div className={css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4', px: '6', py: '4', borderBottomWidth: '1px', borderColor: 'border.default' })}>
              <div className={css({ minW: '0' })}>
                <Dialog.Title className={css({ fontSize: 'lg', fontWeight: 'semibold', wordBreak: 'break-word' })}>{title}</Dialog.Title>
                {description && <Dialog.Description className={css({ fontSize: 'sm', color: 'fg.muted' })}>{description}</Dialog.Description>}
              </div>
              <Dialog.CloseTrigger asChild>
                <IconButton label="Close"><X /></IconButton>
              </Dialog.CloseTrigger>
            </div>
            <div className={css({ flex: '1', minH: '0', overflowY: 'auto', p: '6', bg: 'bg.canvas' })}>{children}</div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
