import type { ChatPromptSection, ChatPromptView } from '../../../shared/chat'
import { Dialog } from '@ark-ui/react/dialog'
import { Portal } from '@ark-ui/react/portal'
import { Check, ChevronRight, ClipboardCopy, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { card } from 'styled-system/recipes'
import { Button, IconButton } from '../ui/button'
import { Spinner } from '../ui/spinner'

export interface PromptViewerRequest {
  title: string
  description: string
  load: () => Promise<ChatPromptView>
}

type LoadState = { kind: 'loading' } | { kind: 'ready', view: ChatPromptView } | { kind: 'error', message: string }

function SectionView({ section, defaultOpen }: { section: ChatPromptSection, defaultOpen: boolean }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(section.text)
    setCopied(true)
  }

  return (
    <details open={defaultOpen} className={css({ borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', overflow: 'hidden', '&[open] > summary svg.chevron': { transform: 'rotate(90deg)' } })}>
      <summary className={css({ display: 'flex', alignItems: 'center', gap: '2', px: '3', py: '2', bg: 'bg.subtle', cursor: 'pointer', listStyle: 'none', '&::-webkit-details-marker': { display: 'none' }, '& svg': { w: '3.5', h: '3.5', flexShrink: 0 } })}>
        <ChevronRight className="chevron" />
        <span className={css({ fontSize: 'sm', fontWeight: 'semibold', whiteSpace: 'nowrap', flexShrink: 0 })}>{section.label}</span>
        {section.detail && <span className={css({ fontSize: 'xs', color: 'fg.subtle', truncate: true, minW: '0' })}>{section.detail}</span>}
        <span className={css({ ml: 'auto', flexShrink: 0 })} onClick={event => event.preventDefault()}>
          <Button size="xs" variant="ghost" onClick={() => void copy()}>
            {copied ? <Check /> : <ClipboardCopy />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </span>
      </summary>
      <pre className={css({ m: '0', p: '3', maxH: '60vh', overflow: 'auto', fontFamily: 'mono', fontSize: 'xs', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', bg: 'bg.surface' })}>
        {section.text || '(empty)'}
      </pre>
    </details>
  )
}

export function PromptViewer({ request, onClose }: { request: PromptViewerRequest | null, onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    if (!request)
      return
    let cancelled = false
    setState({ kind: 'loading' })
    request.load().then(
      view => !cancelled && setState({ kind: 'ready', view }),
      (cause: unknown) => !cancelled && setState({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause) }),
    )
    return () => {
      cancelled = true
    }
  }, [request])

  return (
    <Dialog.Root open={request !== null} onOpenChange={details => !details.open && onClose()} lazyMount unmountOnExit>
      <Portal>
        <Dialog.Backdrop className={css({ position: 'fixed', inset: '0', zIndex: 'overlay', bg: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' })} />
        <Dialog.Positioner className={css({ position: 'fixed', inset: '0', zIndex: 'modal', display: 'flex', alignItems: 'center', justifyContent: 'center', p: '6' })}>
          <Dialog.Content className={cx(card({ floating: true, ornate: true }), css({ w: 'full', maxW: '920px', maxH: 'calc(100dvh - 48px)', overflowY: 'auto', p: '6', outline: 'none' }))}>
            <div className={css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4', mb: '4' })}>
              <div>
                <Dialog.Title className={css({ fontSize: 'lg', fontWeight: 'semibold' })}>{request?.title}</Dialog.Title>
                <Dialog.Description className={css({ fontSize: 'sm', color: 'fg.muted' })}>{request?.description}</Dialog.Description>
              </div>
              <Dialog.CloseTrigger asChild>
                <IconButton label="Close"><X /></IconButton>
              </Dialog.CloseTrigger>
            </div>
            {state.kind === 'loading' && (
              <div className={css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'sm', color: 'fg.muted', '& svg': { w: '4', h: '4' } })}>
                <Spinner />
                Building the prompt…
              </div>
            )}
            {state.kind === 'error' && <div className={css({ fontSize: 'sm', color: 'danger.fg' })}>{state.message}</div>}
            {state.kind === 'ready' && (
              <div className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
                {state.view.sections.map((section, index) => <SectionView key={section.label} section={section} defaultOpen={index === 0} />)}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
