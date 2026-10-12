import type { ChatCodeContext, ChatMessage, ChatWorkspace } from '../../../shared/chat'
import type { MrRef } from '../../../shared/types'
import { ArrowUp, FileCode2, FolderGit2, Loader2, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { css } from 'styled-system/css'
import { describeRange } from '../../../shared/chat'
import { api } from '../../lib/api'
import { useChatControls, useChatDraft, useChatSession } from '../../lib/chat'
import { useLocalRepo } from '../../lib/local-repos'
import { fileName } from '../../lib/format'
import { LinkRepoForm } from '../link-repo-form'
import { Button, IconButton } from '../ui/button'
import { Markdown } from '../ui/markdown'

const SUGGESTIONS = [
  'Summarize this merge request',
  'What are the riskiest changes?',
  'Are any tests missing for these changes?',
  'Explain how the main change works',
]

const spinner = css({ animation: 'spin', flexShrink: 0 })

function ContextChip({ context, live, onRemove }: { context: ChatCodeContext, live?: boolean, onRemove?: () => void }) {
  return (
    <span
      title={live ? `Selected in the diff: ${context.path}, ${describeRange(context)}` : `${context.path}, ${describeRange(context)}`}
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
        '& > svg': { w: '3.5', h: '3.5', flexShrink: 0 },
      })}
    >
      <FileCode2 />
      <span className={css({ truncate: true, fontFamily: 'mono' })}>{fileName(context.path)}</span>
      <span className={css({ flexShrink: 0, color: 'fg.subtle' })}>{describeRange(context)}</span>
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

function ToolLine({ message }: { message: ChatMessage }) {
  if (!message.tools.length)
    return null
  return (
    <ul className={css({ display: 'flex', flexDir: 'column', gap: '0.5', mb: '2', fontSize: 'xs', color: 'fg.subtle', fontFamily: 'mono' })}>
      {message.tools.map(tool => (
        <li key={tool.id} className={css({ truncate: true })} title={tool.detail ?? undefined}>
          {tool.name}
          {tool.detail && ` ${tool.detail}`}
        </li>
      ))}
    </ul>
  )
}

function MessageView({ message, baseUrl }: { message: ChatMessage, baseUrl: string }) {
  if (message.role === 'user') {
    return (
      <div className={css({ alignSelf: 'flex-end', maxW: '90%', display: 'flex', flexDir: 'column', alignItems: 'flex-end', gap: '1.5' })}>
        {message.contexts.length > 0 && (
          <div className={css({ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '1' })}>
            {message.contexts.map((context, index) => <ContextChip key={index} context={context} />)}
          </div>
        )}
        <div className={css({ px: '3', py: '2', fontSize: 'sm', bg: 'accent.subtle', color: 'fg.default', borderRadius: 'lg', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>
          {message.text}
        </div>
      </div>
    )
  }

  const waiting = message.status === 'streaming' && !message.text
  return (
    <div className={css({ minW: '0' })}>
      <ToolLine message={message} />
      {message.text && <Markdown baseUrl={baseUrl}>{message.text}</Markdown>}
      {waiting && (
        <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', fontSize: 'xs', color: 'fg.subtle', '& svg': { w: '3.5', h: '3.5' } })}>
          <Loader2 className={spinner} />
          {message.tools.length ? 'Reading the code…' : 'Thinking…'}
        </div>
      )}
      {message.status === 'stopped' && <div className={css({ mt: '1', fontSize: 'xs', color: 'fg.subtle' })}>Stopped.</div>}
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
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stickToBottom = useRef(true)

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
    if (attached.length)
      inputRef.current?.focus()
  }, [chatDraft.contexts.length, chatDraft.selection])

  async function send(text: string) {
    if (!text.trim() || sending || state.running)
      return
    setSending(true)
    setError(null)
    stickToBottom.current = true
    try {
      apply(await api.chatSend(mrRef, { text, contexts: attached, repoPath: localRepo.path }))
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
    <aside aria-label="Claude chat" className={css({ display: 'flex', flexDir: 'column', h: 'full', minH: '0', bg: 'bg.surface' })}>
      <div className={css({ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '2', h: '10', pl: '3', pr: '1.5', borderBottomWidth: '1px', borderColor: 'border.default' })}>
        <Sparkles className={css({ w: '4', h: '4', color: 'accent.fg' })} />
        <h2 className={css({ fontSize: 'sm', fontWeight: 'semibold', flex: '1' })}>Claude</h2>
        <IconButton size="xs" label="New conversation" disabled={!state.messages.length} onClick={() => void api.chatReset(mrRef).then(apply)}>
          <RotateCcw />
        </IconButton>
        <IconButton size="xs" label="Close chat" onClick={() => controls.setOpen(false)}>
          <X />
        </IconButton>
      </div>

      <WorkspaceBar mrRef={mrRef} workspace={state.workspace} repoPath={localRepo.path} onRepoPathChange={localRepo.setPath} />

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget
          stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
        }}
        className={css({ flex: '1', minH: '0', overflowY: 'auto', display: 'flex', flexDir: 'column', gap: '4', p: '3' })}
      >
        {state.messages.length === 0 && (
          <div className={css({ display: 'flex', flexDir: 'column', gap: '2', mt: 'auto' })}>
            <p className={css({ fontSize: 'xs', color: 'fg.subtle', mb: '1' })}>
              {controls.autoSelection
                ? 'Ask about this merge request. Lines you select in a diff are added to your question.'
                : 'Ask about this merge request. Select lines in a diff and click Ask Claude in the file header to add them.'}
            </p>
            {SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                disabled={busy || sending}
                onClick={() => void send(suggestion)}
                className={css({ textAlign: 'left', px: '3', py: '2', fontSize: 'sm', color: 'fg.default', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', cursor: 'pointer', _hover: { bg: 'bg.muted' }, _disabled: { opacity: 0.5, cursor: 'not-allowed' } })}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {state.messages.map(message => <MessageView key={message.id} message={message} baseUrl={baseUrl} />)}
      </div>

      <div className={css({ flexShrink: 0, p: '3', pt: '0' })}>
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
                <ContextChip key={`${context.path}:${context.side}:${context.startLine}`} context={context} onRemove={() => chatDraft.removeContext(index)} />
              ))}
              {chatDraft.selection && <ContextChip live context={chatDraft.selection} onRemove={chatDraft.dismissSelection} />}
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
          <div className={css({ display: 'flex', justifyContent: 'flex-end' })}>
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
    </aside>
  )
}
