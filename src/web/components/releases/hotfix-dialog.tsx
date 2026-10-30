import type { ConflictSide, HotfixCommit, HotfixInput, HotfixPlan, HotfixProgress, HotfixStep, PickConflictFile } from '../../../shared/hotfix'
import type { ProjectRef, User } from '../../../shared/types'
import { Dialog } from '@ark-ui/react/dialog'
import { Portal } from '@ark-ui/react/portal'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, ExternalLink, GitCommitHorizontal, Loader2, Search, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { defaultPackageDir, describeConflict, formatCommand, HOTFIX_SOURCE_BRANCH, parseReleaseTag } from '../../../shared/hotfix'
import { useProjectMembers } from '../../hooks/use-project'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/format'
import { projectKey, useProjectFolder } from '../../lib/local-repos'
import { copyText } from '../../lib/platform'
import { useSettings } from '../../lib/settings'
import { Avatar } from '../ui/avatar'
import { Button, IconButton, WithTooltip } from '../ui/button'
import { Checkbox } from '../ui/checkbox'

type StepStatus = 'waiting' | 'running' | 'done' | 'failed' | 'conflict'

interface StepState {
  status: StepStatus
  output: string | null
  error: string | null
  manual: boolean
  conflicts: PickConflictFile[] | null
}

const RESOLVED_LABEL: Record<ConflictSide, string> = {
  tag: 'Kept the tag version',
  commit: 'Used the commit version',
  edited: 'Fixed by hand',
}

const input = css({
  w: 'full',
  h: '9',
  px: '3',
  fontSize: 'sm',
  fontFamily: 'mono',
  bg: 'bg.surface',
  color: 'fg.default',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  outline: 'none',
  _focus: { borderColor: 'accent.default' },
  _disabled: { opacity: 0.6 },
})

const fieldLabel = css({ display: 'block', fontSize: 'xs', fontWeight: 'semibold', mb: '1.5' })
const fieldHint = css({ fontSize: 'xs', color: 'fg.subtle', mt: '1.5' })
const codeBlock = css({ fontFamily: 'mono', fontSize: 'xs', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.subtle', borderRadius: 'md', px: '2.5', py: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' })

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function useSourceCommits(project: ProjectRef, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: ['hotfix-commits', projectKey(project)],
    queryFn: ({ pageParam }) => api.hotfixCommits(project, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled,
    staleTime: 60_000,
  })
  const items = useMemo(() => query.data?.pages.flatMap(page => page.items) ?? [], [query.data])
  return { query, items }
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function groupByDay(commits: HotfixCommit[]) {
  const groups: { day: string, commits: HotfixCommit[] }[] = []
  for (const commit of commits) {
    const day = dayFormat.format(new Date(commit.authoredAt))
    if (groups.at(-1)?.day === day)
      groups.at(-1)!.commits.push(commit)
    else
      groups.push({ day, commits: [commit] })
  }
  return groups
}

function authorAsUser(name: string, members: User[]): User {
  const lower = name.toLowerCase()
  return members.find(member => member.name.toLowerCase() === lower) ?? { id: 0, username: '', name, avatarUrl: null, webUrl: '' }
}

const COPIED_RESET_MS = 1500

const stopClick = { onClick: (event: React.MouseEvent) => event.stopPropagation() }

function CommitRow({ commit, author, selected, onToggle }: { commit: HotfixCommit, author: User, selected: boolean, onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied)
      return
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS)
    return () => clearTimeout(timer)
  }, [copied])

  function copyId() {
    void copyText(commit.sha).then(() => setCopied(true)).catch(() => setCopied(false))
  }

  return (
    <div
      role="presentation"
      onClick={onToggle}
      data-selected={selected || undefined}
      className={css({ display: 'flex', alignItems: 'flex-start', gap: '3', px: '3', py: '2.5', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', cursor: 'pointer', transition: 'background 120ms, border-color 120ms', _hover: { bg: 'bg.subtle' }, '&[data-selected]': { borderColor: 'accent.default', bg: 'accent.subtle' } })}
    >
      <span className={css({ display: 'inline-flex', h: '7', alignItems: 'center' })}>
        <Checkbox checked={selected} onCheckedChange={onToggle} label={`Cherry-pick ${commit.shortId}`} />
      </span>
      <Avatar user={author} size={28} />
      <div className={css({ flex: '1', minW: '0', display: 'flex', flexDir: 'column', gap: '0.5' })}>
        <span className={css({ fontSize: 'sm', fontWeight: 'semibold', truncate: true })} title={commit.title}>{commit.title}</span>
        <span className={css({ fontSize: 'xs', color: 'fg.muted' })}>
          <span className={css({ fontWeight: 'medium', color: 'fg.default' })}>{commit.author}</span>
          {' authored '}
          <time dateTime={commit.authoredAt} title={new Date(commit.authoredAt).toLocaleString()}>{timeAgo(commit.authoredAt)}</time>
        </span>
        {open && <pre className={cx(codeBlock, css({ mt: '1.5', fontFamily: 'body', cursor: 'text' }))} {...stopClick}>{commit.description}</pre>}
      </div>
      <div className={css({ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '1', h: '7' })} {...stopClick}>
        <WithTooltip label={copied ? 'Copied' : 'Copy the full commit ID'}>
          <button type="button" onClick={copyId} aria-label={`Copy commit ID ${commit.sha}`} className={css({ display: 'inline-flex', alignItems: 'center', px: '1.5', h: '6', borderRadius: 'md', fontFamily: 'mono', fontSize: 'xs', color: 'fg.muted', cursor: 'copy', _hover: { bg: 'bg.muted', color: 'fg.default' } })}>
            {commit.shortId}
          </button>
        </WithTooltip>
        <WithTooltip label="Open on GitLab">
          <a href={commit.webUrl} target="_blank" rel="noreferrer" aria-label="Open the commit on GitLab" className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', w: '7', h: '7', borderRadius: 'md', color: 'fg.muted', _hover: { bg: 'bg.muted', color: 'accent.fg' }, '& svg': { w: '3.5', h: '3.5' } })}>
            <ExternalLink />
          </a>
        </WithTooltip>
        {commit.description && (
          <IconButton label={open ? 'Hide description' : 'Show description'} onClick={() => setOpen(!open)}>
            <ChevronDown className={css({ transition: 'transform 120ms' })} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
          </IconButton>
        )}
      </div>
    </div>
  )
}

function CommitPicker({ project, selected, onToggle }: { project: ProjectRef, selected: Set<string>, onToggle: (sha: string) => void }) {
  const [filter, setFilter] = useState('')
  const { query: commits, items: loaded } = useSourceCommits(project)
  const members = useProjectMembers(project).data ?? []
  const needle = filter.trim().toLowerCase()
  const items = loaded
    .filter(commit => !needle || commit.title.toLowerCase().includes(needle) || commit.sha.startsWith(needle) || commit.author.toLowerCase().includes(needle))
  const branchUrl = `https://${project.host}/${project.project}/-/commits/${HOTFIX_SOURCE_BRANCH}`

  return (
    <div>
      <div className={css({ display: 'flex', alignItems: 'baseline', gap: '3', mb: '1.5' })}>
        <span className={cx(fieldLabel, css({ mb: '0' }))}>{`Commits from ${HOTFIX_SOURCE_BRANCH} to cherry-pick`}</span>
        <a href={branchUrl} target="_blank" rel="noreferrer" className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', fontSize: 'xs', color: 'accent.fg', _hover: { textDecoration: 'underline' }, '& svg': { w: '3', h: '3' } })}>
          View on GitLab
          <ExternalLink />
        </a>
        <span className={css({ ml: 'auto', fontSize: 'xs', color: 'fg.subtle' })}>{`${selected.size} selected`}</span>
      </div>
      <label className={css({ display: 'flex', alignItems: 'center', gap: '2', h: '8', px: '3', mb: '2', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', _focusWithin: { borderColor: 'accent.default' }, '& svg': { w: '3.5', h: '3.5', color: 'fg.subtle' } })}>
        <Search />
        <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter by title, author or commit ID" aria-label="Filter commits" className={css({ flex: '1', bg: 'transparent', outline: 'none', fontSize: 'xs' })} />
      </label>
      <div className={css({ maxH: '400px', overflowY: 'auto', pr: '1' })}>
        {commits.isPending && <p className={css({ p: '4', fontSize: 'sm', color: 'fg.muted' })}>Loading commits…</p>}
        {commits.error && <p className={css({ p: '4', fontSize: 'sm', color: 'danger.fg' })}>{commits.error.message}</p>}
        {groupByDay(items).map(group => (
          <section key={group.day} className={css({ position: 'relative', pl: '6', pb: '3', _before: { content: '""', position: 'absolute', left: '2', top: '6', bottom: '0', borderLeftWidth: '1px', borderColor: 'border.default' } })}>
            <h3 className={css({ position: 'sticky', top: '0', zIndex: '1', display: 'flex', alignItems: 'center', gap: '2', ml: '-6', py: '1.5', bg: 'bg.surface', fontSize: 'sm', fontWeight: 'semibold', '& svg': { w: '4', h: '4', color: 'fg.muted' } })}>
              <GitCommitHorizontal />
              {group.day}
            </h3>
            <div className={css({ display: 'flex', flexDir: 'column', gap: '1.5' })}>
              {group.commits.map(commit => (
                <CommitRow key={commit.sha} commit={commit} author={authorAsUser(commit.author, members)} selected={selected.has(commit.sha)} onToggle={() => onToggle(commit.sha)} />
              ))}
            </div>
          </section>
        ))}
        {commits.hasNextPage && (
          <div className={css({ display: 'flex', justifyContent: 'center', p: '2' })}>
            <Button size="sm" variant="ghost" disabled={commits.isFetchingNextPage} onClick={() => void commits.fetchNextPage()}>
              {commits.isFetchingNextPage ? 'Loading…' : 'Load older commits'}
            </Button>
          </div>
        )}
      </div>
      <p className={fieldHint}>They are applied oldest first, in the order they landed on {HOTFIX_SOURCE_BRANCH}.</p>
    </div>
  )
}

function StepIcon({ status, index }: { status: StepStatus, index: number }) {
  const base = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, w: '6', h: '6', borderRadius: 'full', fontSize: 'xs', fontWeight: 'semibold', '& svg': { w: '3.5', h: '3.5' } })
  if (status === 'done')
    return <span className={cx(base, css({ bg: 'success.solid', color: 'fg.onAccent' }))}><Check /></span>
  if (status === 'running')
    return <span className={cx(base, css({ bg: 'accent.subtle', color: 'accent.fg' }))}><Loader2 className={css({ animation: 'spin' })} /></span>
  if (status === 'failed')
    return <span className={cx(base, css({ bg: 'danger.subtle', color: 'danger.fg' }))}><TriangleAlert /></span>
  if (status === 'conflict')
    return <span className={cx(base, css({ bg: 'warning.subtle', color: 'warning.fg' }))}><TriangleAlert /></span>
  return <span className={cx(base, css({ borderWidth: '1px', borderColor: 'border.strong', color: 'fg.muted' }))}>{index + 1}</span>
}

function ConflictPanel({ project, repoPath, files, onContinued, onAborted }: { project: ProjectRef, repoPath: string, files: PickConflictFile[], onContinued: (output: string) => void, onAborted: (returnedTo: string | null) => void }) {
  const [settings] = useSettings()
  const [remaining, setRemaining] = useState(() => new Set(files.map(file => file.path)))
  const [chosen, setChosen] = useState<Record<string, ConflictSide>>({})
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(key: string, work: () => Promise<void>) {
    setPending(key)
    setError(null)
    try {
      await work()
    }
    catch (cause) {
      setError(errorText(cause))
    }
    finally {
      setPending(null)
    }
  }

  async function refresh() {
    const state = await api.hotfixConflicts(project, repoPath)
    if (!state.inProgress) {
      onContinued('')
      return
    }
    setRemaining(new Set(state.files.map(file => file.path)))
  }

  function resolve(file: PickConflictFile, side: ConflictSide) {
    void act(file.path, async () => {
      await api.resolveHotfixConflict(project, repoPath, file.path, side)
      setChosen(current => ({ ...current, [file.path]: side }))
      await refresh()
    })
  }

  function openFile(file: PickConflictFile) {
    void act(file.path, async () => {
      await api.openInEditor({ repoPath, path: file.path, line: 1, column: 1, editor: settings.editor })
      setOpened(current => new Set(current).add(file.path))
    })
  }

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '3', p: '3', borderWidth: '1px', borderColor: 'warning.fg', borderRadius: 'lg', bg: 'bg.subtle' })}>
      <p className={css({ fontSize: 'sm' })}>
        The cherry-pick stopped, because some files changed in different ways on the tag and in the commit. Choose what to keep for each file.
      </p>
      <ul className={css({ listStyle: 'none', display: 'flex', flexDir: 'column', gap: '2' })}>
        {files.map((file) => {
          const done = !remaining.has(file.path)
          const busyHere = pending === file.path
          return (
            <li key={file.path} className={css({ display: 'flex', flexDir: 'column', gap: '2', p: '2.5', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md' })}>
              <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
                {done
                  ? <Check aria-label="Resolved" className={css({ w: '4', h: '4', flexShrink: 0, color: 'success.fg' })} />
                  : <TriangleAlert aria-label="Not resolved" className={css({ w: '4', h: '4', flexShrink: 0, color: 'warning.fg' })} />}
                <code className={css({ flex: '1', minW: '0', fontFamily: 'mono', fontSize: 'xs', wordBreak: 'break-all' })}>{file.path}</code>
                {done && <span className={css({ fontSize: 'xs', color: 'success.fg' })}>{chosen[file.path] ? RESOLVED_LABEL[chosen[file.path]!] : 'Resolved'}</span>}
              </div>
              {!done && (
                <>
                  <span className={css({ fontSize: 'xs', color: 'fg.muted' })}>{describeConflict(file)}</span>
                  <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '1.5' })}>
                    <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => resolve(file, 'tag')}>
                      {file.tagDeleted ? 'Keep it deleted (tag)' : 'Keep tag version'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => resolve(file, 'commit')}>
                      {file.commitDeleted ? 'Delete it (commit)' : 'Use commit version'}
                    </Button>
                    {!file.tagDeleted && !file.commitDeleted && (
                      <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => openFile(file)}>Open in editor</Button>
                    )}
                    {opened.has(file.path) && (
                      <Button size="sm" variant="solid" disabled={pending !== null} onClick={() => resolve(file, 'edited')}>I fixed it</Button>
                    )}
                    {busyHere && <Loader2 className={css({ w: '4', h: '4', alignSelf: 'center', animation: 'spin', color: 'fg.muted' })} />}
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {error && <pre className={cx(codeBlock, css({ color: 'danger.fg', bg: 'danger.subtle', borderColor: 'transparent' }))}>{error}</pre>}
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
        <span className={css({ flex: '1', fontSize: 'xs', color: 'fg.muted' })}>
          {remaining.size ? `${remaining.size} of ${files.length} files left` : 'All files are resolved.'}
          {' · '}
          <button type="button" disabled={pending !== null} onClick={() => void act(':check', refresh)} className={css({ color: 'accent.fg', cursor: 'pointer', _hover: { textDecoration: 'underline' } })}>Check again</button>
        </span>
        <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => void act(':abort', async () => {
          const { returnedTo } = await api.abortHotfix(project, repoPath)
          onAborted(returnedTo)
        })}
        >
          {pending === ':abort' ? 'Stopping…' : 'Abort hotfix'}
        </Button>
        <Button size="sm" variant="solid" disabled={pending !== null || remaining.size > 0} onClick={() => void act(':continue', async () => {
          const { output } = await api.continueHotfixPick(project, repoPath)
          onContinued(output)
        })}
        >
          {pending === ':continue' ? 'Continuing…' : 'Continue cherry-pick'}
        </Button>
      </div>
    </div>
  )
}

function StepRow({ step, index, state, isNext, commit, busy, onRun, onMarkDone, children }: { step: HotfixStep, index: number, state: StepState, isNext: boolean, commit: HotfixCommit | undefined, busy: boolean, onRun: () => void, onMarkDone: () => void, children?: React.ReactNode }) {
  return (
    <li className={css({ display: 'flex', gap: '3', py: '3', '& + &': { borderTopWidth: '1px', borderColor: 'border.subtle' } })} aria-current={isNext ? 'step' : undefined}>
      <StepIcon status={state.status} index={index} />
      <div className={css({ flex: '1', minW: '0', display: 'flex', flexDir: 'column', gap: '1.5' })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
          <span className={css({ flex: '1', fontSize: 'sm', fontWeight: 'medium', color: state.status === 'waiting' && !isNext ? 'fg.muted' : 'fg.default' })}>
            {step.title}
            {state.manual && <span className={css({ ml: '2', fontSize: 'xs', fontWeight: 'normal', color: 'fg.subtle' })}>marked as done</span>}
          </span>
          {isNext && state.status !== 'running' && state.status !== 'conflict' && (
            <>
              {state.status === 'failed' && <Button size="sm" variant="ghost" disabled={busy} onClick={onMarkDone}>Mark as done</Button>}
              <Button size="sm" variant="solid" disabled={busy} onClick={onRun}>{state.status === 'failed' ? 'Try again' : 'Run'}</Button>
            </>
          )}
        </div>
        {commit && <span className={css({ fontSize: 'xs', color: 'fg.muted', truncate: true })} title={commit.title}>{commit.title}</span>}
        <span className={css({ fontSize: 'xs', color: 'fg.subtle' })}>{step.detail}</span>
        <code className={codeBlock}>{formatCommand(step.args)}</code>
        {state.error && <pre className={cx(codeBlock, css({ color: 'danger.fg', bg: 'danger.subtle', borderColor: 'transparent' }))}>{state.error}</pre>}
        {children}
        {state.output && (
          <details open={step.id === 'diff'}>
            <summary className={css({ fontSize: 'xs', color: 'fg.muted', cursor: 'pointer' })}>{state.status === 'conflict' ? 'Full git output' : 'Output'}</summary>
            <pre className={cx(codeBlock, css({ mt: '1.5', maxH: '240px', overflowY: 'auto' }))}>{state.output}</pre>
          </details>
        )}
      </div>
    </li>
  )
}

function initialState(step: HotfixStep, progress: HotfixProgress | null): StepState {
  const state: StepState = { status: 'waiting', output: null, error: null, manual: false, conflicts: null }
  if (progress?.done.includes(step.id))
    return { ...state, status: 'done' }
  if (progress?.conflict?.stepId === step.id)
    return { ...state, status: 'conflict', conflicts: progress.conflict.files }
  return state
}

function HotfixSteps({ project, repoPath, plan, commits, progress, onBack, onBusyChange }: { project: ProjectRef, repoPath: string, plan: HotfixPlan, commits: Map<string, HotfixCommit>, progress: HotfixProgress | null, onBack: () => void, onBusyChange: (busy: boolean) => void }) {
  const [states, setStates] = useState<StepState[]>(() => plan.steps.map(step => initialState(step, progress)))
  const [aborted, setAborted] = useState<{ returnedTo: string | null } | null>(null)
  const [aborting, setAborting] = useState(false)
  const [abortError, setAbortError] = useState<string | null>(null)
  const [auto, setAuto] = useState(false)
  const autoRef = useRef(auto)
  autoRef.current = auto
  const next = states.findIndex(state => state.status !== 'done')
  const busy = states.some(state => state.status === 'running')
  const inConflict = states.some(state => state.status === 'conflict')
  const started = states.some(state => state.status !== 'waiting')
  const finished = next === -1

  useEffect(() => onBusyChange(busy), [busy])

  function patch(index: number, value: Partial<StepState>) {
    setStates(current => current.map((state, at) => (at === index ? { ...state, ...value } : state)))
  }

  async function run(index: number) {
    const step = plan.steps[index]
    if (!step)
      return
    patch(index, { status: 'running', error: null })
    try {
      const { output, conflicts } = await api.runHotfixStep(project, repoPath, plan.input, step.id)
      if (conflicts) {
        patch(index, { status: 'conflict', output, conflicts })
        return
      }
      patch(index, { status: 'done', output: output || null })
    }
    catch (error) {
      patch(index, { status: 'failed', error: errorText(error) })
      return
    }
    if (autoRef.current)
      await run(index + 1)
  }

  async function abort() {
    setAborting(true)
    setAbortError(null)
    try {
      setAborted(await api.abortHotfix(project, repoPath))
    }
    catch (error) {
      setAbortError(errorText(error))
    }
    finally {
      setAborting(false)
    }
  }

  const tagUrl = `https://${project.host}/${project.project}/-/tags/${encodeURIComponent(plan.rcTag)}`

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '4' })}>
      {progress && (
        <p className={css({ p: '3', borderRadius: 'md', bg: 'accent.subtle', color: 'accent.fg', fontSize: 'sm' })}>
          You started this hotfix earlier. The steps that are already done are checked, so you can go on where you stopped.
        </p>
      )}
      <div className={css({ fontSize: 'sm', color: 'fg.muted' })}>
        {'Work happens in '}
        <code className={css({ fontFamily: 'mono', fontSize: 'xs', color: 'fg.default' })}>{plan.repoPath}</code>
        . Each step shows the exact command before it runs.
      </div>
      <ol className={css({ listStyle: 'none' })}>
        {plan.steps.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            index={index}
            state={states[index]!}
            isNext={index === next}
            commit={step.id.startsWith('pick:') ? commits.get(step.id.slice(5)) : undefined}
            busy={busy}
            onRun={() => void run(index)}
            onMarkDone={() => patch(index, { status: 'done', error: null, manual: true })}
          >
            {states[index]!.status === 'conflict' && !aborted && (
              <ConflictPanel
                project={project}
                repoPath={plan.repoPath}
                files={states[index]!.conflicts ?? []}
                onContinued={(output) => {
                  patch(index, { status: 'done', output: [states[index]!.output, output].filter(Boolean).join('\n\n') || null, conflicts: null })
                  if (autoRef.current)
                    void run(index + 1)
                }}
                onAborted={returnedTo => setAborted({ returnedTo })}
              />
            )}
          </StepRow>
        ))}
      </ol>
      {abortError && <pre className={cx(codeBlock, css({ color: 'danger.fg', bg: 'danger.subtle', borderColor: 'transparent' }))}>{abortError}</pre>}
      {aborted && (
        <div className={css({ display: 'flex', alignItems: 'center', gap: '3', p: '3', borderRadius: 'md', bg: 'bg.subtle', fontSize: 'sm' })}>
          <span className={css({ flex: '1' })}>
            {`The hotfix stopped and its changes were undone.${aborted.returnedTo ? ` Your folder is back on ${aborted.returnedTo}.` : ''}`}
          </span>
          <Button variant="solid" size="md" onClick={onBack}>Start over</Button>
        </div>
      )}
      {!aborted && (finished
        ? (
            <div className={css({ display: 'flex', alignItems: 'center', gap: '2', p: '3', borderRadius: 'md', bg: 'success.subtle', color: 'success.fg', fontSize: 'sm', '& svg': { w: '4', h: '4' } })}>
              <Check />
              <span className={css({ flex: '1' })}>{`${plan.rcTag} is on GitLab. Its pipeline builds the release candidate.`}</span>
              <a href={tagUrl} target="_blank" rel="noreferrer" className={css({ fontWeight: 'medium', textDecoration: 'underline' })}>Open tag</a>
            </div>
          )
        : (
            <div className={css({ display: 'flex', alignItems: 'center', gap: '3', pt: '3', borderTopWidth: '1px', borderColor: 'border.default' })}>
              <div className={css({ flex: '1', display: 'flex', alignItems: 'center', gap: '2', fontSize: 'sm' })}>
                <Checkbox checked={auto} onCheckedChange={setAuto} label="Run all steps automatically" />
                <span role="presentation" onClick={() => setAuto(!auto)} className={css({ cursor: 'pointer' })}>Run all steps automatically</span>
                <span className={css({ fontSize: 'xs', color: 'fg.subtle' })}>Stops at the first problem.</span>
              </div>
              {!started && <Button variant="ghost" size="md" onClick={onBack}>Change setup</Button>}
              {started && !inConflict && (
                <WithTooltip label="Undoes the hotfix changes in your folder and switches back to your branch. A tag already pushed stays on GitLab.">
                  <Button variant="ghost" size="md" disabled={busy || aborting} onClick={() => void abort()}>{aborting ? 'Stopping…' : 'Abort hotfix'}</Button>
                </WithTooltip>
              )}
              <Button variant="solid" size="md" disabled={busy || inConflict} onClick={() => void run(next)}>
                {busy ? 'Running…' : inConflict ? 'Resolve the conflicts first' : auto ? 'Run all remaining steps' : `Run step ${next + 1}`}
              </Button>
            </div>
          ))}
    </div>
  )
}

function HotfixSetup({ project, tag, repoPath, onPlanned }: { project: ProjectRef, tag: string, repoPath: string | null, onPlanned: (plan: HotfixPlan, commits: Map<string, HotfixCommit>) => void }) {
  const release = parseReleaseTag(tag)
  const suggested = useQuery({ queryKey: ['hotfix-version', projectKey(project), tag], queryFn: () => api.hotfixVersion(project, tag), enabled: Boolean(release), staleTime: 0 })
  const [version, setVersion] = useState('')
  const [packageDir, setPackageDir] = useState(release ? defaultPackageDir(release) : '')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<Map<string, HotfixCommit>>(new Map())

  useEffect(() => {
    if (suggested.data && !version)
      setVersion(suggested.data.version)
  }, [suggested.data])

  const knownCommits = useSourceCommits(project).items

  function toggle(sha: string) {
    const nextSelected = new Set(selected)
    if (nextSelected.has(sha))
      nextSelected.delete(sha)
    else
      nextSelected.add(sha)
    setSelected(nextSelected)
    const nextPicked = new Map(picked)
    const commit = knownCommits.find(item => item.sha === sha)
    if (commit && nextSelected.has(sha))
      nextPicked.set(sha, commit)
    else
      nextPicked.delete(sha)
    setPicked(nextPicked)
  }

  const oldestFirst = useMemo(() => [...knownCommits].reverse().filter(commit => selected.has(commit.sha)).map(commit => commit.sha), [knownCommits, selected])
  const plan = useMutation({
    mutationFn: (hotfix: HotfixInput) => api.hotfixPlan(project, repoPath!, hotfix),
    onSuccess: result => onPlanned(result, picked),
  })

  if (!release)
    return <p className={css({ fontSize: 'sm', color: 'danger.fg' })}>{`${tag} does not look like a release tag, such as stable-app-0.193.0, so a hotfix can not start from it.`}</p>

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '5' })}>
      {!repoPath && (
        <p className={css({ p: '3', borderRadius: 'md', bg: 'warning.subtle', color: 'warning.fg', fontSize: 'sm' })}>
          Set the local folder of this project in Settings, General first. The hotfix is made there.
        </p>
      )}
      <CommitPicker project={project} selected={selected} onToggle={toggle} />
      <div className={css({ display: 'grid', gridTemplateColumns: { base: '1fr', sm: '1fr 1fr' }, gap: '4' })}>
        <div>
          <label className={fieldLabel} htmlFor="hotfix-version">New version</label>
          <input id="hotfix-version" className={input} value={version} placeholder={suggested.isPending ? 'Checking tags…' : `${release.base}-1`} onChange={event => setVersion(event.target.value.trim())} />
          <p className={fieldHint}>{suggested.error ? `Could not read existing tags: ${suggested.error.message}` : 'One higher than the newest release candidate of this version.'}</p>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="hotfix-package">Package folder</label>
          <input id="hotfix-package" className={input} value={packageDir} onChange={event => setPackageDir(event.target.value.trim())} />
          <p className={fieldHint}>Its package.json gets the new version.</p>
        </div>
      </div>
      {plan.error && <p className={css({ fontSize: 'sm', color: 'danger.fg', whiteSpace: 'pre-wrap' })}>{plan.error.message}</p>}
      <div className={css({ display: 'flex', justifyContent: 'flex-end', pt: '3', borderTopWidth: '1px', borderColor: 'border.default' })}>
        <Button
          variant="solid"
          size="md"
          disabled={!repoPath || !selected.size || !version || plan.isPending}
          onClick={() => plan.mutate({ tag, commits: oldestFirst, version, packageDir })}
        >
          {plan.isPending ? 'Checking…' : 'Review steps'}
        </Button>
      </div>
    </div>
  )
}

export function HotfixDialog({ project, tag, onClose }: { project: ProjectRef, tag: string | null, onClose: () => void }) {
  const repoPath = useProjectFolder(project)
  const [planned, setPlanned] = useState<{ plan: HotfixPlan, commits: Map<string, HotfixCommit> } | null>(null)
  const [showOpen, setShowOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const sourceCommits = useSourceCommits(project, tag !== null).items
  const active = useQuery({
    queryKey: ['hotfix-active', projectKey(project), repoPath],
    queryFn: () => api.activeHotfix(project, repoPath!),
    enabled: tag !== null && Boolean(repoPath),
    gcTime: 0,
    retry: false,
  })
  const progress = active.data?.progress ?? null
  const resuming = progress && (progress.plan.input.tag === tag || showOpen) ? progress : null
  const shownTag = resuming?.plan.input.tag ?? tag
  const commitsByStep = useMemo(() => new Map(sourceCommits.map(commit => [commit.sha, commit])), [sourceCommits])

  useEffect(() => {
    setPlanned(null)
    setShowOpen(false)
  }, [tag])

  function body() {
    if (!tag)
      return null
    if (repoPath && active.isPending)
      return <p className={css({ fontSize: 'sm', color: 'fg.muted' })}>Checking your local folder…</p>
    if (resuming && repoPath)
      return <HotfixSteps key={resuming.plan.rcTag} project={project} repoPath={repoPath} plan={resuming.plan} commits={commitsByStep} progress={resuming} onBack={() => void active.refetch().then(() => setShowOpen(false))} onBusyChange={setBusy} />
    return (
      <>
        {progress && (
          <div className={css({ display: 'flex', alignItems: 'center', gap: '3', mb: '4', p: '3', borderRadius: 'md', bg: 'warning.subtle', color: 'warning.fg', fontSize: 'sm' })}>
            <span className={css({ flex: '1' })}>{`A hotfix from ${progress.plan.input.tag} to ${progress.plan.rcTag} is still open in your local folder. Finish or abort it before you start another one.`}</span>
            <Button size="sm" variant="solid" onClick={() => setShowOpen(true)}>Open it</Button>
          </div>
        )}
        <div hidden={Boolean(planned)}>
          <HotfixSetup project={project} tag={tag} repoPath={repoPath} onPlanned={(plan, commits) => void active.refetch().then(() => setPlanned({ plan, commits }))} />
        </div>
        {planned && repoPath && (
          <HotfixSteps project={project} repoPath={repoPath} plan={planned.plan} commits={planned.commits} progress={null} onBack={() => setPlanned(null)} onBusyChange={setBusy} />
        )}
      </>
    )
  }

  const rcTag = resuming?.plan.rcTag ?? planned?.plan.rcTag

  return (
    <Dialog.Root
      open={tag !== null}
      onOpenChange={(details) => {
        if (!details.open && !busy)
          onClose()
      }}
      closeOnInteractOutside={false}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop className={css({ position: 'fixed', inset: '0', zIndex: 'overlay', bg: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' })} />
        <Dialog.Positioner className={css({ position: 'fixed', inset: '0', zIndex: 'modal', display: 'flex', alignItems: 'center', justifyContent: 'center', p: '6' })}>
          <Dialog.Content className={css({ w: 'full', maxW: '820px', maxH: 'calc(100dvh - 48px)', display: 'flex', flexDir: 'column', overflow: 'hidden', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'xl', boxShadow: 'popover', outline: 'none' })}>
            <div className={css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4', px: '6', pt: '6', pb: '4', flexShrink: 0 })}>
              <div>
                <Dialog.Title className={css({ fontSize: 'lg', fontWeight: 'semibold' })}>
                  {'Create hotfix from '}
                  <code className={css({ fontFamily: 'mono' })}>{shownTag}</code>
                </Dialog.Title>
                <Dialog.Description className={css({ fontSize: 'sm', color: 'fg.muted' })}>
                  {rcTag ? `Run each step and check its result. The new tag is ${rcTag}.` : 'Pick the fixes and check the version. Nothing runs until you review the steps.'}
                </Dialog.Description>
              </div>
              <Dialog.CloseTrigger asChild>
                <IconButton label={busy ? 'Wait for the step to finish' : 'Close'} disabled={busy}><X /></IconButton>
              </Dialog.CloseTrigger>
            </div>
            <div className={css({ flex: '1', minH: '0', overflowY: 'auto', px: '6', pb: '6' })}>
              {body()}
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
