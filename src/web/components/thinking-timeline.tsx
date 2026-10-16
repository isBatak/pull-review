import type { ThinkingItem, ThinkingStep } from '../../shared/thinking-steps'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { use, useEffect, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { api } from '../lib/api'
import { useRevealFile } from '../lib/file-reveal'
import { fileName } from '../lib/format'
import { useLocalRepo } from '../lib/local-repos'
import { useSettings } from '../lib/settings'
import { ReviewContext } from './review-context'
import { WithTooltip } from './ui/button'
import { FileIcon } from './ui/file-icon'

const MAX_CHIPS = 4

export type ThinkingOutcome = 'running' | 'done' | 'stopped' | 'error'

interface ThinkingTimelineProps {
  steps: ThinkingStep[]
  outcome: ThinkingOutcome
  startedAt?: string | null
  finishedAt?: string | null
  finishedMeta?: string
  collapseWhenDone?: boolean
}

const shimmer = css({
  bgImage: 'linear-gradient(90deg, token(colors.fg.subtle) 30%, token(colors.fg.default) 50%, token(colors.fg.subtle) 70%)',
  bgSize: '200% 100%',
  backgroundClip: 'text',
  color: 'transparent',
  animation: 'shimmer 2s linear infinite',
})

const rail = css({ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', columnGap: '2.5' })

const iconCell = css({ display: 'flex', flexDir: 'column', alignItems: 'center' })

const iconBox = css({ display: 'flex', alignItems: 'center', justifyContent: 'center', w: '5', h: '5', flexShrink: 0, color: 'fg.subtle', '& svg': { w: '3.5', h: '3.5' } })

const line = css({ flex: '1', w: '1px', minH: '2', bg: 'border.default' })

function useElapsedSeconds(startedAt: string | null | undefined, finishedAt: string | null | undefined, running: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running)
      return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  if (!startedAt)
    return null
  const end = finishedAt && !running ? new Date(finishedAt).getTime() : now
  return Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000))
}

function formatSeconds(seconds: number) {
  if (seconds < 60)
    return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function looksLikeFile(item: string) {
  return /\.[a-z0-9]+$/i.test(item) && !/[*?{}]/.test(item)
}

const GENERIC_NAME = /^(?:index|readme|skill|package|main|mod|types|utils|config)\.[a-z0-9]+$/i

function chipLabel(item: ThinkingItem, ambiguous: boolean) {
  const name = fileName(item.text)
  const parent = item.text.split('/').slice(-2, -1)[0]
  return (ambiguous || GENERIC_NAME.test(name)) && parent ? `${parent}/${name}` : name
}

type ChipAction = { kind: 'diff' } | { kind: 'editor', repoPath: string } | null

function useChipAction() {
  const review = use(ReviewContext)
  const revealFile = useRevealFile()
  const localRepo = useLocalRepo(review?.mergeRequest.ref ?? { host: '', project: '', iid: 0 })
  const [settings] = useSettings()
  const changed = new Set(review?.files.flatMap(file => [file.path, file.previousPath ?? file.path]) ?? [])

  function actionFor(item: ThinkingItem): ChipAction {
    if (item.root !== 'repo')
      return null
    if (revealFile && changed.has(item.text))
      return { kind: 'diff' }
    return localRepo.path ? { kind: 'editor', repoPath: localRepo.path } : null
  }

  async function open(item: ThinkingItem, action: ChipAction) {
    if (action?.kind === 'diff')
      revealFile?.(item.text, item.line)
    else if (action?.kind === 'editor')
      await api.openInEditor({ repoPath: action.repoPath, path: item.text, line: item.line ?? 1, column: 1, editor: settings.editor })
  }

  return { actionFor, open }
}

const ACTION_HINTS = {
  diff: 'Click to show it in the diff.',
  editor: 'Click to open it in your editor.',
}

function describeItem(item: ThinkingItem, action: ChipAction) {
  if (item.root === 'context')
    return 'A context file Pull Review wrote for Claude, with the merge request details.'
  if (item.root === null && item.text.startsWith('/'))
    return 'Outside the repository.'
  if (!action)
    return 'Add a local repository for this project to open it in your editor.'
  return ACTION_HINTS[action.kind]
}

const chip = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1.5',
  maxW: '64',
  h: '6',
  px: '2',
  fontSize: 'xs',
  color: 'fg.muted',
  bg: 'bg.surface',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'full',
  '& > svg': { w: '3', h: '3', flexShrink: 0, color: 'fg.subtle' },
  '&:is(button)': { cursor: 'pointer', _hover: { borderColor: 'border.strong', color: 'fg.default' } },
})

function FileChip({ item, ambiguous, actions, onError }: { item: ThinkingItem, ambiguous: boolean, actions: ReturnType<typeof useChipAction>, onError: (message: string | null) => void }) {
  const action = actions.actionFor(item)
  const label = chipLabel(item, ambiguous)
  const content = (
    <>
      <FileIcon name={fileName(item.text)} />
      <span className={css({ truncate: true })}>{label}</span>
      {item.line && <span className={css({ flexShrink: 0, color: 'fg.subtle' })}>:{item.line}</span>}
    </>
  )
  const tooltip = (
    <>
      <span className={css({ display: 'block', fontFamily: 'mono', wordBreak: 'break-all' })}>{item.text}{item.line ? `:${item.line}` : ''}</span>
      <span className={css({ display: 'block', mt: '1', color: 'tooltip.fg', opacity: 0.75 })}>{describeItem(item, action)}</span>
    </>
  )
  return (
    <WithTooltip label={tooltip}>
      {action
        ? (
            <button
              type="button"
              className={chip}
              aria-label={`${action.kind === 'diff' ? 'Show' : 'Open'} ${item.text}`}
              onClick={() => {
                onError(null)
                actions.open(item, action).catch((cause: unknown) => onError(cause instanceof Error ? cause.message : String(cause)))
              }}
            >
              {content}
            </button>
          )
        : <span className={chip} tabIndex={0}>{content}</span>}
    </WithTooltip>
  )
}

function SearchChip({ text }: { text: string }) {
  return (
    <WithTooltip label={<span className={css({ fontFamily: 'mono', wordBreak: 'break-all' })}>{text}</span>}>
      <span className={chip} tabIndex={0}>
        <Search />
        <span className={css({ truncate: true, fontFamily: 'mono' })}>{text}</span>
      </span>
    </WithTooltip>
  )
}

function Chips({ items, files }: { items: ThinkingItem[], files: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actions = useChipAction()
  if (!items.length)
    return null
  const shown = expanded ? items : items.slice(0, MAX_CHIPS)
  const hidden = items.length - shown.length
  const names = items.map(item => fileName(item.text))
  return (
    <>
      <div className={css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.5', mt: '1.5' })}>
        {shown.map(item => files || looksLikeFile(item.text)
          ? <FileChip key={item.text} item={item} ambiguous={names.filter(name => name === fileName(item.text)).length > 1} actions={actions} onError={setError} />
          : <SearchChip key={item.text} text={item.text} />)}
        {hidden > 0 && (
          <button type="button" onClick={() => setExpanded(true)} className={css({ fontSize: 'xs', color: 'fg.subtle', cursor: 'pointer', _hover: { color: 'fg.default' } })}>
            +{hidden} more
          </button>
        )}
      </div>
      {error && <div className={css({ mt: '1', fontSize: 'xs', color: 'danger.fg' })}>{error}</div>}
    </>
  )
}

function ActiveRing() {
  return (
    <span className={css({ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', w: '3.5', h: '3.5' })}>
      <span className={css({ position: 'absolute', inset: '0', borderRadius: 'full', borderWidth: '1.5px', borderColor: 'fg.default', borderBottomColor: 'transparent', animation: 'spin 1s linear infinite' })} />
      <span className={css({ w: '1.5', h: '1.5', borderRadius: 'full', bg: 'fg.default' })} />
    </span>
  )
}

function Dot() {
  return <span className={css({ w: '1.5', h: '1.5', borderRadius: 'full', bg: 'fg.subtle', opacity: 0.6 })} />
}

function StepIcon({ step, index, active }: { step: ThinkingStep, index: number, active: boolean }) {
  if (active)
    return <ActiveRing />
  if (index === 0 && step.kind === 'search')
    return <Search />
  return <Dot />
}

function FinalIcon({ outcome }: { outcome: ThinkingOutcome }) {
  if (outcome === 'done') {
    return (
      <span className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', w: '4', h: '4', borderRadius: 'full', bg: 'accent.default', color: 'fg.onAccent', '& svg': { w: '2.5', h: '2.5', strokeWidth: 3 } })}>
        <Check />
      </span>
    )
  }
  return <X className={css({ color: outcome === 'error' ? 'danger.fg' : 'fg.subtle' })} />
}

const FINAL_LABELS: Record<Exclude<ThinkingOutcome, 'running'>, string> = {
  done: 'Finished thinking',
  stopped: 'Stopped',
  error: 'Stopped with an error',
}

export function ThinkingTimeline({ steps, outcome, startedAt, finishedAt, finishedMeta, collapseWhenDone = false }: ThinkingTimelineProps) {
  const running = outcome === 'running'
  const [open, setOpen] = useState(running || !collapseWhenDone)
  useEffect(() => {
    if (running)
      setOpen(true)
    else if (collapseWhenDone)
      setOpen(false)
  }, [running, collapseWhenDone])
  const seconds = useElapsedSeconds(startedAt, finishedAt, running)
  const rows = running ? steps : [...steps, null]

  return (
    <div className={css({ fontSize: 'sm' })}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx(rail, css({ w: 'full', textAlign: 'left', cursor: 'pointer', alignItems: 'center', minH: '6', '&:hover .label': { color: 'fg.default' } }))}
      >
        <span className={iconBox}>
          <ChevronDown className={css({ transition: 'transform 150ms', transform: open ? 'none' : 'rotate(-90deg)' })} />
        </span>
        <span className={css({ display: 'flex', alignItems: 'baseline', gap: '2' })}>
          {running
            ? <span className={shimmer}>Thinking</span>
            : <span className={cx('label', css({ color: 'fg.muted' }))}>{seconds === null ? 'Thinking steps' : `Thought for ${formatSeconds(seconds)}`}</span>}
          {running && seconds !== null && <span className={css({ fontSize: 'xs', color: 'fg.subtle', fontVariantNumeric: 'tabular-nums' })}>{formatSeconds(seconds)}</span>}
        </span>
      </button>

      {open && rows.length > 0 && (
        <ol className={css({ mt: '2' })}>
          {rows.map((step, index) => {
            const last = index === rows.length - 1
            const active = running && last
            return (
              <li key={step?.id ?? 'final'} className={rail}>
                <span className={iconCell}>
                  <span className={iconBox}>
                    {step ? <StepIcon step={step} index={index} active={active} /> : <FinalIcon outcome={outcome} />}
                  </span>
                  {!last && <span className={line} />}
                </span>
                <div className={css({ minW: '0', pb: last ? '0' : '3', pt: '0.5' })}>
                  {step
                    ? (
                        <>
                          <div className={active ? shimmer : css({ color: 'fg.muted' })}>{active ? step.activeLabel : step.doneLabel}</div>
                          <Chips items={step.items} files={step.kind === 'read'} />
                        </>
                      )
                    : (
                        <div className={css({ display: 'flex', alignItems: 'baseline', gap: '2', flexWrap: 'wrap' })}>
                          <span className={css({ color: outcome === 'done' ? 'fg.default' : 'fg.muted', fontWeight: 'medium' })}>{FINAL_LABELS[outcome as Exclude<ThinkingOutcome, 'running'>]}</span>
                          {finishedMeta && <span className={css({ fontSize: 'xs', color: 'fg.subtle' })}>{finishedMeta}</span>}
                        </div>
                      )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
