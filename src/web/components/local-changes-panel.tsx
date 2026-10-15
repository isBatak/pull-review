import type { FileDiffOptions } from '@pierre/diffs/react'
import type { CommitResult } from '../../shared/commit-plan'
import type { LocalChangedFile } from '../../shared/local-changes'
import type { MrRef } from '../../shared/types'
import { FileDiff } from '@pierre/diffs/react'
import { useQueryClient } from '@tanstack/react-query'
import { FileCheck2, GitCommitHorizontal, Loader2, RefreshCw, Undo2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { css } from 'styled-system/css'
import { api } from '../lib/api'
import { GITHUB_THEMES } from '../lib/code-tokens'
import { directoryName, fileName } from '../lib/format'
import { localChangesKey, useLocalChanges } from '../lib/local-repos'
import { useDiffLayout, useTheme, useWrapLines } from '../lib/preferences'
import { parsePatch } from './chat/patch-view'
import { mrKey } from '../../shared/mr-ref'
import { CommitForm } from './commit-form'
import { DiffStat } from './file-diff-card'
import { useReview } from './review-context'
import { Button } from './ui/button'
import { FileIcon } from './ui/file-icon'

const STATUS_LABELS: Record<LocalChangedFile['status'], string> = {
  added: 'New',
  modified: 'Modified',
  removed: 'Deleted',
  renamed: 'Renamed',
}

const diffStyle = {
  '--diffs-font-family': 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  '--diffs-font-size': '12px',
  '--diffs-line-height': '20px',
} as React.CSSProperties

const card = css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', overflow: 'hidden' })

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
  const [theme] = useTheme()
  const [layout] = useDiffLayout()
  const [wrap] = useWrapLines()
  const [confirming, setConfirming] = useState(false)
  const fileDiff = useMemo(() => parsePatch(file.diff)[0] ?? null, [file.diff])
  const isOneSided = file.additions === 0 || file.deletions === 0
  const options = useMemo<FileDiffOptions<undefined, undefined>>(() => ({
    diffStyle: isOneSided ? 'unified' : layout,
    overflow: wrap ? 'wrap' : 'scroll',
    theme: GITHUB_THEMES,
    themeType: theme,
    disableFileHeader: true,
    lineDiffType: 'word-alt',
  }), [isOneSided, layout, wrap, theme])

  return (
    <section className={card}>
      <header className={css({ display: 'flex', alignItems: 'center', gap: '2', minH: '10', px: '2.5', bg: 'bg.subtle', borderBottomWidth: '1px', borderColor: 'border.default' })}>
        <FileIcon name={fileName(file.path)} />
        <div className={css({ minW: '0', display: 'flex', alignItems: 'center', fontFamily: 'mono', fontSize: 'xs' })} title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}>
          <span className={css({ color: 'fg.subtle', truncate: true })}>{directoryName(file.path)}</span>
          <span className={css({ fontWeight: 'semibold', whiteSpace: 'nowrap' })}>{fileName(file.path)}</span>
        </div>
        <div className={css({ ml: 'auto', display: 'flex', alignItems: 'center', gap: '3', flexShrink: 0 })}>
          {!file.isBinary && <DiffStat additions={file.additions} deletions={file.deletions} />}
          <span className={css({ fontSize: '2xs', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'wide', color: 'fg.subtle' })}>{STATUS_LABELS[file.status]}</span>
          {confirming
            ? <ConfirmDiscard label={file.untracked ? 'Delete this new file?' : 'Undo these changes?'} busy={busy} onCancel={() => setConfirming(false)} onConfirm={onDiscard} />
            : (
                <Button size="xs" variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
                  <Undo2 />
                  Discard
                </Button>
              )}
        </div>
      </header>
      {file.isBinary && <div className={css({ p: '4', fontSize: 'sm', color: 'fg.muted' })}>Binary file changed.</div>}
      {!file.isBinary && fileDiff && <FileDiff fileDiff={fileDiff} options={options} style={diffStyle} />}
      {!file.isBinary && !fileDiff && <div className={css({ p: '4', fontSize: 'sm', color: 'fg.muted' })}>No line changes to show.</div>}
    </section>
  )
}

export function LocalChangesPanel({ mrRef, repoPath }: { mrRef: MrRef, repoPath: string }) {
  const queryClient = useQueryClient()
  const { mergeRequest } = useReview()
  const changes = useLocalChanges(mrRef, repoPath, mergeRequest.diffRefs.headSha)
  const [busy, setBusy] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [pushing, setPushing] = useState(false)
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
              <li key={commit.sha} className={css({ display: 'flex', gap: '2' })}>
                <span className={css({ fontFamily: 'mono', color: 'fg.subtle' })}>{commit.sha.slice(0, 8)}</span>
                <span className={css({ truncate: true })}>{commit.subject}</span>
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
    </div>
  )
}
