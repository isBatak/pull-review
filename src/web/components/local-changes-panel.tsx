import type { CommitResult } from '../../shared/commit-plan'
import type { LocalChangedFile, UnpushedCommit as UnpushedCommitSummary } from '../../shared/local-changes'
import type { MrRef } from '../../shared/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, FileCheck2, GitCommitHorizontal, Loader2, RefreshCw, Undo2, Upload } from 'lucide-react'
import { useState } from 'react'
import { css } from 'styled-system/css'
import { api } from '../lib/api'
import { localChangesKey, useLocalChanges } from '../lib/local-repos'
import { mrKey } from '../../shared/mr-ref'
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

export function LocalChangesPanel({ mrRef, repoPath }: { mrRef: MrRef, repoPath: string }) {
  const queryClient = useQueryClient()
  const { mergeRequest } = useReview()
  const changes = useLocalChanges(mrRef, repoPath, mergeRequest.diffRefs.headSha)
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
