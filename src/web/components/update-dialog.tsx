import type { ReactNode } from 'react'
import type { UpdateInfo } from '../../shared/updates'
import { Dialog } from '@ark-ui/react/dialog'
import { Portal } from '@ark-ui/react/portal'
import { LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { css } from 'styled-system/css'
import { readStoredValue, useStoredState } from '../lib/stored-state'
import { checkForUpdate, installUpdate, onCheckForUpdatesMenu, onUpdateAvailable } from '../lib/updates'
import { Button, IconButton } from './ui/button'
import { Markdown } from './ui/markdown'

const SKIPPED_VERSION_KEY = 'pull-review:skipped-update'

type UpdateState =
  | { kind: 'closed' }
  | { kind: 'checking' }
  | { kind: 'up-to-date', current: string }
  | { kind: 'check-failed', message: string }
  | { kind: 'available', info: UpdateInfo, installing: boolean, error: string | null }

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/quarantined location/i.test(message))
    return 'Move Pull Review to your Applications folder, open it from there, and try again.'
  return message
}

export function UpdateDialog() {
  const [state, setState] = useState<UpdateState>({ kind: 'closed' })
  const [, setSkippedVersion] = useStoredState<string | null>(SKIPPED_VERSION_KEY, null)

  useEffect(() => {
    const offAvailable = onUpdateAvailable((info) => {
      if (readStoredValue<string>(SKIPPED_VERSION_KEY) === info.latest)
        return
      setState(current => current.kind === 'closed' ? { kind: 'available', info, installing: false, error: null } : current)
    })
    const offMenu = onCheckForUpdatesMenu(() => {
      setState({ kind: 'checking' })
      checkForUpdate().then(
        ({ current, update }) => setState(update ? { kind: 'available', info: update, installing: false, error: null } : { kind: 'up-to-date', current }),
        error => setState({ kind: 'check-failed', message: errorMessage(error) }),
      )
    })
    return () => {
      offAvailable()
      offMenu()
    }
  }, [])

  const installing = state.kind === 'available' && state.installing
  const close = () => {
    if (!installing)
      setState({ kind: 'closed' })
  }

  const install = (info: UpdateInfo) => {
    setState({ kind: 'available', info, installing: true, error: null })
    installUpdate().catch(error => setState({ kind: 'available', info, installing: false, error: errorMessage(error) }))
  }

  return (
    <Dialog.Root
      open={state.kind !== 'closed'}
      onOpenChange={details => !details.open && close()}
      closeOnInteractOutside={!installing}
      closeOnEscape={!installing}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop className={css({ position: 'fixed', inset: '0', zIndex: 'overlay', bg: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' })} />
        <Dialog.Positioner className={css({ position: 'fixed', inset: '0', zIndex: 'modal', display: 'flex', alignItems: 'center', justifyContent: 'center', p: { base: '3', md: '6' } })}>
          <Dialog.Content className={css({ display: 'flex', flexDir: 'column', w: 'full', maxW: '560px', maxH: 'calc(100dvh - 48px)', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'xl', boxShadow: 'popover', outline: 'none', overflow: 'hidden' })}>
            {state.kind === 'checking' && (
              <DialogLayout title="Checking for updates">
                <p className={css({ display: 'flex', alignItems: 'center', gap: '2', color: 'fg.muted' })}>
                  <LoaderCircle className={css({ w: '4', h: '4', animation: 'spin' })} />
                  Looking for a newer version…
                </p>
              </DialogLayout>
            )}
            {state.kind === 'up-to-date' && (
              <DialogLayout title="You're up to date" footer={<Button variant="solid" size="md" onClick={close}>OK</Button>}>
                <p className={css({ color: 'fg.muted' })}>{`Pull Review ${state.current} is the newest version.`}</p>
              </DialogLayout>
            )}
            {state.kind === 'check-failed' && (
              <DialogLayout title="Couldn't check for updates" footer={<Button variant="solid" size="md" onClick={close}>OK</Button>}>
                <p className={css({ color: 'fg.muted' })}>{state.message}</p>
              </DialogLayout>
            )}
            {state.kind === 'available' && (
              <DialogLayout
                title={`Pull Review ${state.info.latest} is available`}
                description={`You have ${state.info.current}.`}
                closable={!state.installing}
                footer={(
                  <>
                    <Button
                      size="md"
                      disabled={state.installing}
                      onClick={() => {
                        setSkippedVersion(state.info.latest)
                        close()
                      }}
                      className={css({ mr: 'auto' })}
                    >
                      Skip this version
                    </Button>
                    <Button variant="ghost" size="md" disabled={state.installing} onClick={close}>Later</Button>
                    <Button variant="solid" size="md" disabled={state.installing} onClick={() => install(state.info)}>
                      {state.installing && <LoaderCircle className={css({ animation: 'spin' })} />}
                      {state.installing ? 'Updating…' : 'Update and restart'}
                    </Button>
                  </>
                )}
              >
                <div className={css({ display: 'flex', flexDir: 'column', gap: '4' })}>
                  {state.info.notes
                    ? <Markdown>{state.info.notes}</Markdown>
                    : <p className={css({ color: 'fg.muted' })}>This version has no release notes.</p>}
                  <p className={css({ fontSize: 'sm', color: 'fg.muted' })}>Pull Review restarts to finish the update. A Claude chat or review that is still running stops.</p>
                  {state.error && <p role="alert" className={css({ fontSize: 'sm', color: 'danger.fg' })}>{state.error}</p>}
                </div>
              </DialogLayout>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

interface DialogLayoutProps {
  title: string
  description?: string
  closable?: boolean
  footer?: ReactNode
  children: ReactNode
}

function DialogLayout({ title, description, closable = true, footer, children }: DialogLayoutProps) {
  return (
    <>
      <div className={css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4', px: '6', py: '4', borderBottomWidth: '1px', borderColor: 'border.default' })}>
        <div className={css({ minW: '0' })}>
          <Dialog.Title className={css({ fontSize: 'lg', fontWeight: 'semibold' })}>{title}</Dialog.Title>
          {description && <Dialog.Description className={css({ fontSize: 'sm', color: 'fg.muted' })}>{description}</Dialog.Description>}
        </div>
        {closable && (
          <Dialog.CloseTrigger asChild>
            <IconButton label="Close"><X /></IconButton>
          </Dialog.CloseTrigger>
        )}
      </div>
      <div className={css({ flex: '1', minH: '0', overflowY: 'auto', px: '6', py: '5' })}>{children}</div>
      {footer && (
        <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '2', px: '6', py: '3', borderTopWidth: '1px', borderColor: 'border.default', bg: 'bg.canvas' })}>
          {footer}
        </div>
      )}
    </>
  )
}
