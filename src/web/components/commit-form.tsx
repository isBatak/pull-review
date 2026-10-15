import type { CommitResult, PlannedCommit } from '../../shared/commit-plan'
import type { LocalChangedFile } from '../../shared/local-changes'
import type { MrRef } from '../../shared/types'
import { GitCommitHorizontal, Loader2, Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { css } from 'styled-system/css'
import { validateCommits } from '../../shared/commit-plan'
import { api } from '../lib/api'
import { useChatAvailable } from '../lib/chat'
import { fileName } from '../lib/format'
import { EFFORT_OPTIONS, MODEL_OPTIONS } from '../lib/model-options'
import { useSettings } from '../lib/settings'
import { Button, IconButton } from './ui/button'
import { Select } from './ui/select'

const LEAVE_OUT = -1

const box = css({ display: 'flex', flexDir: 'column', gap: '3', p: '4', bg: 'bg.surface', borderWidth: '1px', borderColor: 'accent.default', borderRadius: 'lg' })
const textarea = css({ w: 'full', minH: '16', p: '2', fontFamily: 'mono', fontSize: 'xs', bg: 'bg.canvas', color: 'fg.default', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', outline: 'none', resize: 'vertical', _focus: { borderColor: 'accent.default' } })

interface CommitFormProps {
  mrRef: MrRef
  repoPath: string
  branch: string
  files: LocalChangedFile[]
  onDone: (result: CommitResult) => void
  onCancel: () => void
}

function moveFile(commits: PlannedCommit[], path: string, target: number) {
  return commits.map((commit, index) => {
    const without = commit.files.filter(file => file !== path)
    return index === target ? { ...commit, files: [...without, path] } : { ...commit, files: without }
  })
}

export function CommitForm({ mrRef, repoPath, branch, files, onDone, onCancel }: CommitFormProps) {
  const [settings, updateSettings] = useSettings()
  const chatAvailable = useChatAvailable()
  const [commits, setCommits] = useState<PlannedCommit[]>(() => [{ message: '', files: files.map(file => file.path) }])
  const [push, setPush] = useState(true)
  const [skipHooks, setSkipHooks] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changedPaths = files.map(file => file.path)
  const included = commits.filter(commit => commit.files.length > 0)
  const problem = validateCommits(included, changedPaths)
  const leftOut = changedPaths.filter(path => !commits.some(commit => commit.files.includes(path)))
  const busy = planning || committing
  const targetOptions = useMemo(() => [
    ...Array.from({ length: commits.length }, (_, index) => ({ value: String(index), label: `Commit ${index + 1}` })),
    { value: String(LEAVE_OUT), label: 'Leave uncommitted' },
  ], [commits.length])

  async function plan() {
    setPlanning(true)
    setError(null)
    try {
      const result = await api.planCommits(mrRef, { repoPath, model: settings.commitModel, effort: settings.commitEffort })
      setCommits(result.commits)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setPlanning(false)
    }
  }

  async function commit() {
    setCommitting(true)
    setError(null)
    try {
      onDone(await api.commitLocalChanges(mrRef, { repoPath, commits: included, push, skipHooks }))
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setCommitting(false)
    }
  }

  const count = included.length
  const commitLabel = count === 1 ? '1 commit' : `${count} commits`

  return (
    <div className={box}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap' })}>
        <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold', flex: '1' })}>Commit and push</h3>
        {chatAvailable && (
          <>
            <Select variant="compact" label="Model for planning commits" value={settings.commitModel} options={MODEL_OPTIONS} disabled={busy} onChange={commitModel => updateSettings({ commitModel })} />
            <Select variant="compact" label="Effort for planning commits" value={settings.commitEffort} options={EFFORT_OPTIONS} disabled={busy} onChange={commitEffort => updateSettings({ commitEffort })} />
          </>
        )}
        {chatAvailable && (
          <Button size="xs" disabled={busy} onClick={() => void plan()} title="Claude groups the changes into atomic commits and writes messages in this repository's style. You can edit the plan before committing.">
            {planning ? <Loader2 className={css({ animation: 'spin' })} /> : <Sparkles />}
            {planning ? 'Planning commits…' : 'Plan atomic commits with Claude'}
          </Button>
        )}
      </div>

      {commits.map((commit, index) => (
        <div key={index} className={css({ display: 'flex', flexDir: 'column', gap: '2', p: '3', bg: 'bg.subtle', borderRadius: 'md' })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', fontSize: 'xs', fontWeight: 'semibold', '& > svg': { w: '4', h: '4', color: 'fg.subtle' } })}>
            <GitCommitHorizontal />
            Commit {index + 1}
            {commits.length > 1 && (
              <span className={css({ ml: 'auto' })}>
                <IconButton size="xs" label={`Remove commit ${index + 1}`} disabled={busy} onClick={() => setCommits(current => current.filter((_, position) => position !== index))}>
                  <Trash2 />
                </IconButton>
              </span>
            )}
          </div>
          <textarea
            aria-label={`Message for commit ${index + 1}`}
            className={textarea}
            value={commit.message}
            disabled={busy}
            placeholder="Commit message. The first line is the subject."
            onChange={event => setCommits(current => current.map((each, position) => position === index ? { ...each, message: event.target.value } : each))}
          />
          {commit.files.length === 0 && <span className={css({ fontSize: 'xs', color: 'fg.subtle' })}>No files. Move files here, or remove this commit.</span>}
          {commit.files.map(path => (
            <div key={path} className={css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'xs' })}>
              <span className={css({ fontFamily: 'mono', truncate: true, flex: '1', minW: '0' })} title={path}>{path}</span>
              <Select variant="compact" label={`Commit for ${fileName(path)}`} value={String(index)} options={targetOptions} disabled={busy} onChange={target => setCommits(current => moveFile(current, path, Number(target)))} />
            </div>
          ))}
        </div>
      ))}

      {leftOut.length > 0 && (
        <div className={css({ display: 'flex', flexDir: 'column', gap: '1.5', fontSize: 'xs' })}>
          <span className={css({ fontWeight: 'semibold', color: 'fg.muted' })}>Left uncommitted</span>
          {leftOut.map(path => (
            <div key={path} className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
              <span className={css({ fontFamily: 'mono', truncate: true, flex: '1', minW: '0', color: 'fg.muted' })} title={path}>{path}</span>
              <Select variant="compact" label={`Commit for ${fileName(path)}`} value={String(LEAVE_OUT)} options={targetOptions} disabled={busy} onChange={target => setCommits(current => moveFile(current, path, Number(target)))} />
            </div>
          ))}
        </div>
      )}

      <div>
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => setCommits(current => [...current, { message: '', files: [] }])}>
          <Plus />
          Add commit
        </Button>
      </div>

      <div className={css({ display: 'flex', flexDir: 'column', gap: '1.5', fontSize: 'xs', color: 'fg.muted' })}>
        <label className={css({ display: 'flex', alignItems: 'center', gap: '2', cursor: 'pointer' })}>
          <input type="checkbox" checked={push} disabled={busy} onChange={event => setPush(event.target.checked)} />
          Push to
          {' '}
          <span className={css({ fontFamily: 'mono' })}>{branch}</span>
          {' '}
          after committing
        </label>
        <label className={css({ display: 'flex', alignItems: 'center', gap: '2', cursor: 'pointer' })}>
          <input type="checkbox" checked={skipHooks} disabled={busy} onChange={event => setSkipHooks(event.target.checked)} />
          Skip git hooks (--no-verify). Use this only when a hook can't run in this folder, for example because dependencies aren't installed.
        </label>
      </div>

      <p className={css({ fontSize: 'xs', color: 'fg.muted' })}>
        {push
          ? `Creates ${commitLabel} and pushes ${count === 1 ? 'it' : 'them'} to ${branch} on GitLab. The merge request updates for everyone. It never force-pushes: if GitLab has newer commits, nothing is overwritten.`
          : `Creates ${commitLabel} in ${repoPath}. Nothing is sent to GitLab.`}
      </p>

      {(error ?? (included.length ? problem : null)) && (
        <div className={css({ fontSize: 'xs', color: 'danger.fg', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>{error ?? problem}</div>
      )}

      <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '2' })}>
        <Button size="sm" variant="ghost" disabled={committing} onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="solid" disabled={busy || !included.length || problem !== null} onClick={() => void commit()}>
          {committing ? <Loader2 className={css({ animation: 'spin' })} /> : push ? <Upload /> : <GitCommitHorizontal />}
          {committing ? 'Committing…' : count > 1 ? `Make ${commitLabel}${push ? ' and push' : ''}` : push ? 'Commit and push' : 'Commit'}
        </Button>
      </div>
    </div>
  )
}
