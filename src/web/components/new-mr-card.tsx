import type { BranchStatus } from '../../shared/new-mr'
import type { ProjectRef } from '../../shared/types'
import { GitBranch, GitPullRequestCreate, Loader2, Sparkles } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { css, cx } from 'styled-system/css'
import { mrAppPath } from '../../shared/mr-ref'
import { api } from '../lib/api'
import { useChatAvailable } from '../lib/chat'
import { projectKey, useAppConfig } from '../lib/local-repos'
import { useSettings } from '../lib/settings'
import { Button } from './ui/button'

const VISIBLE_COMMITS = 3

const field = css({
  w: 'full',
  px: '3',
  py: '2',
  fontSize: 'sm',
  bg: 'bg.surface',
  color: 'fg.default',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  outline: 'none',
  _focus: { borderColor: 'accent.default' },
})

function useProjectFolder(project: ProjectRef) {
  const [settings] = useSettings()
  const detected = useAppConfig().data?.localRepo
  if (detected && detected.host === project.host && detected.project.toLowerCase() === project.project.toLowerCase())
    return detected.path
  return settings.localRepos[projectKey(project)]?.trim() || null
}

function CreateForm({ project, status, onCancel }: { project: ProjectRef, status: BranchStatus, onCancel: () => void }) {
  const navigate = useNavigate()
  const [settings] = useSettings()
  const chatAvailable = useChatAvailable()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const draft = useMutation({
    mutationFn: () => api.draftMr(project, { repoPath: status.path, target: status.target, model: settings.commitModel, effort: settings.commitEffort }),
    onSuccess: (result) => {
      setTitle(result.title)
      setDescription(result.description)
    },
  })
  const create = useMutation({
    mutationFn: () => api.createMr(project, { repoPath: status.path, branch: status.branch, target: status.target, title, description }),
    onSuccess: ref => void navigate(mrAppPath(ref)),
  })
  const drafted = useRef(false)
  const busy = draft.isPending || create.isPending

  useEffect(() => {
    if (!chatAvailable || drafted.current)
      return
    drafted.current = true
    draft.mutate()
  }, [chatAvailable])
  const error = draft.error ?? create.error

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '2.5' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
        <span className={css({ flex: '1', fontSize: 'xs', color: 'fg.muted' })}>
          {`From ${status.branch} into ${status.target}`}
        </span>
        {chatAvailable && (
          <Button size="xs" disabled={busy} onClick={() => draft.mutate()}>
            {draft.isPending ? <Loader2 className={css({ animation: 'spin' })} /> : <Sparkles />}
            {draft.isPending ? 'Writing…' : 'Write with Claude'}
          </Button>
        )}
      </div>
      <input aria-label="Title" className={field} placeholder="Title" value={title} disabled={busy} onChange={event => setTitle(event.target.value)} />
      <textarea aria-label="Description" className={cx(field, css({ minH: '28', resize: 'vertical', fontFamily: 'mono', fontSize: 'xs' }))} placeholder="Description (Markdown)" value={description} disabled={busy} onChange={event => setDescription(event.target.value)} />
      <p className={css({ fontSize: 'xs', color: 'fg.muted' })}>
        {`Pushes ${status.branch} to GitLab, then opens the merge request and shows it here. It never force-pushes.`}
        {status.uncommitted > 0 && ` ${status.uncommitted === 1 ? '1 uncommitted file is' : `${status.uncommitted} uncommitted files are`} left out.`}
      </p>
      {error && <p className={css({ fontSize: 'xs', color: 'danger.fg', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>{error.message}</p>}
      <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '2' })}>
        <Button size="sm" variant="ghost" disabled={create.isPending} onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="solid" disabled={busy || !title.trim()} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className={css({ animation: 'spin' })} /> : <GitPullRequestCreate />}
          {create.isPending ? 'Creating…' : 'Push and create MR'}
        </Button>
      </div>
    </div>
  )
}

export function NewMrCard({ project }: { project: ProjectRef }) {
  const repoPath = useProjectFolder(project)
  const [creating, setCreating] = useState(false)
  const query = useQuery({
    queryKey: ['new-mr', projectKey(project), repoPath],
    queryFn: () => api.newMrStatus(project, repoPath!),
    enabled: Boolean(repoPath),
    staleTime: 60_000,
    retry: false,
  })
  const status = query.data?.status
  if (!status)
    return null
  const hidden = status.commits.length - VISIBLE_COMMITS

  return (
    <section aria-label="Branch without a merge request" className={css({ display: 'flex', flexDir: 'column', gap: '3', p: '4', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '3', flexWrap: 'wrap' })}>
        <GitBranch className={css({ w: '4', h: '4', color: 'accent.fg', flexShrink: 0 })} />
        <div className={css({ flex: '1', minW: '0' })}>
          <p className={css({ fontSize: 'sm', fontWeight: 'semibold' })}>
            <span className={css({ fontFamily: 'mono' })}>{status.branch}</span>
            {` has ${status.ahead === 1 ? '1 commit' : `${status.ahead} commits`} and no merge request`}
          </p>
          <p className={css({ fontSize: 'xs', color: 'fg.muted', wordBreak: 'break-all' })}>{`In ${status.path}`}</p>
        </div>
        {!creating && (
          <Button size="sm" variant="solid" onClick={() => setCreating(true)}>
            <GitPullRequestCreate />
            Create MR
          </Button>
        )}
      </div>
      {!creating && (
        <ul className={css({ display: 'flex', flexDir: 'column', gap: '0.5', pl: '7', fontSize: 'xs', color: 'fg.muted' })}>
          {status.commits.slice(-VISIBLE_COMMITS).map(commit => (
            <li key={commit.sha} className={css({ truncate: true })}>{commit.subject}</li>
          ))}
          {hidden > 0 && <li>{`and ${hidden} more`}</li>}
        </ul>
      )}
      {creating && <CreateForm project={project} status={status} onCancel={() => setCreating(false)} />}
    </section>
  )
}
