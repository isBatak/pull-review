import type { ChangeDiffFile, LocalChange } from '../../shared/self-improve'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, GitPullRequest } from 'lucide-react'
import { useState } from 'react'
import { css } from 'styled-system/css'
import { requestTime } from '../../shared/self-improve'
import { PatchFileCard } from '../components/patch-file-card'
import { Button, WithTooltip } from '../components/ui/button'
import { api, ApiError } from '../lib/api'
import { copyText, openExternal } from '../lib/platform'
import { useRefreshSelfImprove } from '../lib/self-improve'

export type RunAction = (action: () => Promise<unknown>) => Promise<string | null>

export function ActionError({ message }: { message: string | null }) {
  return message ? <p role="alert" className={css({ fontSize: 'xs', color: 'danger.fg' })}>{message}</p> : null
}

export function ReplyBox({ onSend, placeholder = 'Leave a reply…', initial = '' }: { onSend: (text: string) => Promise<string | null>, placeholder?: string, initial?: string }) {
  const [text, setText] = useState(initial)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!text.trim() || sending)
      return
    setSending(true)
    const problem = await onSend(text.trim())
    setSending(false)
    setError(problem)
    if (!problem)
      setText('')
  }

  return (
    <div className={css({ flex: '1', minW: '0', display: 'flex', flexDir: 'column', gap: '1' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
        <input
          value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          placeholder={placeholder}
          aria-label="Reply to Claude"
          className={css({ flex: '1', minW: '0', h: '9', bg: 'transparent', outline: 'none', fontSize: 'sm', color: 'fg.default', _placeholder: { color: 'fg.subtle' } })}
        />
        <WithTooltip label="Send reply" shortcut="↵">
          <button
            type="button"
            aria-label="Send reply"
            disabled={!text.trim() || sending}
            onClick={() => void send()}
            className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, w: '8', h: '8', borderRadius: 'full', bg: 'accent.default', color: 'fg.onAccent', cursor: 'pointer', _hover: { _enabled: { bg: 'accent.hover' } }, _disabled: { bg: 'bg.muted', color: 'fg.subtle', cursor: 'not-allowed' }, '& svg': { w: '4', h: '4' } })}
          >
            <ArrowUp />
          </button>
        </WithTooltip>
      </div>
      <ActionError message={error} />
    </div>
  )
}

export function Replies({ change }: { change: LocalChange }) {
  if (!change.replies.length)
    return null
  return (
    <ul className={css({ display: 'flex', flexDir: 'column', gap: '1.5', mt: '3', pl: '3', borderLeftWidth: '2px', borderColor: 'border.default' })}>
      {change.replies.map(reply => (
        <li key={reply.at} className={css({ fontSize: 'sm', color: 'fg.default', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>
          <span className={css({ fontSize: 'xs', color: 'fg.subtle', mr: '2' })}>{`You · ${requestTime(reply.at)}`}</span>
          {reply.text}
        </li>
      ))}
    </ul>
  )
}

function DiffFile({ file }: { file: ChangeDiffFile }) {
  if (file.diff === null) {
    return (
      <p className={css({ px: '3', py: '2', fontSize: 'xs', color: 'fg.subtle', bg: 'bg.subtle', borderRadius: 'md' })}>
        {`${file.path} changed, but the diff is too large to show here.`}
      </p>
    )
  }
  return <PatchFileCard path={file.path} diff={file.diff} label={file.area === 'source' ? 'Source' : 'Built file'} />
}

export function ChangeDiff({ change }: { change: LocalChange }) {
  const [showBuild, setShowBuild] = useState(false)
  const diff = useQuery({
    queryKey: ['change-diff', change.id, change.commits.join(',')],
    queryFn: () => api.changeDiff(change.id),
    retry: false,
  })
  if (diff.isPending)
    return <p className={css({ fontSize: 'xs', color: 'fg.subtle' })}>Loading the diff…</p>
  if (diff.isError)
    return <ActionError message={diff.error.message} />
  const source = diff.data.filter(file => file.area === 'source')
  const build = diff.data.filter(file => file.area === 'build')
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '3' })}>
      {source.length === 0 && <p className={css({ fontSize: 'xs', color: 'fg.subtle' })}>Claude changed no source files, so this change can't become a pull request yet.</p>}
      {source.map(file => <DiffFile key={`${file.commit}:${file.path}`} file={file} />)}
      {build.length > 0 && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setShowBuild(shown => !shown)}>
            {showBuild ? 'Hide the built files' : `Show the built files (${build.length})`}
          </Button>
        </div>
      )}
      {showBuild && build.map(file => <DiffFile key={`${file.commit}:${file.path}`} file={file} />)}
    </div>
  )
}

const FALLBACK_PROBLEMS = new Set(['gh-missing', 'gh-signed-out', 'does-not-apply'])
const PR_STATE_COLORS = { open: 'success.fg', merged: 'accent.fg', closed: 'fg.subtle' } as const

export function PrChip({ pr }: { pr: NonNullable<LocalChange['pr']> }) {
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      onClick={event => event.stopPropagation()}
      className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', flexShrink: 0, h: '6', px: '2', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'full', fontSize: 'xs', color: 'fg.muted', _hover: { bg: 'bg.muted' }, '& svg': { w: '3.5', h: '3.5' } })}
    >
      <GitPullRequest className={css({ color: PR_STATE_COLORS[pr.state] })} />
      {`#${pr.number} ${pr.state}`}
    </a>
  )
}

export function SendPr({ change }: { change: LocalChange }) {
  const refresh = useRefreshSelfImprove()
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<{ message: string, fallback: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  async function send() {
    setSending(true)
    setProblem(null)
    try {
      await api.sendChangePr(change.id)
      await refresh()
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProblem({ message, fallback: error instanceof ApiError && FALLBACK_PROBLEMS.has(error.code ?? '') })
    }
    finally {
      setSending(false)
    }
  }

  async function copyPatch() {
    const { patch } = await api.changePatch(change.id)
    await copyText(patch)
    setCopied(true)
  }

  async function openIssue() {
    const { issueUrl } = await api.changePatch(change.id)
    openExternal(issueUrl)
  }

  const open = change.pr?.state === 'open'
  return (
    <>
      <Button variant="ghost" size="md" disabled={sending} onClick={() => void send()}>
        {sending ? 'Sending…' : open ? 'Update PR' : 'Send as PR'}
      </Button>
      {problem && (
        <div className={css({ flexBasis: 'full', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2' })}>
          <ActionError message={problem.message} />
          {problem.fallback && (
            <>
              <Button size="sm" onClick={() => void copyPatch()}>{copied ? 'Copied' : 'Copy patch'}</Button>
              <Button size="sm" onClick={() => void openIssue()}>Open an issue</Button>
            </>
          )}
        </div>
      )}
    </>
  )
}
