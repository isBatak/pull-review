import type { ThinkingStep } from '../../shared/thinking-steps'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { fileName } from '../lib/format'
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

function Chip({ item, file }: { item: string, file: boolean }) {
  return (
    <span
      title={item}
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '1.5',
        maxW: '56',
        h: '6',
        px: '2',
        fontSize: 'xs',
        color: 'fg.muted',
        bg: 'bg.surface',
        borderWidth: '1px',
        borderColor: 'border.default',
        borderRadius: 'full',
        '& > svg': { w: '3', h: '3', flexShrink: 0, color: 'fg.subtle' },
      })}
    >
      {file ? <FileIcon name={fileName(item)} /> : <Search />}
      <span className={css({ truncate: true, fontFamily: file ? 'body' : 'mono' })}>{file ? fileName(item) : item}</span>
    </span>
  )
}

function Chips({ items, files }: { items: string[], files: boolean }) {
  const [expanded, setExpanded] = useState(false)
  if (!items.length)
    return null
  const shown = expanded ? items : items.slice(0, MAX_CHIPS)
  const hidden = items.length - shown.length
  return (
    <div className={css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.5', mt: '1.5' })}>
      {shown.map(item => <Chip key={item} item={item} file={files || looksLikeFile(item)} />)}
      {hidden > 0 && (
        <button type="button" onClick={() => setExpanded(true)} className={css({ fontSize: 'xs', color: 'fg.subtle', cursor: 'pointer', _hover: { color: 'fg.default' } })}>
          +{hidden} more
        </button>
      )}
    </div>
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
