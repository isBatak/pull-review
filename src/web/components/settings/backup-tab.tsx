import type { ParsedBackup, Preferences } from '../../lib/settings-backup'
import type { AppSettings } from '../../lib/settings'
import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { css } from 'styled-system/css'
import { backupFileName, buildBackup, parseBackup, PREFERENCE_KEYS } from '../../lib/settings-backup'
import { readStoredValue, writeStoredValue } from '../../lib/stored-state'
import { Button } from '../ui/button'

function currentPreferences(): Preferences {
  return {
    diffLayout: readStoredValue(PREFERENCE_KEYS.diffLayout),
    wrapLines: readStoredValue(PREFERENCE_KEYS.wrapLines),
    theme: readStoredValue(PREFERENCE_KEYS.theme) ?? null,
    sidebarWidth: readStoredValue(PREFERENCE_KEYS.sidebarWidth),
  }
}

function applyPreferences(preferences: Preferences) {
  if (preferences.diffLayout)
    writeStoredValue(PREFERENCE_KEYS.diffLayout, preferences.diffLayout)
  if (preferences.wrapLines !== undefined)
    writeStoredValue(PREFERENCE_KEYS.wrapLines, preferences.wrapLines)
  if (preferences.theme !== undefined)
    writeStoredValue(PREFERENCE_KEYS.theme, preferences.theme)
  if (preferences.sidebarWidth)
    writeStoredValue(PREFERENCE_KEYS.sidebarWidth, preferences.sidebarWidth)
}

function summary(backup: ParsedBackup) {
  const { settings } = backup
  return [
    settings.project ? `project ${settings.project.project}` : 'no project',
    `${settings.teams.length} team${settings.teams.length === 1 ? '' : 's'}`,
    `${settings.categories.length} categories`,
  ].join(', ')
}

interface BackupTabProps {
  settings: AppSettings
  onReplace: (settings: AppSettings) => void
}

export function BackupTab({ settings, onReplace }: BackupTabProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ParsedBackup | null>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'success', text: string } | null>(null)

  function exportSettings() {
    const backup = buildBackup(settings, currentPreferences())
    const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = backupFileName()
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage({ tone: 'success', text: `Saved ${backupFileName()}.` })
  }

  async function readFile(file: File) {
    try {
      const parsed = parseBackup(await file.text())
      setPending(parsed)
      setMessage(null)
    }
    catch (error) {
      setPending(null)
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) })
    }
  }

  function applyImport() {
    if (!pending)
      return
    onReplace(pending.settings)
    applyPreferences(pending.preferences)
    setMessage({ tone: 'success', text: `Imported ${summary(pending)}.` })
    setPending(null)
  }

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '6' })}>
      <section className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
        <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold' })}>Export</h3>
        <p className={css({ fontSize: 'sm', color: 'fg.muted' })}>
          Saves your project, Jira site, teams, categories, layout choices, theme and sidebar width to a JSON file. Your GitLab token and review progress are not included.
        </p>
        <div>
          <Button size="md" variant="solid" onClick={exportSettings}>
            <Download />
            Export settings
          </Button>
        </div>
      </section>

      <section className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
        <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold' })}>Import</h3>
        <p className={css({ fontSize: 'sm', color: 'fg.muted' })}>
          Replaces your current settings with the ones in the file. Share a file with your team so everyone starts with the same teams and categories.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file)
              void readFile(file)
            event.target.value = ''
          }}
        />
        <div>
          <Button size="md" onClick={() => fileInput.current?.click()}>
            <Upload />
            Choose a settings file
          </Button>
        </div>
        {pending && (
          <div className={css({ display: 'flex', flexDir: 'column', gap: '2', p: '3', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', fontSize: 'sm' })}>
            <span>
              {'This file contains '}
              {summary(pending)}
              .
            </span>
            {pending.warnings.map(warning => <span key={warning} className={css({ color: 'warning.fg', fontSize: 'xs' })}>{warning}</span>)}
            <div className={css({ display: 'flex', gap: '2' })}>
              <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
              <Button size="sm" variant="solid" onClick={applyImport}>Replace my settings</Button>
            </div>
          </div>
        )}
      </section>

      {message && <p className={css({ fontSize: 'sm' })} style={{ color: message.tone === 'error' ? 'var(--colors-danger-fg)' : 'var(--colors-success-fg)' }}>{message.text}</p>}
    </div>
  )
}
