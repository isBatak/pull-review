import type { AppSettings } from '../../lib/settings'
import { useQuery } from '@tanstack/react-query'
import { css } from 'styled-system/css'
import { AUTO_EDITOR, EDITORS, editorById } from '../../../shared/editors'
import { api } from '../../lib/api'

const select = css({
  w: 'full',
  maxW: 'sm',
  h: '9',
  px: '2.5',
  fontSize: 'sm',
  bg: 'bg.surface',
  color: 'fg.default',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  outline: 'none',
  cursor: 'pointer',
  _focus: { borderColor: 'accent.default' },
})

const fieldLabel = css({ display: 'block', fontSize: 'xs', fontWeight: 'semibold', mb: '1.5' })
const fieldHint = css({ fontSize: 'xs', color: 'fg.subtle', mt: '1.5' })

export function useEditorStatus() {
  return useQuery({ queryKey: ['editor-status'], queryFn: api.editorStatus, staleTime: 30_000 })
}

export function EditorSetting({ settings, onChange }: { settings: AppSettings, onChange: (patch: Partial<AppSettings>) => void }) {
  const status = useEditorStatus()
  const detected = status.data?.detected ? editorById(status.data.detected) : null
  const installed = new Set(status.data?.installed ?? [])
  const sorted = [...EDITORS].sort((a, b) => Number(installed.has(b.id)) - Number(installed.has(a.id)))

  return (
    <div>
      <label className={fieldLabel} htmlFor="settings-editor">Code editor</label>
      <select id="settings-editor" className={select} value={settings.editor} onChange={event => onChange({ editor: event.target.value })}>
        <option value={AUTO_EDITOR}>Find automatically{detected ? ` (now ${detected.label})` : ''}</option>
        {sorted.map(editor => (
          <option key={editor.id} value={editor.id}>
            {editor.label}
            {status.data && !installed.has(editor.id) ? ' (not found)' : ''}
          </option>
        ))}
      </select>
      <p className={fieldHint}>
        Used to open a definition or reference from a review in your local repository. Find automatically picks the editor that is running, then the first one installed.
      </p>
    </div>
  )
}
