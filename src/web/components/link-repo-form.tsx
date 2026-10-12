import type { LocalFolderInfo } from '../../shared/local-repo'
import type { ProjectRef } from '../../shared/types'
import { useState } from 'react'
import { css } from 'styled-system/css'
import { api } from '../lib/api'
import { Button } from './ui/button'

const pathInput = css({
  w: 'full',
  minW: '0',
  h: '8',
  px: '2.5',
  fontSize: 'xs',
  fontFamily: 'mono',
  bg: 'bg.surface',
  color: 'fg.default',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  outline: 'none',
  _focus: { borderColor: 'accent.default' },
  _placeholder: { color: 'fg.subtle' },
  _disabled: { opacity: 0.6 },
})

const option = css({
  display: 'flex',
  gap: '2.5',
  p: '2.5',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  cursor: 'pointer',
  '&:has(input:checked)': { borderColor: 'accent.default', bg: 'accent.subtle' },
  '&:has(input:disabled)': { opacity: 0.55, cursor: 'not-allowed' },
})

type Choice = 'create' | 'use'

interface LinkRepoFormProps {
  project: ProjectRef
  initialPath?: string
  onLinked: (path: string) => void
  onCancel: () => void
}

function describeFolder(info: LocalFolderInfo) {
  const where = info.branch ? `on ${info.branch}` : 'without a branch checked out'
  return info.isLinkedWorktree ? `This folder is a git worktree ${where}.` : `This folder is your main checkout, ${where}.`
}

export function LinkRepoForm({ project, initialPath = '', onLinked, onCancel }: LinkRepoFormProps) {
  const [path, setPath] = useState(initialPath)
  const [info, setInfo] = useState<LocalFolderInfo | null>(null)
  const [choice, setChoice] = useState<Choice>('create')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await task()
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setBusy(false)
    }
  }

  function inspect() {
    return run(async () => {
      const result = await api.inspectLocalFolder({ path: path.trim(), project: project.project })
      setInfo(result)
      setChoice(result.isLinkedWorktree ? 'use' : 'create')
      setTarget(result.suggestedWorktreePath)
    })
  }

  function save() {
    if (!info)
      return
    return run(async () => {
      if (choice === 'use') {
        onLinked(info.path)
        return
      }
      const created = await api.createLocalWorktree({ sourcePath: info.path, targetPath: target.trim(), project: project.project })
      onLinked(created.path)
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void (info ? save() : inspect())
      }}
      className={css({ display: 'flex', flexDir: 'column', gap: '2.5', fontSize: 'xs' })}
    >
      <div className={css({ display: 'flex', gap: '1.5' })}>
        <input
          autoFocus
          value={path}
          disabled={Boolean(info) || busy}
          onChange={event => setPath(event.target.value)}
          placeholder="~/code/project"
          aria-label={`Local folder for ${project.project}`}
          className={pathInput}
        />
        {!info && <Button size="sm" type="submit" variant="solid" disabled={!path.trim() || busy}>{busy ? 'Checking…' : 'Continue'}</Button>}
        {info && <Button size="sm" variant="ghost" onClick={() => setInfo(null)} disabled={busy}>Change</Button>}
      </div>

      {info && (
        <>
          <p className={css({ color: 'fg.muted' })}>{describeFolder(info)}</p>
          <label className={option}>
            <input type="radio" name="link-choice" checked={choice === 'create'} onChange={() => setChoice('create')} />
            <span className={css({ display: 'flex', flexDir: 'column', gap: '1.5', flex: '1', minW: '0' })}>
              <span className={css({ fontWeight: 'semibold', color: 'fg.default' })}>Create a worktree for Pull Review</span>
              <span className={css({ color: 'fg.muted' })}>Your folder stays as it is. Pull Review switches the new worktree to the branch of each merge request you open.</span>
              <input value={target} onChange={event => setTarget(event.target.value)} disabled={choice !== 'create' || busy} aria-label="Folder for the new worktree" className={pathInput} />
            </span>
          </label>
          <label className={option}>
            <input type="radio" name="link-choice" checked={choice === 'use'} disabled={!info.isLinkedWorktree} onChange={() => setChoice('use')} />
            <span className={css({ display: 'flex', flexDir: 'column', gap: '1', flex: '1', minW: '0' })}>
              <span className={css({ fontWeight: 'semibold', color: 'fg.default' })}>Use this folder</span>
              <span className={css({ color: 'fg.muted' })}>
                {info.isLinkedWorktree
                  ? 'For a worktree you made for reviews. Pull Review switches its branch when you open a merge request, unless it has uncommitted changes.'
                  : 'Only a worktree can be used, so that Pull Review never switches the branch of your main checkout.'}
              </span>
              {info.isLinkedWorktree && info.dirty && <span className={css({ color: 'warning.fg' })}>It has uncommitted changes right now.</span>}
            </span>
          </label>
        </>
      )}

      {error && <p className={css({ color: 'danger.fg' })}>{error}</p>}

      <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '1.5' })}>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        {info && (
          <Button size="sm" type="submit" variant="solid" disabled={busy || (choice === 'create' && !target.trim())} className={css({ minW: '20' })}>
            {busy ? (choice === 'create' ? 'Creating…' : 'Saving…') : choice === 'create' ? 'Create worktree' : 'Use folder'}
          </Button>
        )}
      </div>
    </form>
  )
}
