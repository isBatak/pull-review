import type { ChatCodeContext, ChatMessage, ChatToolUse, ChatWorkspace } from '../../../shared/chat'
import type { PromptViewerRequest } from './prompt-viewer'
import type { MrRef } from '../../../shared/types'
import { ArrowUp, Check, ClipboardCopy, Eye, FileCode2, FolderGit2, GitPullRequestArrow, Loader2, MessageSquare, MessageSquarePlus, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { css, cx } from 'styled-system/css'
import type { ReplyContexts } from '../../../shared/chat'
import { buildContextText, contextsForReply, describeRange, discussionsInContexts, fixedContexts, isPatch, repairDiffFences } from '../../../shared/chat'
import { api } from '../../lib/api'
import { createLineMap } from '../../../shared/line-map'
import type { SuggestionDraft } from '../../../shared/suggestions'
import { parseSuggestionRange, parseUnifiedPatch, patchHasChanges, planSuggestions } from '../../../shared/suggestions'
import { codeForRange } from '../../../shared/line-map'
import { SuggestionBlock } from '../suggestion-block'
import type { CommentProposal, CommentTarget } from '../../../shared/comment-proposals'
import { resolveCommentTarget } from '../../../shared/comment-proposals'
import { useChatControls, useChatDraft, useChatSession } from '../../lib/chat'
import { localChangesKey, useLocalRepo } from '../../lib/local-repos'
import { useLocalFixes } from '../../lib/local-fixes'
import { useDiscussions } from '../../hooks/use-merge-request'
import { MODEL_OPTIONS } from '../../lib/model-options'
import { EffortSlider } from '../ui/effort-slider'
import { useSettings } from '../../lib/settings'
import { fileName } from '../../lib/format'
import { LinkRepoForm } from '../link-repo-form'
import { useReview } from '../review-context'
import { Button, IconButton } from '../ui/button'
import { Markdown } from '../ui/markdown'
import { Select } from '../ui/select'
import { parsePatch, PatchView } from './patch-view'
import { PromptViewer } from './prompt-viewer'
import { MergeStatusBar } from './merge-status-bar'
import { stepsFromTools } from '../../../shared/thinking-steps'
import { ThinkingTimeline } from '../thinking-timeline'
import { ClaudeReviewPanel } from '../claude-review-panel'
import { UnderlineTabs } from '../ui/underline-tabs'
import { useClaudeReviewControls } from '../../lib/claude-review'
import { useStoredState } from '../../lib/stored-state'

const RESET_COMMANDS = new Set(['/clear', '/new', '/reset'])

const spinner = css({ animation: 'spin', flexShrink: 0 })

function describeThreads(count: number) {
  return count === 1 ? '1 review thread' : `${count} review threads`
}

function contextRequest(context: ChatCodeContext): PromptViewerRequest {
  return {
    title: `${fileName(context.path)}, ${describeRange(context)}`,
    description: 'This is the exact text this attachment adds to your message.',
    load: async () => ({ sections: [{ label: 'Added to your message', detail: context.path, text: buildContextText(context) }] }),
  }
}

interface ContextChipProps {
  context: ChatCodeContext
  live?: boolean
  onOpen: (request: PromptViewerRequest) => void
  onRemove?: () => void
}

function ContextChip({ context, live, onOpen, onRemove }: ContextChipProps) {
  const threadCount = context.threads.length
  const summary = `${context.path}, ${describeRange(context)}${threadCount ? `, with ${describeThreads(threadCount)}` : ''}`
  return (
    <span
      title={`${live ? `Selected in the diff: ${summary}` : summary}. Click to see what is sent.`}
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '1',
        maxW: 'full',
        h: '6',
        pl: '1.5',
        pr: onRemove ? '0.5' : '1.5',
        fontSize: 'xs',
        bg: live ? 'accent.subtle' : 'bg.muted',
        color: live ? 'accent.fg' : 'fg.muted',
        borderWidth: '1px',
        borderStyle: 'dashed',
        borderColor: live ? 'accent.default' : 'transparent',
        borderRadius: 'md',
      })}
    >
      <button
        type="button"
        aria-label={`Show what ${fileName(context.path)}, ${describeRange(context)} adds to the message`}
        onClick={() => onOpen(contextRequest(context))}
        className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', minW: '0', cursor: 'pointer', _hover: { color: 'fg.default', '& .range': { textDecoration: 'underline' } }, '& > svg': { w: '3.5', h: '3.5', flexShrink: 0 } })}
      >
        <FileCode2 />
        <span className={css({ truncate: true, fontFamily: 'mono' })}>{fileName(context.path)}</span>
        <span className={`range ${css({ flexShrink: 0, color: 'fg.subtle' })}`}>{describeRange(context)}</span>
        {threadCount > 0 && (
          <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '0.5', flexShrink: 0, '& svg': { w: '3', h: '3' } })}>
            <MessageSquare />
            {threadCount}
          </span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${context.path}`}
          onClick={onRemove}
          className={css({ display: 'inline-flex', p: '0.5', borderRadius: 'sm', cursor: 'pointer', _hover: { bg: 'bg.emphasized', color: 'fg.default' }, '& svg': { w: '3', h: '3' } })}
        >
          <X />
        </button>
      )}
    </span>
  )
}

function WorkspaceBar({ mrRef, workspace, repoPath, onRepoPathChange }: { mrRef: MrRef, workspace: ChatWorkspace, repoPath: string | null, onRepoPathChange: (path: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const shownKind = repoPath ? workspace.kind : 'diff-only'

  let message: React.ReactNode
  if (shownKind === 'preparing' || (repoPath && shownKind === 'diff-only'))
    message = <><Loader2 className={spinner} /> Preparing a copy of the repository at this merge request…</>
  else if (shownKind === 'ready' && workspace.kind === 'ready')
    message = <><FolderGit2 /> Full files from {workspace.repoPath} at {workspace.headSha.slice(0, 8)}</>
  else if (shownKind === 'error' && workspace.kind === 'error')
    message = <span className={css({ color: 'danger.fg' })}>{workspace.message}</span>
  else
    message = <>Claude sees only the diff. Add your local copy of the repository so it can read full files.</>

  return (
    <div className={css({ flexShrink: 0, px: '3', py: '2', fontSize: 'xs', color: 'fg.muted', bg: 'bg.subtle', borderBottomWidth: '1px', borderColor: 'border.default' })}>
      <div className={css({ display: 'flex', alignItems: 'flex-start', gap: '1.5', '& svg': { w: '3.5', h: '3.5', mt: '0.5', flexShrink: 0 } })}>
        <span className={css({ display: 'flex', gap: '1.5', minW: '0', flex: '1', wordBreak: 'break-word' })}>{message}</span>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className={css({ flexShrink: 0, color: 'accent.fg', cursor: 'pointer', _hover: { textDecoration: 'underline' } })}>
            {repoPath ? 'Change' : 'Add folder'}
          </button>
        )}
      </div>
      {editing && (
        <div className={css({ mt: '2' })}>
          <LinkRepoForm
            project={mrRef}
            initialPath={repoPath ?? ''}
            onCancel={() => setEditing(false)}
            onLinked={(path) => {
              onRepoPathChange(path)
              setEditing(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

function MessageThinking({ message }: { message: ChatMessage }) {
  const steps = useMemo(() => stepsFromTools(message.tools), [message.tools])
  if (message.status !== 'streaming' && !steps.length)
    return null
  const outcome = message.status === 'streaming' ? 'running' : message.status === 'done' ? 'done' : message.status
  return (
    <div className={css({ mb: '3' })}>
      <ThinkingTimeline steps={steps} outcome={outcome} startedAt={message.startedAt} finishedAt={message.finishedAt} collapseWhenDone />
    </div>
  )
}

type SuggestState = { kind: 'idle' } | { kind: 'working' } | { kind: 'done', opened: number, skipped: string[] } | { kind: 'error', message: string }

type ApplyState = { kind: 'idle' } | { kind: 'applying' } | { kind: 'applied', files: string[], alreadyApplied: boolean } | { kind: 'error', message: string }

function PatchActions({ mrRef, repoPath, patch, question }: { mrRef: MrRef, repoPath: string | null, patch: string, question: ReplyContexts }) {
  const [copied, setCopied] = useState(false)
  const [apply, setApply] = useState<ApplyState>({ kind: 'idle' })
  const [suggest, setSuggest] = useState<SuggestState>({ kind: 'idle' })
  const queryClient = useQueryClient()
  const [, setParams] = useSearchParams()
  const { mergeRequest, files } = useReview()
  const discussions = useDiscussions(mrRef).data
  const { addFix } = useLocalFixes(mrRef)
  const openSuggestions = useChatControls()?.openSuggestions

  async function suggestInGitlab() {
    setSuggest({ kind: 'working' })
    try {
      const patchFiles = parseUnifiedPatch(patch)
      const mrFiles = new Map(files.filter(file => file.status !== 'removed').map(file => [file.path, file]))
      const contents = new Map<string, string | null>()
      await Promise.all(patchFiles.map(async (patchFile) => {
        if (!patchFile.newPath || !mrFiles.has(patchFile.newPath))
          return
        const pair = await api.fileContents(mergeRequest.ref, mergeRequest.diffRefs, null, patchFile.newPath)
        contents.set(patchFile.newPath, pair.newContents)
      }))
      const plan = planSuggestions(patchFiles, (path) => {
        const file = mrFiles.get(path)
        const headContents = contents.get(path)
        if (!file || headContents === undefined)
          return null
        const lineMap = createLineMap(file.diff)
        return { headContents, shows: line => lineMap.shows('additions', line) }
      })
      openSuggestions?.(plan.drafts)
      setSuggest({ kind: 'done', opened: plan.drafts.length, skipped: plan.skipped })
    }
    catch (cause) {
      setSuggest({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(patch)
    setCopied(true)
  }

  async function applyToRepo() {
    if (!repoPath)
      return
    setApply({ kind: 'applying' })
    try {
      const result = await api.applyPatch(mrRef, repoPath, patch)
      setApply({ kind: 'applied', files: result.files, alreadyApplied: result.alreadyApplied })
      const contexts = fixedContexts(question, result.files)
      addFix({
        discussionIds: discussionsInContexts(contexts, discussions ?? []),
        findingIds: contexts.flatMap(context => context.threads.flatMap(thread => thread.findingId ?? [])),
        paths: result.files,
      })
      void queryClient.invalidateQueries({ queryKey: localChangesKey(mrRef, repoPath) })
    }
    catch (cause) {
      setApply({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '1.5', mt: '1.5' })}>
      <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '1.5' })}>
        <Button size="xs" onClick={() => void copy()}>
          {copied ? <Check /> : <ClipboardCopy />}
          {copied ? 'Copied' : 'Copy patch'}
        </Button>
        <Button size="xs" disabled={suggest.kind === 'working'} title="Open comment boxes on the changed lines, filled with GitLab suggestions. Nothing is posted until you click Comment." onClick={() => void suggestInGitlab()}>
          {suggest.kind === 'working' ? <Loader2 className={spinner} /> : <MessageSquarePlus />}
          Suggest in GitLab
        </Button>
        {repoPath && (
          <Button
            size="xs"
            disabled={apply.kind === 'applying' || apply.kind === 'applied'}
            title={`Apply to ${repoPath}`}
            onClick={() => void applyToRepo()}
          >
            {apply.kind === 'applying' ? <Loader2 className={spinner} /> : <GitPullRequestArrow />}
            {apply.kind === 'applied' ? (apply.alreadyApplied ? 'Already applied' : 'Applied') : 'Apply to local repository'}
          </Button>
        )}
      </div>
      {suggest.kind === 'done' && (
        <div className={css({ fontSize: 'xs', color: suggest.opened ? 'success.fg' : 'fg.muted' })}>
          {suggest.opened
            ? `Opened ${suggest.opened === 1 ? '1 comment box' : `${suggest.opened} comment boxes`} in the diff. Check each one and click Comment to post it.`
            : 'No comment boxes could be opened.'}
          {suggest.skipped.length > 0 && (
            <ul className={css({ mt: '1', pl: '4', listStyle: 'disc', color: 'fg.muted' })}>
              {suggest.skipped.map(reason => <li key={reason}>{reason}</li>)}
            </ul>
          )}
        </div>
      )}
      {suggest.kind === 'error' && <div className={css({ fontSize: 'xs', color: 'danger.fg' })}>{suggest.message}</div>}
      {apply.kind === 'applied' && (
        <div className={css({ fontSize: 'xs', color: 'success.fg' })}>
          {apply.alreadyApplied
            ? `This patch is already in ${repoPath}, so nothing was changed. The comments it fixes are marked as fixed locally. `
            : `Changed ${apply.files.join(', ') || 'no files'} in ${repoPath}. The changes are not committed yet. `}
          <button
            type="button"
            onClick={() => setParams((current) => {
              const next = new URLSearchParams(current)
              next.set('tab', 'local')
              return next
            }, { replace: true })}
            className={css({ color: 'accent.fg', textDecoration: 'underline', cursor: 'pointer' })}
          >
            View local changes
          </button>
        </div>
      )}
      {apply.kind === 'error' && (
        <div className={css({ fontSize: 'xs', color: 'danger.fg', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>{apply.message}</div>
      )}
    </div>
  )
}

function PatchBlock({ mrRef, repoPath, patch, question }: { mrRef: MrRef, repoPath: string | null, patch: string, question: ReplyContexts }) {
  const files = useMemo(() => parsePatch(patch), [patch])
  return (
    <div>
      {files.length ? <PatchView files={files} /> : <pre>{patch}</pre>}
      {patchHasChanges(patch)
        ? <PatchActions mrRef={mrRef} repoPath={repoPath} patch={patch} question={question} />
        : (
            <div className={css({ mt: '1.5', fontSize: 'xs', color: 'warning.fg' })}>
              This patch has no changed lines, so it looks cut off. Ask Claude to send the whole patch again.
            </div>
          )}
    </div>
  )
}

interface CommentCardProps {
  proposal: CommentProposal
  target: CommentTarget
  opened: boolean
  baseUrl: string
  onOpen: (draft: SuggestionDraft) => void
}

function CommentCard({ proposal, target, opened, baseUrl, onOpen }: CommentCardProps) {
  const { files } = useReview()

  function renderSuggestion(language: string | null, code: string) {
    const range = parseSuggestionRange(language)
    const file = target.kind === 'ok' && proposal.side === 'additions' ? files.find(each => each.path === target.draft.path) : undefined
    if (!range || !file)
      return null
    const original = codeForRange(file.diff, 'additions', proposal.line - range.above, proposal.line + range.below)
    return original === null ? null : <SuggestionBlock path={file.path} original={original} suggested={code} />
  }

  return (
    <div className={css({ borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', overflow: 'hidden' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', minH: '8', px: '3', fontSize: 'xs', bg: 'bg.subtle', borderBottomWidth: '1px', borderColor: 'border.default', '& svg': { w: '3.5', h: '3.5', color: 'fg.subtle', flexShrink: 0 } })}>
        <MessageSquare />
        <span className={css({ fontWeight: 'semibold', flexShrink: 0 })}>Comment on</span>
        <span className={css({ fontFamily: 'mono', truncate: true })} title={proposal.path}>{`${proposal.path}:${proposal.line}`}</span>
        {proposal.side === 'deletions' && <span className={css({ color: 'fg.subtle', flexShrink: 0 })}>old version</span>}
      </div>
      <div className={css({ px: '3', py: '2' })}>
        <Markdown baseUrl={baseUrl} renderCodeBlock={renderSuggestion}>{proposal.body}</Markdown>
      </div>
      <div className={css({ px: '3', pb: '2' })}>
        {target.kind === 'ok'
          ? (
              <Button size="xs" disabled={opened} title="Open a comment box on this line, filled with this text. Nothing is posted until you click Comment." onClick={() => onOpen(target.draft)}>
                {opened ? <Check /> : <MessageSquarePlus />}
                {opened ? 'Opened in the diff' : 'Add to diff'}
              </Button>
            )
          : <div className={css({ fontSize: 'xs', color: 'warning.fg' })}>{target.message}</div>}
      </div>
    </div>
  )
}

function CommentCards({ tools, baseUrl }: { tools: ChatToolUse[], baseUrl: string }) {
  const { files } = useReview()
  const openSuggestions = useChatControls()?.openSuggestions
  const [opened, setOpened] = useState<Set<string>>(() => new Set())
  const cards = useMemo(() => tools.flatMap(tool => tool.comment && !tool.failed ? [{ id: tool.id, proposal: tool.comment, target: resolveCommentTarget(files, tool.comment) }] : []), [tools, files])
  const waiting = cards.filter(card => card.target.kind === 'ok' && !opened.has(card.id))
  if (!cards.length)
    return null

  function open(ids: string[], drafts: SuggestionDraft[]) {
    openSuggestions?.(drafts)
    setOpened(current => new Set([...current, ...ids]))
  }

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '2', mt: '3' })}>
      {cards.map(card => (
        <CommentCard key={card.id} proposal={card.proposal} target={card.target} opened={opened.has(card.id)} baseUrl={baseUrl} onOpen={draft => open([card.id], [draft])} />
      ))}
      {waiting.length > 1 && (
        <div>
          <Button size="xs" variant="solid" onClick={() => open(waiting.map(card => card.id), waiting.flatMap(card => card.target.kind === 'ok' ? [card.target.draft] : []))}>
            <MessageSquarePlus />
            {`Add all ${waiting.length} to diff`}
          </Button>
        </div>
      )}
      {opened.size > 0 && <div className={css({ fontSize: 'xs', color: 'success.fg' })}>Check each comment in the diff and click Comment to post it.</div>}
    </div>
  )
}

interface MessageViewProps {
  message: ChatMessage
  baseUrl: string
  mrRef: MrRef
  repoPath: string | null
  question: ReplyContexts
  onOpen: (request: PromptViewerRequest) => void
}

function MessageView({ message, baseUrl, mrRef, repoPath, question, onOpen }: MessageViewProps) {
  if (message.role === 'user') {
    return (
      <div className={cx('group', css({ alignSelf: 'flex-end', maxW: '90%', display: 'flex', flexDir: 'column', alignItems: 'flex-end', gap: '1.5' }))}>
        {message.contexts.length > 0 && (
          <div className={css({ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '1' })}>
            {message.contexts.map((context, index) => <ContextChip key={index} context={context} onOpen={onOpen} />)}
          </div>
        )}
        <div className={css({ px: '3', py: '2', fontSize: 'sm', bg: 'accent.subtle', color: 'fg.default', borderRadius: 'lg', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>
          {message.text}
        </div>
        <button
          type="button"
          onClick={() => onOpen({
            title: 'What was sent to Claude',
            description: 'The message and instructions exactly as Pull Review sent them for this question.',
            load: () => api.chatSent(mrRef, message.id),
          })}
          className={css({ fontSize: 'xs', color: 'fg.subtle', cursor: 'pointer', opacity: 0, _groupHover: { opacity: 1 }, _focusVisible: { opacity: 1 }, _hover: { color: 'accent.fg', textDecoration: 'underline' } })}
        >
          View what was sent
        </button>
      </div>
    )
  }

  return (
    <div className={css({ minW: '0' })}>
      <MessageThinking message={message} />
      {message.text && (
        <Markdown
          baseUrl={baseUrl}
          renderCodeBlock={message.status === 'done'
            ? (language, code) => isPatch(language, code) ? <PatchBlock mrRef={mrRef} repoPath={repoPath} patch={code} question={question} /> : null
            : undefined}
        >
          {repairDiffFences(message.text)}
        </Markdown>
      )}
      {message.status !== 'streaming' && <CommentCards tools={message.tools} baseUrl={baseUrl} />}
      {message.status === 'stopped' && !message.tools.length && <div className={css({ mt: '1', fontSize: 'xs', color: 'fg.subtle' })}>Stopped.</div>}
      {message.status === 'error' && (
        <div className={css({ mt: '2', px: '3', py: '2', fontSize: 'xs', color: 'danger.fg', bg: 'danger.subtle', borderRadius: 'md', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>
          {message.error}
        </div>
      )}
    </div>
  )
}

const composerBox = css({
  display: 'flex',
  flexDir: 'column',
  gap: '2',
  p: '2',
  bg: 'bg.surface',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'lg',
  _focusWithin: { borderColor: 'accent.default' },
})

interface ChatPanelProps {
  mrRef: MrRef
  baseUrl: string
}

export function ChatPanel({ mrRef, baseUrl }: ChatPanelProps) {
  const controls = useChatControls()!
  const chatDraft = useChatDraft()
  const attached = chatDraft.selection ? [...chatDraft.contexts, chatDraft.selection] : chatDraft.contexts
  const { state, apply } = useChatSession(mrRef, true)
  const localRepo = useLocalRepo(mrRef)
  const [settings, updateSettings] = useSettings()
  const modelChoice = { model: settings.chatModel, effort: settings.chatEffort }
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [viewer, setViewer] = useState<PromptViewerRequest | null>(null)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stickToBottom = useRef(true)
  const claudeReview = useClaudeReviewControls()
  const [storedTab, setTab] = useStoredState<'chat' | 'review'>('pull-review:ai-tab', 'chat')
  const tab = claudeReview && storedTab === 'review' ? 'review' : 'chat'
  const findingCount = claudeReview?.current ? claudeReview.state.findings.filter(finding => finding.status !== 'dismissed').length : 0

  useEffect(() => {
    if (localRepo.loading)
      return
    api.chatPrepare(mrRef, localRepo.path).then(apply, (cause: Error) => setError(cause.message))
  }, [mrRef.host, mrRef.project, mrRef.iid, localRepo.path, localRepo.loading])

  useEffect(() => {
    const element = scrollRef.current
    if (element && stickToBottom.current)
      element.scrollTop = element.scrollHeight
  }, [state])

  useEffect(() => {
    if (chatDraft.contexts.length)
      inputRef.current?.focus()
  }, [chatDraft.contexts.length])

  async function resetConversation() {
    setError(null)
    try {
      apply(await api.chatReset(mrRef))
      setDraft('')
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function send(text: string) {
    if (!sending && RESET_COMMANDS.has(text.trim().toLowerCase()))
      return resetConversation()
    if (!text.trim() || sending || state.running)
      return
    setSending(true)
    setError(null)
    stickToBottom.current = true
    try {
      apply(await api.chatSend(mrRef, { text, contexts: attached, repoPath: localRepo.path, ...modelChoice }))
      setDraft('')
      chatDraft.clear()
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setSending(false)
    }
  }

  const busy = state.running || state.messages.some(message => message.status === 'streaming')

  return (
    <aside aria-label="Claude" className={css({ display: 'flex', flexDir: 'column', h: 'full', minH: '0', bg: 'bg.surface' })}>
      <div className={css({ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '2', h: '10', pl: '3', pr: '1.5', borderBottomWidth: '1px', borderColor: 'border.default' })}>
        <Sparkles className={css({ w: '4', h: '4', color: 'accent.fg', flexShrink: 0 })} />
        <UnderlineTabs
          label="Claude"
          size="sm"
          value={tab}
          onChange={setTab}
          className={css({ flex: '1', alignSelf: 'stretch', alignItems: 'center' })}
          tabs={[
            { value: 'chat', label: 'Chat' },
            ...(claudeReview
              ? [{
                  value: 'review' as const,
                  label: 'Review',
                  count: findingCount || null,
                  badge: claudeReview.state.status === 'running' && <span aria-label="Review running" className={css({ w: '1.5', h: '1.5', borderRadius: 'full', bg: 'accent.default', animation: 'pulse 1.5s ease-in-out infinite' })} />,
                }]
              : []),
          ]}
        />
        {tab === 'chat' && (
          <IconButton size="xs" label="New conversation" disabled={!state.messages.length} onClick={() => void resetConversation()}>
            <RotateCcw />
          </IconButton>
        )}
        <IconButton size="xs" label="Close chat" onClick={() => controls.setOpen(false)}>
          <X />
        </IconButton>
      </div>

      <WorkspaceBar mrRef={mrRef} workspace={state.workspace} repoPath={localRepo.path} onRepoPathChange={localRepo.setPath} />

      {tab === 'review' && <ClaudeReviewPanel />}

      {tab === 'chat' && (
        <>
          <div
            ref={scrollRef}
            onScroll={(event) => {
              const element = event.currentTarget
              stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
            }}
            className={css({ flex: '1', minH: '0', overflowY: 'auto', display: 'flex', flexDir: 'column', gap: '4', p: '3' })}
          >
            {state.messages.length === 0 && (
              <div className={css({ mt: 'auto' })}>
                <p className={css({ fontSize: 'xs', color: 'fg.subtle' })}>
                  {controls.autoSelection
                    ? 'Ask about this merge request. Lines and review comments you select in a diff are added to your question.'
                    : 'Ask about this merge request. Select lines or review comments in a diff and click Ask Claude in the file header to add them.'}
                </p>
              </div>
            )}
            {state.messages.map((message, index) => (
              <MessageView
                key={message.id}
                message={message}
                baseUrl={baseUrl}
                mrRef={mrRef}
                repoPath={localRepo.path}
                question={contextsForReply(state.messages, index)}
                onOpen={setViewer}
              />
            ))}
          </div>

          <div className={css({ flexShrink: 0, p: '3', pt: '0' })}>
            <MergeStatusBar mrRef={mrRef} repoPath={localRepo.path} />
            {error && <div className={css({ mb: '2', fontSize: 'xs', color: 'danger.fg' })}>{error}</div>}
            <form
              className={composerBox}
              onSubmit={(event) => {
                event.preventDefault()
                void send(draft)
              }}
            >
              {attached.length > 0 && (
                <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '1' })}>
                  {chatDraft.contexts.map((context, index) => (
                    <ContextChip key={`${context.path}:${context.side}:${context.startLine}`} context={context} onOpen={setViewer} onRemove={() => chatDraft.removeContext(index)} />
                  ))}
                  {chatDraft.selection && <ContextChip live context={chatDraft.selection} onOpen={setViewer} onRemove={chatDraft.dismissSelection} />}
                </div>
              )}
              <textarea
                ref={inputRef}
                value={draft}
                rows={3}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    void send(draft)
                  }
                }}
                placeholder="Ask about the code. Enter sends, Shift+Enter adds a line."
                aria-label="Message to Claude"
                className={css({ w: 'full', resize: 'none', bg: 'transparent', outline: 'none', fontSize: 'sm', color: 'fg.default', _placeholder: { color: 'fg.subtle' } })}
              />
              <div className={css({ display: 'flex', alignItems: 'center', gap: '1' })}>
                <Select variant="ghost" label="Model" value={settings.chatModel} options={MODEL_OPTIONS} onChange={chatModel => updateSettings({ chatModel })} />
                <span className={css({ display: 'inline-flex', px: '1.5' })}>
                  <EffortSlider label="Effort" value={settings.chatEffort} onChange={chatEffort => updateSettings({ chatEffort })} />
                </span>
                <span className={css({ flex: '1' })} />
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!draft.trim() && !attached.length}
                  onClick={() => {
                    const input = { text: draft, contexts: attached, repoPath: localRepo.path, ...modelChoice }
                    setViewer({
                      title: 'Prompt preview',
                      description: 'What Claude will get if you send now: your message, the instructions, and the files it can read.',
                      load: () => api.chatPreview(mrRef, input),
                    })
                  }}
                >
                  <Eye />
                  Preview
                </Button>
                {busy
                  ? (
                      <Button size="xs" onClick={() => void api.chatStop(mrRef).then(apply)}>
                        <Square />
                        Stop
                      </Button>
                    )
                  : (
                      <Button size="xs" variant="solid" type="submit" disabled={!draft.trim() || sending} className={css({ px: '2' })}>
                        <ArrowUp />
                        Send
                      </Button>
                    )}
              </div>
            </form>
          </div>
        </>
      )}
      <PromptViewer request={viewer} onClose={() => setViewer(null)} />
    </aside>
  )
}
