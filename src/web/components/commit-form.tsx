import type { CommitResult, CommitUnit, PlannedCommit, SplitInfo } from '../../shared/commit-plan'
import type { LocalChangedFile } from '../../shared/local-changes'
import type { MrRef } from '../../shared/types'
import { Eye, GitCommitHorizontal, Loader2, Plus, Scissors, Sparkles, Trash2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { css } from 'styled-system/css'
import { hunkLines, hunkPatch, leftoverUnits, moveUnit, splitFile, splitHunks, splitInfo, validateCommits } from '../../shared/commit-plan'
import { api } from '../lib/api'
import { useChatAvailable } from '../lib/chat'
import { fileName } from '../lib/format'
import { MODEL_OPTIONS } from '../lib/model-options'
import { EffortSlider } from './ui/effort-slider'
import { useSettings } from '../lib/settings'
import { ChangesDialog } from './changes-dialog'
import { PatchFileCard } from './patch-file-card'
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

function CommitChanges({ commit, files }: { commit: PlannedCommit, files: LocalChangedFile[] }) {
  const byPath = new Map(files.map(file => [file.path, file]))
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
      {commit.files.map((path) => {
        const file = byPath.get(path)
        if (!file)
          return null
        const hunks = commit.hunks?.[path]
        return (
          <PatchFileCard
            key={path}
            path={path}
            previousPath={file.previousPath}
            diff={hunks ? hunkPatch(file.diff, hunks) : file.diff}
            isBinary={file.isBinary}
            label={hunks ? `${hunks.length} of ${splitHunks(file.diff).hunks.length} parts` : undefined}
          />
        )
      })}
    </div>
  )
}

function unitsOf(commit: PlannedCommit): CommitUnit[] {
  return commit.files.flatMap((path): CommitUnit[] => commit.hunks?.[path]?.map(hunk => ({ path, hunk })) ?? [{ path, hunk: null }])
}

function unitKey(unit: CommitUnit) {
  return `${unit.path}#${unit.hunk ?? 'all'}`
}

interface UnitRowProps {
  unit: CommitUnit
  target: number
  info: SplitInfo | undefined
  diff: string
  options: { value: string, label: string }[]
  busy: boolean
  muted?: boolean
  onMove: (target: number) => void
  onSplit?: () => void
}

function partLabel(diff: string, hunk: number, count: number) {
  const lines = hunkLines(splitHunks(diff).hunks[hunk] ?? [])
  const where = !lines ? '' : lines.start === lines.end ? `, line ${lines.start}` : `, lines ${lines.start} to ${lines.end}`
  return `part ${hunk + 1} of ${count}${where}`
}

function UnitRow({ unit, target, info, diff, options, busy, muted, onMove, onSplit }: UnitRowProps) {
  return (
    <div className={css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'xs' })}>
      <span className={css({ display: 'flex', gap: '2', alignItems: 'baseline', flex: '1', minW: '0', color: muted ? 'fg.muted' : undefined })} title={unit.path}>
        <span className={css({ fontFamily: 'mono', truncate: true })}>{unit.path}</span>
        {unit.hunk !== null && <span className={css({ flexShrink: 0, color: 'fg.subtle' })}>{partLabel(diff, unit.hunk, info?.hunkCount ?? 0)}</span>}
      </span>
      {onSplit && (
        <Button size="xs" variant="ghost" disabled={busy} onClick={onSplit} title="Show each changed part of this file on its own row, so parts can go into different commits.">
          <Scissors />
          Split into parts
        </Button>
      )}
      <Select variant="compact" label={`Commit for ${fileName(unit.path)}${unit.hunk === null ? '' : `, part ${unit.hunk + 1}`}`} value={String(target)} options={options} disabled={busy} onChange={value => onMove(Number(value))} />
    </div>
  )
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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const previewed = previewIndex === null ? null : commits[previewIndex] ?? null

  const infos = useMemo(() => files.map(splitInfo), [files])
  const infoByPath = useMemo(() => new Map(infos.map(info => [info.path, info])), [infos])
  const diffByPath = useMemo(() => new Map(files.map(file => [file.path, file.diff])), [files])
  const included = commits.filter(commit => commit.files.length > 0)
  const problem = validateCommits(included, infos)
  const leftOut = leftoverUnits(commits, infos)
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
      setPreviewIndex(null)
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
            <EffortSlider label="Effort for planning commits" value={settings.commitEffort} disabled={busy} onChange={commitEffort => updateSettings({ commitEffort })} />
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
            <span className={css({ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: '1' })}>
              {commit.files.length > 0 && (
                <Button size="xs" variant="ghost" onClick={() => setPreviewIndex(index)}>
                  <Eye />
                  Show changes
                </Button>
              )}
              {commits.length > 1 && (
                <IconButton size="xs" label={`Remove commit ${index + 1}`} disabled={busy} onClick={() => {
                  setCommits(current => current.filter((_, position) => position !== index))
                  setPreviewIndex(null)
                }}>
                  <Trash2 />
                </IconButton>
              )}
            </span>
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
          {unitsOf(commit).map(unit => (
            <UnitRow
              key={unitKey(unit)}
              unit={unit}
              target={index}
              info={infoByPath.get(unit.path)}
              diff={diffByPath.get(unit.path) ?? ''}
              options={targetOptions}
              busy={busy}
              onMove={target => setCommits(current => moveUnit(current, unit, target))}
              onSplit={unit.hunk === null && infoByPath.get(unit.path)?.splittable
                ? () => setCommits(current => splitFile(current, index, unit.path, infoByPath.get(unit.path)!.hunkCount))
                : undefined}
            />
          ))}
        </div>
      ))}

      {leftOut.length > 0 && (
        <div className={css({ display: 'flex', flexDir: 'column', gap: '1.5', fontSize: 'xs' })}>
          <span className={css({ fontWeight: 'semibold', color: 'fg.muted' })}>Left uncommitted</span>
          {leftOut.map(unit => (
            <UnitRow
              key={unitKey(unit)}
              unit={unit}
              target={LEAVE_OUT}
              info={infoByPath.get(unit.path)}
              diff={diffByPath.get(unit.path) ?? ''}
              options={targetOptions}
              busy={busy}
              muted
              onMove={target => setCommits(current => moveUnit(current, unit, target))}
            />
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
      <ChangesDialog
        open={previewed !== null}
        onClose={() => setPreviewIndex(null)}
        title={`Commit ${(previewIndex ?? 0) + 1}: ${previewed?.message.trim().split('\n')[0] || 'no message yet'}`}
        description={previewed ? `${previewed.files.length === 1 ? '1 file' : `${previewed.files.length} files`}. This is exactly what goes into the commit.` : undefined}
      >
        {previewed && <CommitChanges commit={previewed} files={files} />}
      </ChangesDialog>
    </div>
  )
}
