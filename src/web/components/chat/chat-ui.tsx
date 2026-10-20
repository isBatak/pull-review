import './openui-setup'
import type { ComponentRenderer } from '@openuidev/react-lang'
import type { z } from 'zod/v4'
import type { calloutProps, checklistProps, fileListProps, followUpsProps, riskTableProps } from '../../../shared/chat-ui'
import type { MrRef } from '../../../shared/types'
import { Renderer, useIsStreaming } from '@openuidev/react-lang'
import { CheckCircle2, Circle, FileCode2, MessageSquare } from 'lucide-react'
import { createContext, use } from 'react'
import { css, cx } from 'styled-system/css'
import { badge } from 'styled-system/recipes'
import { createChatUiLibrary } from '../../../shared/chat-ui'
import { mrReference, summarizeMergeStatus } from '../../../shared/merge-status'
import { useMergeStatus } from '../../hooks/use-merge-request'
import { useRevealFile } from '../../lib/file-reveal'
import { useSettings } from '../../lib/settings'
import { fileName } from '../../lib/format'
import { Checks, Dot, TONE_COLOR } from './merge-status-bar'

interface ChatUiActions {
  mrRef: MrRef
  busy: boolean
  ask: (question: string) => void
}

export const ChatUiContext = createContext<ChatUiActions | null>(null)

const card = css({ display: 'flex', flexDir: 'column', gap: '2', p: '3', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg' })
const cardTitle = css({ fontSize: 'xs', fontWeight: 'semibold', color: 'fg.muted', textTransform: 'uppercase', letterSpacing: '0.04em' })

function FileLink({ path, line }: { path: string, line?: number }) {
  const reveal = useRevealFile()
  const label = line ? `${path}:${line}` : path
  return (
    <button
      type="button"
      title={`Open ${label} in the diff`}
      onClick={() => reveal?.(path, line ?? null)}
      className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', minW: '0', fontFamily: 'mono', fontSize: 'xs', color: 'accent.fg', cursor: 'pointer', textAlign: 'left', _hover: { textDecoration: 'underline' } })}
    >
      <FileCode2 className={css({ w: '3', h: '3', flexShrink: 0 })} />
      <span className={css({ truncate: true })}>{line ? `${fileName(path)}:${line}` : fileName(path)}</span>
    </button>
  )
}

const Stack: ComponentRenderer<{ children: unknown[] }> = ({ props, renderNode }) => (
  <div className={css({ display: 'flex', flexDir: 'column', gap: '2', my: '2' })}>{renderNode(props.children)}</div>
)

const CALLOUT_TONE = {
  info: css({ borderColor: 'border.strong', bg: 'bg.subtle' }),
  success: css({ borderColor: 'success.fg', bg: 'success.subtle' }),
  warning: css({ borderColor: 'warning.fg', bg: 'warning.subtle' }),
  danger: css({ borderColor: 'danger.fg', bg: 'danger.subtle' }),
}

const Callout: ComponentRenderer<z.infer<typeof calloutProps>> = ({ props }) => (
  <div className={cx(css({ px: '3', py: '2', borderLeftWidth: '3px', borderRadius: 'md' }), CALLOUT_TONE[props.tone] ?? CALLOUT_TONE.info)}>
    <p className={css({ fontSize: 'sm', fontWeight: 'semibold' })}>{props.title}</p>
    {props.text && <p className={css({ fontSize: 'xs', color: 'fg.muted', mt: '0.5' })}>{props.text}</p>}
  </div>
)

const LEVEL_BADGE = { low: badge({ tone: 'success' }), medium: badge({ tone: 'warning' }), high: badge({ tone: 'danger' }) }

const RiskTable: ComponentRenderer<z.infer<typeof riskTableProps>> = ({ props }) => (
  <div className={card}>
    <span className={cardTitle}>Risk</span>
    <ul className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
      {(props.rows ?? []).map((row, index) => (
        <li key={index} className={css({ display: 'flex', flexDir: 'column', gap: '0.5' })}>
          <span className={css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'sm' })}>
            <span className={LEVEL_BADGE[row.level] ?? badge()}>{row.level}</span>
            <span className={css({ fontWeight: 'medium' })}>{row.area}</span>
          </span>
          <span className={css({ fontSize: 'xs', color: 'fg.muted' })}>{row.reason}</span>
          {row.path && <FileLink path={row.path} line={row.line} />}
        </li>
      ))}
    </ul>
  </div>
)

const FileList: ComponentRenderer<z.infer<typeof fileListProps>> = ({ props }) => (
  <div className={card}>
    <span className={cardTitle}>{props.title}</span>
    <ul className={css({ display: 'flex', flexDir: 'column', gap: '1.5' })}>
      {(props.files ?? []).map((file, index) => (
        <li key={index} className={css({ display: 'flex', flexDir: 'column', gap: '0.5', minW: '0' })}>
          <FileLink path={file.path} line={file.line} />
          <span className={css({ fontSize: 'xs', color: 'fg.muted', pl: '4' })}>{file.note}</span>
        </li>
      ))}
    </ul>
  </div>
)

const Checklist: ComponentRenderer<z.infer<typeof checklistProps>> = ({ props }) => (
  <div className={card}>
    <span className={cardTitle}>{props.title}</span>
    <ul className={css({ display: 'flex', flexDir: 'column', gap: '1' })}>
      {(props.items ?? []).map((item, index) => (
        <li key={index} className={css({ display: 'flex', alignItems: 'flex-start', gap: '2', fontSize: 'sm' })}>
          {item.done
            ? <CheckCircle2 aria-label="Done" className={css({ w: '4', h: '4', mt: '0.5', color: 'success.fg', flexShrink: 0 })} />
            : <Circle aria-label="To check" className={css({ w: '4', h: '4', mt: '0.5', color: 'fg.subtle', flexShrink: 0 })} />}
          <span className={item.done ? css({ color: 'fg.muted' }) : undefined}>{item.text}</span>
        </li>
      ))}
    </ul>
  </div>
)

const MergeStatus: ComponentRenderer<Record<string, never>> = () => {
  const actions = use(ChatUiContext)!
  const [settings] = useSettings()
  const status = useMergeStatus(actions.mrRef, settings.liveMergeStatus).data
  if (!settings.liveMergeStatus)
    return null
  if (!status)
    return <div className={cx(card, css({ fontSize: 'xs', color: 'fg.muted' }))}>Loading the merge status…</div>
  const summary = summarizeMergeStatus(status)
  return (
    <div className={cx(card, css({ p: '0', gap: '0' }))}>
      <span className={css({ display: 'flex', alignItems: 'center', gap: '1.5', px: '3', py: '2', fontSize: 'xs', fontWeight: 'medium' })}>
        <Dot tone={summary.tone} />
        <span className={css({ color: 'fg.muted' })}>{mrReference(actions.mrRef.iid)}</span>
        <span className={TONE_COLOR[summary.tone]}>{summary.label}</span>
      </span>
      <Checks mrRef={actions.mrRef} status={status} />
    </div>
  )
}

const FollowUps: ComponentRenderer<z.infer<typeof followUpsProps>> = ({ props }) => {
  const actions = use(ChatUiContext)!
  const streaming = useIsStreaming()
  return (
    <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '1.5' })}>
      {(props.questions ?? []).map(question => (
        <button
          key={question}
          type="button"
          disabled={streaming || actions.busy}
          onClick={() => actions.ask(question)}
          className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', px: '2.5', py: '1', fontSize: 'xs', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'full', cursor: 'pointer', _hover: { bg: 'bg.muted' }, _disabled: { opacity: 0.5, cursor: 'not-allowed' } })}
        >
          <MessageSquare className={css({ w: '3', h: '3', color: 'fg.subtle' })} />
          {question}
        </button>
      ))}
    </div>
  )
}

const chatUiLibrary = createChatUiLibrary<ComponentRenderer<any>>({ Stack, Callout, RiskTable, FileList, Checklist, MergeStatus, FollowUps })

export function OpenUiBlock({ code, streaming }: { code: string, streaming: boolean }) {
  return <Renderer response={code} library={chatUiLibrary} isStreaming={streaming} />
}
