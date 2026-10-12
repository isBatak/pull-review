import type { AppSettings } from '../../lib/settings'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { css, cx } from 'styled-system/css'
import { projectKey, useAppConfig } from '../../lib/local-repos'
import { parseProjectInput } from '../../lib/settings'
import { Button, IconButton } from '../ui/button'

const input = css({
  w: 'full',
  h: '9',
  px: '3',
  fontSize: 'sm',
  bg: 'bg.surface',
  color: 'fg.default',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  outline: 'none',
  _focus: { borderColor: 'accent.default', boxShadow: '0 0 0 3px color-mix(in srgb, var(--colors-accent-default) 18%, transparent)' },
  _placeholder: { color: 'fg.subtle' },
})

const monoInput = cx(input, css({ fontFamily: 'mono' }))
const fieldLabel = css({ display: 'block', fontSize: 'xs', fontWeight: 'semibold', mb: '1.5' })
const fieldHint = css({ fontSize: 'xs', color: 'fg.subtle', mt: '1.5' })
const row = css({ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr) 5.5rem', alignItems: 'center', gap: '2', '& > :last-child': { justifySelf: 'end' } })
const projectCell = css({ fontFamily: 'mono', fontSize: 'xs', color: 'fg.muted', truncate: true })

interface LocalReposProps {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}

function RepoRow({ project, path, onChange, onRemove }: { project: string, path: string, onChange: (path: string) => void, onRemove: () => void }) {
  const [value, setValue] = useState(path)
  return (
    <div className={row}>
      <span className={projectCell} title={project}>{project}</span>
      <input
        className={monoInput}
        value={value}
        onChange={event => setValue(event.target.value)}
        onBlur={() => {
          if (value.trim() !== path)
            onChange(value.trim())
        }}
        placeholder="Not set"
        aria-label={`Local folder for ${project}`}
      />
      <IconButton label={`Remove ${project}`} onClick={onRemove}>
        <Trash2 />
      </IconButton>
    </div>
  )
}

export function LocalRepos({ settings, onChange }: LocalReposProps) {
  const config = useAppConfig()
  const [projectInput, setProjectInput] = useState(settings.project ? projectKey(settings.project) : '')
  const [pathInput, setPathInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const entries = Object.entries(settings.localRepos).sort(([a], [b]) => a.localeCompare(b))
  const detected = config.data?.localRepo
  const detectedKey = detected ? projectKey(detected) : null
  const showDetected = detected && detectedKey && !(detectedKey in settings.localRepos)

  function save(key: string, path: string | null) {
    const localRepos = { ...settings.localRepos }
    if (path === null)
      delete localRepos[key]
    else
      localRepos[key] = path
    onChange({ localRepos })
  }

  function add() {
    const ref = parseProjectInput(projectInput)
    if (!ref) {
      setError('Use a project link like https://gitlab.com/group/project')
      return
    }
    if (!pathInput.trim()) {
      setError('Enter the folder of your local copy, for example ~/code/project.')
      return
    }
    save(projectKey(ref), pathInput.trim())
    setPathInput('')
    setError(null)
  }

  return (
    <div>
      <span className={fieldLabel}>Local repositories</span>
      <p className={css({ fontSize: 'xs', color: 'fg.subtle', mb: '3' })}>
        Where each GitLab project is cloned on this computer. Features that need the full repository use it, such as the Claude chat reading full files. Pull Review works in its own temporary worktrees, so your checkout and branch are not changed.
      </p>
      <div className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
        {showDetected && (
          <div className={row}>
            <span className={projectCell} title={detectedKey}>{detectedKey}</span>
            <span className={css({ fontFamily: 'mono', fontSize: 'xs', truncate: true })} title={detected.path}>{detected.path}</span>
            <span className={css({ fontSize: 'xs', color: 'fg.subtle', whiteSpace: 'nowrap' })}>Found automatically</span>
          </div>
        )}
        {entries.map(([key, path]) => (
          <RepoRow key={`${key}:${path}`} project={key} path={path} onChange={next => save(key, next)} onRemove={() => save(key, null)} />
        ))}
        {!showDetected && entries.length === 0 && (
          <div className={css({ fontSize: 'sm', color: 'fg.muted' })}>No local repositories yet.</div>
        )}
      </div>
      <form
        className={cx(row, css({ mt: '4' }))}
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <input className={input} value={projectInput} onChange={event => setProjectInput(event.target.value)} placeholder="gitlab.com/group/project" aria-label="GitLab project" />
        <input className={monoInput} value={pathInput} onChange={event => setPathInput(event.target.value)} placeholder="~/code/project" aria-label="Local folder" />
        <Button type="submit" size="md">Add</Button>
      </form>
      <p className={cx(fieldHint, css({ color: error ? 'danger.fg' : 'fg.subtle' }))}>
        {error ?? 'When you start the CLI inside a clone, that clone is found automatically. You can also add a folder from the Claude chat panel.'}
      </p>
    </div>
  )
}
