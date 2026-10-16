import type { CommitResult } from '../../shared/commit-plan'
import type { LocalChangedFile, LocalWorkspace, UnpushedCommit as UnpushedCommitSummary } from '../../shared/local-changes'
import { Link } from 'react-router'
import { describeWorkspace } from '../../shared/local-changes'
import type { MrRef } from '../../shared/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Eye, FileCheck2, FolderGit2, FolderInput, FolderPlus, GitCommitHorizontal, Loader2, RefreshCw, Undo2, Upload } from 'lucide-react'
import { useState } from 'react'
import { css } from 'styled-system/css'
import { api } from '../lib/api'
import { localChangesKey, mrWorkspaceKey, useLocalChanges, useLocalRepo } from '../lib/local-repos'
import { workspaceFolderFor } from '../../shared/local-repo'
import { mrAppPath, mrKey } from '../../shared/mr-ref'
import { CommitForm } from './commit-form'
import { ChangesDialog } from './changes-dialog'
import { PatchFileCard } from './patch-file-card'
import { useReview } from './review-context'
import { Button } from './ui/button'

const STATUS_LABELS: Record<LocalChangedFile['status'], string> = {
  added: 'New',
  modified: 'Modified',
  removed: 'Deleted',
  renamed: 'Renamed',
}

function ConfirmDiscard({ label, busy, onConfirm, onCancel }: { label: string, busy: boolean, onConfirm: () => void, onCancel: () => void }) {
  return (
    <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', fontSize: 'xs' })}>
      <span className={css({ color: 'danger.fg' })}>{label}</span>
      <Button size="xs" variant="ghost" onClick={onCancel} disabled={busy}>Keep</Button>
      <Button size="xs" onClick={onConfirm} disabled={busy} className={css({ color: 'danger.fg' })}>Discard</Button>
    </span>
  )
}

function LocalFileCard({ file, busy, onDiscard }: { file: LocalChangedFile, busy: boolean, onDiscard: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <PatchFileCard
      path={file.path}
      previousPath={file.previousPath}
      diff={file.diff}
      isBinary={file.isBinary}
      label={STATUS_LABELS[file.status]}
      actions={confirming
        ? <ConfirmDiscard label={file.untracked ? 'Delete this new file?' : 'Undo these changes?'} busy={busy} onCancel={() => setConfirming(false)} onConfirm={onDiscard} />
        : (
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
              <Undo2 />
              Discard
            </Button>
          )}
    />
  )
}

function UnpushedCommit({ mrRef, repoPath, headSha, sha }: { mrRef: MrRef, repoPath: string, headSha: string, sha: string }) {
  const details = useQuery({
    queryKey: ['unpushed-commit', mrKey(mrRef), repoPath, sha],
    queryFn: () => api.unpushedCommit(mrRef, repoPath, headSha, sha),
    staleTime: Infinity,
    retry: false,
  })
  if (details.isPending)
    return <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', fontSize: 'sm', color: 'fg.muted' })}><Loader2 className={css({ animation: 'spin', w: '3.5', h: '3.5' })} /> Loading the commit…</div>
  if (details.error)
    return <div className={css({ fontSize: 'sm', color: 'danger.fg' })}>{details.error.message}</div>
  const body = details.data.message.split('\n').slice(1).join('\n').trim()
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '3' })}>
      {body && <pre className={css({ p: '3', fontFamily: 'mono', fontSize: 'xs', color: 'fg.muted', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>{body}</pre>}
      {details.data.files.map(file => <PatchFileCard key={file.path} path={file.path} diff={file.diff} isBinary={file.isBinary} />)}
    </div>
  )
}

function useOwnFolder(mrRef: MrRef) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'working' } | { kind: 'done', path: string, dependencies: string } | { kind: 'error', message: string }>({ kind: 'idle' })
  async function create(repoPath: string, move: boolean) {
    setState({ kind: 'working' })
    try {
      const created = await api.createMrWorkspace(mrRef, { repoPath, move })
      setState({ kind: 'done', path: created.path, dependencies: created.dependencies })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mrWorkspaceKey(mrRef) }),
        queryClient.invalidateQueries({ queryKey: ['local-checkout', mrRef.host, mrRef.project, mrRef.iid] }),
        queryClient.invalidateQueries({ queryKey: ['local-changes', mrRef.host, mrRef.project, mrRef.iid] }),
      ])
    }
    catch (cause) {
      setState({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }
  return { state, create }
}

function OwnFolderStatus({ state }: { state: ReturnType<typeof useOwnFolder>['state'] }) {
  if (state.kind === 'working')
    return <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', fontSize: 'xs', color: 'fg.muted' })}><Loader2 className={css({ animation: 'spin', w: '3.5', h: '3.5' })} /> Making the folder and copying dependencies. This can take a minute…</div>
  if (state.kind === 'error')
    return <div className={css({ fontSize: 'xs', color: 'danger.fg', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>{state.message}</div>
  if (state.kind === 'done')
    return <div className={css({ fontSize: 'xs', color: 'success.fg' })}>{`This merge request now uses ${state.path}. ${state.dependencies}`}</div>
  return null
}

function WorkspaceGuard({ mrRef, repoPath, workspace, branch }: { mrRef: MrRef, repoPath: string, workspace: LocalWorkspace, branch: string }) {
  const queryClient = useQueryClient()
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const owner = workspace.owner && mrKey(workspace.owner) !== mrKey(mrRef) ? workspace.owner : null
  const ownFolder = useOwnFolder(mrRef)
  const files = workspace.changedFiles === 1 ? '1 changed file' : `${workspace.changedFiles} changed files`

  async function switchHere() {
    setSwitching(true)
    setError(null)
    try {
      const result = await api.checkoutLocal(mrRef, repoPath)
      if (result.status !== 'ready' && result.status !== 'detached')
        setError(result.message)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['local-checkout', mrRef.host, mrRef.project, mrRef.iid] }),
        queryClient.invalidateQueries({ queryKey: localChangesKey(mrRef, repoPath) }),
      ])
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setSwitching(false)
    }
  }

  return (
    <div role="status" className={css({ display: 'flex', flexDir: 'column', gap: '3', p: '4', bg: 'warning.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', fontSize: 'sm' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2', fontWeight: 'semibold', color: 'warning.fg', '& svg': { w: '4', h: '4' } })}>
        <FolderGit2 />
        {owner ? `Your local repository is on !${owner.iid}` : 'Your local repository is on another branch'}
        {owner && workspace.ownerTitle && <span className={css({ fontWeight: 'normal', color: 'fg.default', truncate: true, minW: '0' })}>{workspace.ownerTitle}</span>}
      </div>
      <p className={css({ color: 'fg.muted' })}>
        <span className={css({ fontFamily: 'mono' })}>{repoPath}</span>
        {' '}
        is on
        {' '}
        <span className={css({ fontFamily: 'mono' })}>{describeWorkspace(workspace)}</span>
        , not on this merge request's branch
        {' '}
        <span className={css({ fontFamily: 'mono' })}>{branch}</span>
        .
        {' '}
        {workspace.changedFiles
          ? `Its ${files} ${workspace.changedFiles === 1 ? 'belongs' : 'belong'} to that ${owner ? 'merge request' : 'branch'}, so ${workspace.changedFiles === 1 ? 'it is' : 'they are'} hidden here, and Pull Review won't apply, commit or discard anything in this folder from this merge request.`
          : 'It has no uncommitted changes, so it can switch to this merge request.'}
      </p>
      {workspace.changedPaths.length > 0 && (
        <ul aria-label="Changed files in that folder" className={css({ display: 'flex', flexDir: 'column', gap: '1', p: '2.5', fontFamily: 'mono', fontSize: 'xs', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md' })}>
          {workspace.changedPaths.map(path => <li key={path} className={css({ truncate: true })} title={path}>{path}</li>)}
          {workspace.changedFiles > workspace.changedPaths.length && (
            <li className={css({ fontFamily: 'body', color: 'fg.subtle' })}>and {workspace.changedFiles - workspace.changedPaths.length} more</li>
          )}
        </ul>
      )}
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap' })}>
        {workspace.changedFiles === 0 && (
          <Button size="sm" variant="solid" disabled={switching} onClick={() => void switchHere()}>
            {switching ? <Loader2 className={css({ animation: 'spin' })} /> : <RefreshCw />}
            Switch to this merge request
          </Button>
        )}
        <Button size="sm" disabled={ownFolder.state.kind === 'working'} onClick={() => void ownFolder.create(repoPath, false)} title={`Makes ${workspaceFolderFor(repoPath, mrRef)} on this merge request's branch. The shared folder and its changes stay as they are.`}>
          <FolderPlus />
          Create a folder for this merge request
        </Button>
        {owner && (
          <Link to={`${mrAppPath(owner)}?tab=local`} className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', h: '7', px: '2.5', fontSize: 'xs', fontWeight: 'medium', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', bg: 'bg.surface', _hover: { bg: 'bg.muted' }, '& svg': { w: '3.5', h: '3.5' } })}>
            <ArrowRight />
            {workspace.changedFiles ? `Resolve them in !${owner.iid}` : `Open !${owner.iid}`}
          </Link>
        )}
        {workspace.changedFiles > 0 && (
          <span className={css({ fontSize: 'xs', color: 'fg.muted' })}>
            Commit, push or discard those changes {owner ? `in !${owner.iid}` : 'first'}, then come back to switch.
          </span>
        )}
      </div>
      <OwnFolderStatus state={ownFolder.state} />
      {error && <div className={css({ fontSize: 'xs', color: 'danger.fg' })}>{error}</div>}
    </div>
  )
}

export function LocalChangesPanel({ mrRef, repoPath }: { mrRef: MrRef, repoPath: string }) {
  const queryClient = useQueryClient()
  const { mergeRequest } = useReview()
  const changes = useLocalChanges(mrRef, repoPath, mergeRequest.diffRefs.headSha, mergeRequest.sourceBranch)
  const localRepo = useLocalRepo(mrRef)
  const ownFolder = useOwnFolder(mrRef)
  const [busy, setBusy] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [openCommit, setOpenCommit] = useState<UnpushedCommitSummary | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error', text: string } | null>(null)
  const unpushed = changes.data?.unpushed ?? []
  const branch = mergeRequest.sourceBranch

  async function refreshAfterPush() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: localChangesKey(mrRef, repoPath) }),
      queryClient.invalidateQueries({ queryKey: ['mr', mrKey(mrRef)] }),
    ])
  }

  function committed(result: CommitResult) {
    setCommitting(false)
    const made = result.commits.length === 1 ? '1 commit' : `${result.commits.length} commits`
    setNotice(result.pushed
      ? { tone: 'success', text: `Pushed ${made} to ${branch}. The merge request will show ${result.commits.length === 1 ? 'it' : 'them'} in a moment.` }
      : result.pushError
        ? { tone: 'error', text: `Made ${made}, but the push failed: ${result.pushError}` }
        : { tone: 'success', text: `Made ${made} in ${repoPath}. ${result.commits.length === 1 ? 'It is' : 'They are'} not pushed yet.` })
    void refreshAfterPush()
  }

  async function pushNow() {
    setPushing(true)
    setNotice(null)
    try {
      await api.pushLocalCommits(mrRef, repoPath)
      setNotice({ tone: 'success', text: `Pushed to ${branch}. The merge request will update in a moment.` })
      await refreshAfterPush()
    }
    catch (cause) {
      setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : String(cause) })
    }
    finally {
      setPushing(false)
    }
  }
  const [confirmAll, setConfirmAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const files = changes.data?.files ?? []

  async function discard(paths: string[] | null) {
    setBusy(true)
    setError(null)
    try {
      await api.discardLocalChanges(mrRef, repoPath, paths)
      setConfirmAll(false)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      await queryClient.invalidateQueries({ queryKey: localChangesKey(mrRef, repoPath) })
      setBusy(false)
    }
  }

  const workspace = changes.data?.workspace
  if (workspace && !workspace.belongs)
    return <WorkspaceGuard mrRef={mrRef} repoPath={changes.data!.path} workspace={workspace} branch={branch} />

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '3' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '3', flexWrap: 'wrap' })}>
        <div className={css({ flex: '1', minW: '0' })}>
          <h2 className={css({ fontSize: 'md', fontWeight: 'semibold' })}>
            {files.length ? `${files.length === 1 ? '1 file' : `${files.length} files`} changed, not committed` : 'Local changes'}
          </h2>
          <p className={css({ fontSize: 'xs', color: 'fg.muted', wordBreak: 'break-all' })}>
            In
            {' '}
            <span className={css({ fontFamily: 'mono' })}>{changes.data?.path ?? repoPath}</span>
            . These changes are only on your computer. They are not part of the merge request until they are committed and pushed.
          </p>
        </div>
        <Button size="xs" variant="ghost" disabled={changes.isFetching} onClick={() => void changes.refetch()}>
          <RefreshCw className={changes.isFetching ? css({ animation: 'spin' }) : undefined} />
          Refresh
        </Button>
        {!localRepo.ownFolder && (files.length > 0 || unpushed.length > 0) && !committing && (
          <Button
            size="xs"
            variant="ghost"
            disabled={busy || ownFolder.state.kind === 'working'}
            onClick={() => void ownFolder.create(repoPath, true)}
            title={`Moves your uncommitted changes and unpushed commits to ${workspaceFolderFor(repoPath, mrRef)}, so the shared folder is free for other merge requests.`}
          >
            <FolderInput />
            Move to its own folder
          </Button>
        )}
        {files.length > 0 && !committing && (
          <Button size="xs" variant="solid" disabled={busy} onClick={() => { setCommitting(true); setNotice(null) }}>
            <GitCommitHorizontal />
            Commit and push
          </Button>
        )}
        {files.length > 0 && (confirmAll
          ? <ConfirmDiscard label="Undo all local changes?" busy={busy} onCancel={() => setConfirmAll(false)} onConfirm={() => void discard(null)} />
          : (
              <Button size="xs" disabled={busy} onClick={() => setConfirmAll(true)}>
                <Undo2 />
                Discard all
              </Button>
            ))}
      </div>
      <OwnFolderStatus state={ownFolder.state} />
      {notice && <div className={css({ fontSize: 'sm', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })} style={{ color: notice.tone === 'error' ? 'var(--colors-danger-fg)' : 'var(--colors-success-fg)' }}>{notice.text}</div>}
      {unpushed.length > 0 && (
        <div className={css({ display: 'flex', flexDir: 'column', gap: '2', p: '3', bg: 'warning.subtle', borderRadius: 'lg', fontSize: 'sm' })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap' })}>
            <span className={css({ flex: '1', color: 'warning.fg', fontWeight: 'semibold' })}>
              {unpushed.length === 1 ? '1 commit is' : `${unpushed.length} commits are`}
              {' '}
              not pushed to
              {' '}
              <span className={css({ fontFamily: 'mono' })}>{branch}</span>
            </span>
            <Button size="xs" variant="solid" disabled={pushing} onClick={() => void pushNow()}>
              {pushing ? <Loader2 className={css({ animation: 'spin' })} /> : <Upload />}
              Push
            </Button>
          </div>
          <ul className={css({ display: 'flex', flexDir: 'column', gap: '1', fontSize: 'xs' })}>
            {unpushed.map(commit => (
              <li key={commit.sha}>
                <button
                  type="button"
                  title="Show this commit's changes"
                  onClick={() => setOpenCommit(commit)}
                  className={css({ display: 'flex', alignItems: 'center', gap: '2', maxW: 'full', textAlign: 'left', cursor: 'pointer', _hover: { '& .subject': { textDecoration: 'underline' } }, '& svg': { w: '3.5', h: '3.5', flexShrink: 0, color: 'fg.subtle' } })}
                >
                  <Eye />
                  <span className={css({ fontFamily: 'mono', color: 'fg.subtle' })}>{commit.sha.slice(0, 8)}</span>
                  <span className={`subject ${css({ truncate: true })}`}>{commit.subject}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {committing && files.length > 0 && (
        <CommitForm mrRef={mrRef} repoPath={repoPath} branch={branch} files={files} onDone={committed} onCancel={() => setCommitting(false)} />
      )}
      {error && <div className={css({ fontSize: 'sm', color: 'danger.fg' })}>{error}</div>}
      {changes.error && <div className={css({ fontSize: 'sm', color: 'danger.fg' })}>{changes.error.message}</div>}
      {changes.data?.truncated && <div className={css({ fontSize: 'xs', color: 'warning.fg' })}>The changes are too large to show in full. Some files show no diff.</div>}
      {changes.data && files.length === 0 && unpushed.length === 0 && (
        <div className={css({ display: 'flex', flexDir: 'column', alignItems: 'center', gap: '2', py: '12', color: 'fg.muted', fontSize: 'sm', '& svg': { w: '6', h: '6', color: 'fg.subtle' } })}>
          <FileCheck2 />
          No uncommitted changes. Patches you apply from the Claude chat show up here.
        </div>
      )}
      {files.map(file => <LocalFileCard key={file.path} file={file} busy={busy} onDiscard={() => void discard([file.path])} />)}
      <ChangesDialog
        open={openCommit !== null}
        onClose={() => setOpenCommit(null)}
        title={openCommit?.subject ?? ''}
        description={openCommit ? `Commit ${openCommit.sha.slice(0, 8)}, not pushed yet.` : undefined}
      >
        {openCommit && <UnpushedCommit mrRef={mrRef} repoPath={repoPath} headSha={mergeRequest.diffRefs.headSha} sha={openCommit.sha} />}
      </ChangesDialog>
    </div>
  )
}
