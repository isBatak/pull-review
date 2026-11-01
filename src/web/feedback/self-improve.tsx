import type { ReactNode } from 'react'
import type { ContextDetail, FeedbackContext } from '../../shared/self-improve'
import { Popover } from '@ark-ui/react/popover'
import { Portal } from '@ark-ui/react/portal'
import { ArrowUp, ChevronRight, Crosshair, MessageSquare, Paperclip, X } from 'lucide-react'
import { createContext, use, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { css } from 'styled-system/css'
import { contextDetails, SELF_IMPROVE_UI_ATTRIBUTE, withoutDetails } from '../../shared/self-improve'
import { IconButton, WithTooltip } from '../components/ui/button'
import { api } from '../lib/api'
import { useChatAvailable } from '../lib/chat'
import { useTheme } from '../lib/preferences'
import { buildFeedbackContext } from './context'
import { startPicker } from './picker'
import { captureWindow } from './screenshot'

export const FEEDBACK_PATH = '/feedback'

type Mode
  = | { kind: 'idle' }
    | { kind: 'picking' }
    | { kind: 'composing', context: FeedbackContext }
    | { kind: 'sent' }

interface SelfImproveControls {
  startPicking: () => void
  compose: () => void
}

const SelfImproveContext = createContext<SelfImproveControls | null>(null)

const SENT_NOTICE_MS = 4000

const floating = css.raw({
  position: 'fixed',
  left: '50%',
  bottom: '5',
  transform: 'translateX(-50%)',
  zIndex: 'popover',
  bg: 'bg.surface',
  borderWidth: '1px',
  borderColor: 'border.default',
  boxShadow: 'popover',
})

const kbd = css({ fontFamily: 'body', fontSize: '2xs', color: 'fg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'sm', px: '1', lineHeight: '1.4' })

function PickBar({ onCancel }: { onCancel: () => void }) {
  return (
    <div {...{ [SELF_IMPROVE_UI_ATTRIBUTE]: '' }} className={css(floating, { display: 'flex', alignItems: 'center', gap: '4', pl: '5', pr: '2', h: '12', borderRadius: 'full', fontSize: 'sm', whiteSpace: 'nowrap' })}>
      <strong className={css({ fontWeight: 'semibold', color: 'fg.default' })}>Click what this request is about</strong>
      <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', color: 'fg.subtle' })}>
        Hold
        <kbd className={kbd}>⌥</kbd>
        to measure
      </span>
      <button type="button" onClick={onCancel} className={css({ h: '8', px: '3.5', borderRadius: 'full', bg: 'bg.muted', fontWeight: 'medium', color: 'fg.default', cursor: 'pointer', _hover: { bg: 'bg.emphasized' } })}>
        Cancel
      </button>
    </div>
  )
}

function ContextPopover({ context, omitted, onToggle }: { context: FeedbackContext, omitted: Set<ContextDetail>, onToggle: (key: ContextDetail) => void }) {
  const details = contextDetails(context)
  const kept = details.filter(detail => !omitted.has(detail.key)).length
  return (
    <Popover.Root positioning={{ placement: 'top-end' }} lazyMount>
      <Popover.Trigger className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', h: '7', px: '2.5', borderRadius: 'full', bg: 'bg.subtle', fontSize: 'xs', color: 'fg.muted', cursor: 'pointer', _hover: { bg: 'bg.muted', color: 'fg.default' }, '& svg': { w: '3.5', h: '3.5' } })}>
        <Paperclip />
        Context ·
        {' '}
        {kept}
        {' '}
        {kept === 1 ? 'detail' : 'details'}
        <ChevronRight />
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner {...{ [SELF_IMPROVE_UI_ATTRIBUTE]: '' }}>
          <Popover.Content className={css({ w: '96', p: '2', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', boxShadow: 'popover', zIndex: 'popover', display: 'flex', flexDir: 'column', gap: '1' })}>
            <p className={css({ px: '2', py: '1', fontSize: 'xs', color: 'fg.subtle' })}>Sent to Claude with your request. Click a detail to leave it out.</p>
            {details.map(detail => (
              <button
                key={detail.key}
                type="button"
                onClick={() => onToggle(detail.key)}
                className={css({ display: 'grid', gridTemplateColumns: '5rem minmax(0, 1fr) auto', alignItems: 'center', gap: '2', px: '2', py: '1.5', borderRadius: 'md', textAlign: 'left', fontSize: 'xs', cursor: 'pointer', _hover: { bg: 'bg.muted' } })}
                style={{ opacity: omitted.has(detail.key) ? 0.45 : 1 }}
              >
                <span className={css({ color: 'fg.subtle' })}>{detail.label}</span>
                <span className={css({ color: 'fg.default', truncate: true, fontFamily: detail.key === 'element' ? 'mono' : 'body' })} style={{ textDecoration: omitted.has(detail.key) ? 'line-through' : 'none' }}>{detail.value}</span>
                <span className={css({ color: 'fg.subtle', fontSize: '2xs' })}>{omitted.has(detail.key) ? 'Add back' : 'Remove'}</span>
              </button>
            ))}
            {context.screenshot && !omitted.has('screenshot') && (
              <img src={context.screenshot} alt="Picture of the window" className={css({ mt: '1', borderRadius: 'md', borderWidth: '1px', borderColor: 'border.default' })} />
            )}
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}

function Composer({ context, onClose, onSent }: { context: FeedbackContext, onClose: () => void, onSent: () => void }) {
  const [request, setRequest] = useState('')
  const [omitted, setOmitted] = useState<Set<ContextDetail>>(() => new Set())
  const [pointedAt, setPointedAt] = useState(context.element?.label ?? null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => textRef.current?.focus(), [])

  function toggle(key: ContextDetail) {
    setOmitted((current) => {
      const next = new Set(current)
      if (!next.delete(key))
        next.add(key)
      return next
    })
  }

  async function send() {
    if (!request.trim() || sending)
      return
    setSending(true)
    setError(null)
    try {
      const keptOut = new Set(omitted)
      if (!pointedAt)
        keptOut.add('element')
      await api.createFeedback({ request: request.trim(), context: withoutDetails(context, keptOut) })
      onSent()
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setSending(false)
    }
  }

  return (
    <div
      {...{ [SELF_IMPROVE_UI_ATTRIBUTE]: '' }}
      className={css(floating, { w: 'min(720px, calc(100vw - 32px))', borderRadius: '2xl', pt: '3.5', px: '3.5', pb: '2.5' })}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && event.currentTarget.contains(event.target as Node)) {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <div className={css({ display: 'flex', alignItems: 'flex-start', gap: '3' })}>
        <textarea
          ref={textRef}
          value={request}
          rows={2}
          onChange={event => setRequest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void send()
            }
          }}
          placeholder="What should change? For example: remove the extra space below these buttons"
          aria-label="Your request"
          className={css({ flex: '1', minH: '14', resize: 'none', bg: 'transparent', outline: 'none', fontSize: 'md', lineHeight: '1.5', color: 'fg.default', px: '1', _placeholder: { color: 'fg.subtle' } })}
        />
        <WithTooltip label="Send to Claude" shortcut="⌘↵">
          <button
            type="button"
            onClick={() => void send()}
            disabled={!request.trim() || sending}
            aria-label="Send to Claude"
            className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, w: '9', h: '9', borderRadius: 'full', bg: 'accent.default', color: 'fg.onAccent', cursor: 'pointer', _hover: { _enabled: { bg: 'accent.hover' } }, _disabled: { bg: 'bg.muted', color: 'fg.subtle', cursor: 'not-allowed' }, '& svg': { w: '4.5', h: '4.5' } })}
          >
            <ArrowUp />
          </button>
        </WithTooltip>
      </div>
      {error && <p className={css({ mt: '2', px: '1', fontSize: 'xs', color: 'danger.fg' })}>{error}</p>}
      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2', mt: '2' })}>
        {pointedAt
          ? (
              <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', minW: '0', h: '7', pl: '2.5', pr: '1', borderRadius: 'full', bg: 'bg.subtle', fontSize: 'xs', color: 'fg.muted', '& > svg': { w: '3.5', h: '3.5', flexShrink: 0, color: 'accent.fg' } })}>
                <Crosshair />
                <span className={css({ truncate: true })}>
                  Pointed at “
                  {pointedAt}
                  ”
                </span>
                <button type="button" aria-label="Don't point at anything" onClick={() => setPointedAt(null)} className={css({ display: 'inline-flex', p: '1', borderRadius: 'full', cursor: 'pointer', color: 'fg.subtle', _hover: { bg: 'bg.muted', color: 'fg.default' }, '& svg': { w: '3', h: '3' } })}>
                  <X />
                </button>
              </span>
            )
          : <span />}
        <ContextPopover context={pointedAt ? context : withoutDetails(context, ['element'])} omitted={omitted} onToggle={toggle} />
      </div>
    </div>
  )
}

function SentNotice() {
  return (
    <div {...{ [SELF_IMPROVE_UI_ATTRIBUTE]: '' }} role="status" className={css(floating, { display: 'flex', alignItems: 'center', gap: '3', px: '4', py: '2.5', borderRadius: 'xl' })}>
      <span className={css({ fontSize: 'sm', color: 'fg.default' })}>Sent to Claude. It runs one request at a time.</span>
      <Link to={FEEDBACK_PATH} className={css({ fontSize: 'sm', fontWeight: 'medium', color: 'accent.fg', _hover: { textDecoration: 'underline' } })}>
        See progress
      </Link>
    </div>
  )
}

export function SelfImproveProvider({ children }: { children: ReactNode }) {
  const available = useChatAvailable()
  const [theme] = useTheme()
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })

  useEffect(() => {
    if (mode.kind !== 'picking')
      return
    return startPicker({
      onPick: (element) => {
        setMode({ kind: 'composing', context: buildFeedbackContext(element, theme, null) })
        void captureWindow().then(screenshot => setMode(current => current.kind === 'composing' && screenshot
          ? { ...current, context: { ...current.context, screenshot } }
          : current))
      },
      onCancel: () => setMode({ kind: 'idle' }),
    })
  }, [mode.kind, theme])

  useEffect(() => {
    if (mode.kind !== 'sent')
      return
    const timer = setTimeout(() => setMode({ kind: 'idle' }), SENT_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [mode.kind])

  const controls = useMemo<SelfImproveControls | null>(() => available
    ? {
        startPicking: () => setMode({ kind: 'picking' }),
        compose: () => setMode({ kind: 'composing', context: buildFeedbackContext(null, theme, null) }),
      }
    : null, [available, theme])

  return (
    <SelfImproveContext value={controls}>
      {children}
      {mode.kind === 'picking' && <PickBar onCancel={() => setMode({ kind: 'idle' })} />}
      {mode.kind === 'composing' && <Composer context={mode.context} onClose={() => setMode({ kind: 'idle' })} onSent={() => setMode({ kind: 'sent' })} />}
      {mode.kind === 'sent' && <SentNotice />}
    </SelfImproveContext>
  )
}

export function SelfImproveButtons() {
  const controls = use(SelfImproveContext)
  if (!controls)
    return null
  return (
    <>
      <IconButton label="Point at something to change" onClick={controls.startPicking}>
        <Crosshair />
      </IconButton>
      <WithTooltip label="Feedback">
        <Link
          to={FEEDBACK_PATH}
          aria-label="Feedback"
          className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', w: '7', h: '7', borderRadius: 'md', color: 'fg.muted', _hover: { bg: 'bg.muted', color: 'fg.default' }, '& svg': { w: '1em', h: '1em' }, fontSize: 'xs' })}
        >
          <MessageSquare />
        </Link>
      </WithTooltip>
    </>
  )
}
