import type { ProjectRef } from '../../../shared/types'
import type { AppSettings } from '../../lib/settings'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { css, cx } from 'styled-system/css'
import { projectKey, useAppConfig } from '../../lib/local-repos'
import { parseProjectInput } from '../../lib/settings'
import { LinkRepoForm } from '../link-repo-form'
import { Button, IconButton } from '../ui/button'

const fieldLabel = css({ display: 'block', fontSize: 'xs', fontWeight: 'semibold', mb: '1.5' })
const fieldHint = css({ fontSize: 'xs', color: 'fg.subtle', mt: '1.5' })
const row = css({ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr) auto', alignItems: 'center', gap: '2', minH: '9' })
const projectCell = css({ fontFamily: 'mono', fontSize: 'xs', color: 'fg.muted', truncate: true })
const pathCell = css({ fontFamily: 'mono', fontSize: 'xs', truncate: true })
const currentRow = css({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '2', minH: '9', px: '3', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md' })
const formBox = css({ p: '3', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md' })

interface LocalReposProps {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}

export function LocalRepos({ settings, onChange }: LocalReposProps) {
  const config = useAppConfig()
  const [editing, setEditing] = useState<string | null>(null)

  const currentKey = settings.project ? projectKey(settings.project) : null
  const savedCurrent = currentKey ? settings.localRepos[currentKey] : undefined
  const detected = config.data?.localRepo
  const detectedPath = detected && currentKey === projectKey(detected) && savedCurrent === undefined ? detected.path : null
  const others = Object.entries(settings.localRepos)
    .filter(([key, path]) => key !== currentKey && path)
    .sort(([a], [b]) => a.localeCompare(b))

  function save(key: string, path: string | null) {
    const localRepos = { ...settings.localRepos }
    if (path === null)
      delete localRepos[key]
    else
      localRepos[key] = path
    onChange({ localRepos })
  }

  function renderForm(key: string, project: ProjectRef, initialPath: string) {
    return (
      <div className={formBox}>
        <LinkRepoForm
          project={project}
          initialPath={initialPath}
          onCancel={() => setEditing(null)}
          onLinked={(path) => {
            save(key, path)
            setEditing(null)
          }}
        />
      </div>
    )
  }

  function renderCurrent() {
    if (!settings.project || !currentKey)
      return <p className={css({ fontSize: 'sm', color: 'fg.muted' })}>Choose a GitLab project above first.</p>
    if (editing === currentKey)
      return renderForm(currentKey, settings.project, savedCurrent || detectedPath || '')
    const path = savedCurrent || detectedPath
    return (
      <div className={currentRow}>
        <span className={pathCell} title={path ?? undefined}>
          {path ?? <span className={css({ fontFamily: 'body', color: 'fg.subtle' })}>Not set up</span>}
          {detectedPath && <span className={css({ ml: '1.5', fontFamily: 'body', color: 'fg.subtle' })}>found where you started the CLI</span>}
        </span>
        <span className={css({ display: 'flex', gap: '1' })}>
          <Button size="sm" variant={path ? 'outline' : 'solid'} onClick={() => setEditing(currentKey)}>{path ? 'Change' : 'Set up'}</Button>
          {savedCurrent && (
            <IconButton label="Remove" onClick={() => save(currentKey, null)}>
              <Trash2 />
            </IconButton>
          )}
        </span>
      </div>
    )
  }

  return (
    <div>
      <span className={fieldLabel}>Local repository</span>
      <p className={css({ fontSize: 'xs', color: 'fg.subtle', mb: '3' })}>
        A git worktree of the project on this computer. When you open a merge request, Pull Review switches it to the merge request's branch, so opening a file in your editor and the Claude chat see the right code. Your main checkout is never switched.
      </p>
      {renderCurrent()}
      {others.length > 0 && (
        <div className={css({ mt: '4' })}>
          <span className={cx(fieldLabel, css({ color: 'fg.muted' }))}>Other projects</span>
          <p className={cx(fieldHint, css({ mt: '0', mb: '2' }))}>Linked while reviewing merge requests from other projects.</p>
          <div className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
            {others.map(([key, path]) => {
              const project = parseProjectInput(key)
              if (editing === key && project)
                return <div key={key}>{renderForm(key, project, path)}</div>
              return (
                <div key={key} className={row}>
                  <span className={projectCell} title={key}>{key}</span>
                  <span className={pathCell} title={path}>{path}</span>
                  <span className={css({ display: 'flex', gap: '1' })}>
                    <Button size="sm" onClick={() => setEditing(key)} disabled={!project}>Change</Button>
                    <IconButton label={`Remove ${key}`} onClick={() => save(key, null)}>
                      <Trash2 />
                    </IconButton>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
