import type { LocalChange } from '../../shared/self-improve'
import { Popover } from '@ark-ui/react/popover'
import { Portal } from '@ark-ui/react/portal'
import { AlertTriangle, ArrowLeft, ArrowUp, CheckCircle2, ChevronRight, Circle, CircleDashed, GitCommitHorizontal, LoaderCircle, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { css } from 'styled-system/css'
import { badge } from 'styled-system/recipes'
import { contextDetails, DONE_STATUSES, NEEDS_YOU_STATUSES, OPEN_STATUSES, requestTime, workingFor } from '../../shared/self-improve'
import { Button, WithTooltip } from '../components/ui/button'
import { buildFeedbackContext } from '../feedback/context'
import { SelfImproveButtons } from '../feedback/self-improve'
import { api } from '../lib/api'
import { homePath } from '../lib/last-home'
import { useTheme } from '../lib/preferences'
import { useRefreshSelfImprove, useSelfImproveState } from '../lib/self-improve'
import { ErrorState } from './states'

const DONE_PAGE = 10
const DONE_MORE = 25

const card = css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'xl', overflow: 'hidden' })
const sectionTitle = css({ display: 'flex', alignItems: 'baseline', gap: '2', fontSize: 'md', fontWeight: 'semibold', color: 'fg.default', mb: '3' })
const sectionCount = css({ fontWeight: 'normal', color: 'fg.subtle' })
const metaLine = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.5', mt: '1.5', fontSize: 'xs', color: 'fg.subtle' })

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!enabled)
      return
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [enabled])
  return now
}

function ContextLink({ change }: { change: LocalChange }) {
  const details = contextDetails(change.context)
  return (
    <Popover.Root positioning={{ placement: 'bottom-start' }} lazyMount>
      <Popover.Trigger className={css({ display: 'inline-flex', alignItems: 'center', gap: '0.5', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px', _hover: { color: 'fg.default' }, '& svg': { w: '3', h: '3' } })}>
        Context
        <ChevronRight />
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content className={css({ w: '96', p: '3', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', boxShadow: 'popover', zIndex: 'popover', display: 'grid', gridTemplateColumns: '5rem minmax(0, 1fr)', gap: '1.5', fontSize: 'xs' })}>
            {details.map(detail => (
              <div key={detail.key} className={css({ display: 'contents' })}>
                <span className={css({ color: 'fg.subtle' })}>{detail.label}</span>
                <span className={css({ color: 'fg.default', wordBreak: 'break-all', fontFamily: detail.key === 'element' ? 'mono' : 'body' })}>{detail.value}</span>
              </div>
            ))}
            {change.hasScreenshot && (
              <>
                <span className={css({ color: 'fg.subtle' })}>Screenshot</span>
                <span className={css({ color: 'fg.default' })}>Picture of the window</span>
              </>
            )}
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}

function ChangeMeta({ change }: { change: LocalChange }) {
  const { page, viewport, theme } = change.context
  const parts = [
    page?.title,
    requestTime(change.createdAt),
    viewport && `${viewport.width < 768 ? 'mobile' : 'desktop'} ${viewport.width} px`,
    theme,
  ].filter(Boolean)
  return (
    <div className={metaLine}>
      {parts.map((part, index) => (
        <span key={index} className={css({ display: 'inline-flex', gap: '1.5' })}>
          {index === 0 && page ? <span className={css({ fontWeight: 'medium', color: 'fg.muted' })}>{part}</span> : part}
          <span aria-hidden>·</span>
        </span>
      ))}
      <ContextLink change={change} />
    </div>
  )
}

const statusIcon = css.raw({ w: '5', h: '5', flexShrink: 0, mt: '0.5' })

function StatusIcon({ change }: { change: LocalChange }) {
  if (change.status === 'working')
    return <LoaderCircle className={css(statusIcon, { color: 'warning.fg', animation: 'spin' })} aria-label="Working" />
  if (NEEDS_YOU_STATUSES.includes(change.status))
    return <AlertTriangle className={css(statusIcon, { color: 'danger.fg' })} aria-label="Needs you" />
  return <Circle className={css(statusIcon, { color: 'fg.subtle' })} aria-label="Waiting" />
}

function StatusRow({ change, now }: { change: LocalChange, now: Date }) {
  const row = css({ display: 'flex', alignItems: 'center', gap: '3', px: '5', py: '3', borderTopWidth: '1px', borderColor: 'border.default', fontSize: 'sm', '& > svg': { w: '4', h: '4', flexShrink: 0 } })
  if (change.status === 'queued') {
    return (
      <div className={row}>
        <CircleDashed className={css({ color: 'fg.subtle' })} />
        <span className={css({ color: 'fg.muted' })}>
          <strong className={css({ fontWeight: 'semibold', color: 'fg.default' })}>Queued</strong>
          {' · waiting for the agent to start'}
        </span>
      </div>
    )
  }
  if (change.status === 'working') {
    return (
      <div className={row}>
        <LoaderCircle className={css({ color: 'accent.fg', animation: 'spin' })} />
        <span className={css({ color: 'accent.fg' })}>
          <strong className={css({ fontWeight: 'semibold' })}>Agent working</strong>
          {` · ${workingFor(change.startedAt ?? change.createdAt, now)}`}
        </span>
      </div>
    )
  }
  return (
    <div className={row}>
      <AlertTriangle className={css({ color: 'danger.fg' })} />
      <span className={css({ color: 'fg.default', whiteSpace: 'pre-wrap' })}>{change.error ?? change.summary ?? 'Claude could not finish this request.'}</span>
    </div>
  )
}

function ChangeCard({ change, now, onDismiss }: { change: LocalChange, now: Date, onDismiss: () => void }) {
  return (
    <article className={card}>
      <div className={css({ display: 'flex', gap: '3', px: '5', py: '4' })}>
        <StatusIcon change={change} />
        <div className={css({ minW: '0', flex: '1' })}>
          <p className={css({ fontSize: 'md', color: 'fg.default', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>{change.request}</p>
          <ChangeMeta change={change} />
        </div>
      </div>
      <StatusRow change={change} now={now} />
      {change.status !== 'working' && (
        <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '2', px: '5', py: '2.5', borderTopWidth: '1px', borderColor: 'border.default' })}>
          <Button variant="ghost" size="md" onClick={onDismiss}>Dismiss</Button>
        </div>
      )}
    </article>
  )
}

function DoneRow({ change }: { change: LocalChange }) {
  const commit = change.commits.at(-1)
  const undone = change.status === 'undone'
  return (
    <li className={css({ display: 'flex', alignItems: 'center', gap: '3', px: '5', py: '3.5', borderTopWidth: '1px', borderColor: 'border.default', _first: { borderTopWidth: '0' } })}>
      {undone
        ? <RotateCcw className={css({ w: '4.5', h: '4.5', flexShrink: 0, color: 'fg.subtle' })} aria-label="Undone" />
        : <CheckCircle2 className={css({ w: '4.5', h: '4.5', flexShrink: 0, color: 'success.fg' })} aria-label="Done" />}
      <WithTooltip label={change.summary ?? change.request} contentStyle={{ maxW: '96', whiteSpace: 'pre-wrap' }}>
        <span className={css({ flex: '1', minW: '0', truncate: true, fontSize: 'sm', color: undone ? 'fg.subtle' : 'fg.default', textDecoration: undone ? 'line-through' : 'none' })}>{change.request}</span>
      </WithTooltip>
      {commit
        ? (
            <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', flexShrink: 0, h: '6', px: '2', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'full', fontFamily: 'mono', fontSize: 'xs', color: 'fg.muted', '& svg': { w: '3.5', h: '3.5', color: 'accent.fg' } })}>
              <GitCommitHorizontal />
              {commit.slice(0, 7)}
            </span>
          )
        : <span className={css({ flexShrink: 0, fontSize: 'xs', color: 'fg.subtle' })}>{undone ? 'Undone' : 'Done'}</span>}
      <span className={css({ flexShrink: 0, w: '14', textAlign: 'right', fontSize: 'xs', color: 'fg.subtle' })}>{requestTime(change.finishedAt ?? change.createdAt)}</span>
    </li>
  )
}

function RequestBox({ onSent }: { onSent: () => void }) {
  const [theme] = useTheme()
  const [request, setRequest] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!request.trim() || sending)
      return
    setSending(true)
    setError(null)
    try {
      await api.createFeedback({ request: request.trim(), context: buildFeedbackContext(null, theme, null) })
      setRequest('')
      onSent()
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
    finally {
      setSending(false)
    }
  }

  return (
    <div className={css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'xl', p: '4', _focusWithin: { borderColor: 'accent.default' } })}>
      <textarea
        value={request}
        rows={3}
        onChange={event => setRequest(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void send()
          }
        }}
        placeholder="Ask for a change or a new feature. To point at a part of the app, use the crosshair in the header."
        aria-label="New request"
        className={css({ w: 'full', resize: 'none', bg: 'transparent', outline: 'none', fontSize: 'md', lineHeight: '1.5', color: 'fg.default', _placeholder: { color: 'fg.subtle' } })}
      />
      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3' })}>
        <span className={css({ fontSize: 'xs', color: error ? 'danger.fg' : 'fg.subtle' })}>{error ?? 'Claude changes your copy of the app on this computer.'}</span>
        <WithTooltip label="Send to Claude" shortcut="⌘↵">
          <button
            type="button"
            aria-label="Send to Claude"
            disabled={!request.trim() || sending}
            onClick={() => void send()}
            className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, w: '9', h: '9', borderRadius: 'full', bg: 'accent.default', color: 'fg.onAccent', cursor: 'pointer', _hover: { _enabled: { bg: 'accent.hover' } }, _disabled: { bg: 'bg.muted', color: 'fg.subtle', cursor: 'not-allowed' }, '& svg': { w: '4.5', h: '4.5' } })}
          >
            <ArrowUp />
          </button>
        </WithTooltip>
      </div>
    </div>
  )
}

function BootFailureBanner({ reason, at, onDismiss }: { reason: string, at: string, onDismiss: () => void }) {
  return (
    <div role="alert" className={css({ display: 'flex', alignItems: 'flex-start', gap: '3', p: '4', borderRadius: 'xl', borderWidth: '1px', borderColor: 'danger.fg', bg: 'danger.subtle', '& > svg': { w: '5', h: '5', flexShrink: 0, color: 'danger.fg', mt: '0.5' } })}>
      <AlertTriangle />
      <div className={css({ flex: '1', minW: '0', fontSize: 'sm' })}>
        <p className={css({ fontWeight: 'semibold', color: 'fg.default' })}>Your last change broke the app, so it runs without local changes now.</p>
        <p className={css({ mt: '1', color: 'fg.muted' })}>
          {reason}
          {' '}
          {requestTime(at)}
          .
        </p>
      </div>
      <Button variant="outline" size="md" onClick={onDismiss}>Got it</Button>
    </div>
  )
}

export function FeedbackPage() {
  const state = useSelfImproveState()
  const refresh = useRefreshSelfImprove()
  const [doneShown, setDoneShown] = useState(DONE_PAGE)
  const changes = state.data?.changes ?? []
  const open = changes.filter(change => OPEN_STATUSES.includes(change.status))
  const needsYou = changes.filter(change => NEEDS_YOU_STATUSES.includes(change.status))
  const done = changes.filter(change => DONE_STATUSES.includes(change.status)).reverse()
  const now = useNow(open.length > 0)

  useEffect(() => {
    document.title = 'Feedback'
  }, [])

  async function act(action: () => Promise<unknown>) {
    await action().catch(() => null)
    await refresh()
  }

  const total = open.length + needsYou.length + done.length

  return (
    <div className={css({ minH: '100dvh', bg: 'bg.canvas' })}>
      <header className={css({ position: 'sticky', top: '0', zIndex: 'sticky', display: 'flex', alignItems: 'center', gap: '4', px: '4', py: '2.5', borderBottomWidth: '1px', borderColor: 'border.default', bg: 'bg.surface' })}>
        <WithTooltip label="Back to merge requests">
          <Link
            to={homePath()}
            aria-label="Back to merge requests"
            className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, w: '8', h: '8', borderRadius: 'md', color: 'fg.muted', _hover: { bg: 'bg.muted', color: 'fg.default' }, '& svg': { w: '4.5', h: '4.5' } })}
          >
            <ArrowLeft />
          </Link>
        </WithTooltip>
        <h1 className={css({ flex: '1', display: 'flex', alignItems: 'center', gap: '2', fontSize: 'md', fontWeight: 'semibold' })}>
          Feedback
          <span className={badge({ tone: 'accent' })}>Beta</span>
        </h1>
        <span className={css({ fontSize: 'sm', color: 'fg.subtle' })}>{`${total} ${total === 1 ? 'request' : 'requests'}`}</span>
        <SelfImproveButtons />
      </header>
      <main className={css({ maxW: '760px', mx: 'auto', px: { base: '4', md: '8' }, py: '8', display: 'flex', flexDir: 'column', gap: '8' })}>
        {state.isError && <ErrorState title="Local changes are not available" message={state.error.message} />}
        {state.data?.bootFailure && (
          <BootFailureBanner {...state.data.bootFailure} onDismiss={() => void act(api.dismissBootFailure)} />
        )}
        {state.isSuccess && <RequestBox onSent={() => void refresh()} />}
        {open.length > 0 && (
          <section>
            <h2 className={sectionTitle}>
              Agent's turn
              <span className={sectionCount}>{open.length}</span>
            </h2>
            <div className={css({ display: 'flex', flexDir: 'column', gap: '3' })}>
              {open.map(change => <ChangeCard key={change.id} change={change} now={now} onDismiss={() => void act(() => api.dismissChange(change.id))} />)}
            </div>
          </section>
        )}
        {needsYou.length > 0 && (
          <section>
            <h2 className={sectionTitle}>
              Needs you
              <span className={sectionCount}>{needsYou.length}</span>
            </h2>
            <div className={css({ display: 'flex', flexDir: 'column', gap: '3' })}>
              {needsYou.map(change => <ChangeCard key={change.id} change={change} now={now} onDismiss={() => void act(() => api.dismissChange(change.id))} />)}
            </div>
          </section>
        )}
        {done.length > 0 && (
          <section>
            <h2 className={sectionTitle}>
              Done
              <span className={sectionCount}>{done.length}</span>
            </h2>
            <ul className={card}>
              {done.slice(0, doneShown).map(change => <DoneRow key={change.id} change={change} />)}
            </ul>
            {done.length > doneShown && (
              <div className={css({ display: 'flex', justifyContent: 'center', mt: '4' })}>
                <Button size="md" onClick={() => setDoneShown(shown => shown + DONE_MORE)}>
                  {`Show ${Math.min(DONE_MORE, done.length - doneShown)} more`}
                </Button>
              </div>
            )}
          </section>
        )}
        {state.isSuccess && total === 0 && (
          <p className={css({ textAlign: 'center', fontSize: 'sm', color: 'fg.subtle' })}>
            No requests yet. Write one above, or use the crosshair in the header to point at a part of the app.
          </p>
        )}
      </main>
    </div>
  )
}
