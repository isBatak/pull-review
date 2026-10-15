import type { AppSettings } from '../../lib/settings'
import { useQuery } from '@tanstack/react-query'
import { css } from 'styled-system/css'
import { AUTO_EDITOR, EDITORS, editorById } from '../../../shared/editors'
import { api } from '../../lib/api'
import { Select } from '../ui/select'

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
      <Select
        id="settings-editor"
        label="Code editor"
        value={settings.editor}
        onChange={editor => onChange({ editor })}
        options={[
          { value: AUTO_EDITOR, label: `Find automatically${detected ? ` (now ${detected.label})` : ''}` },
          ...sorted.map(editor => ({ value: editor.id, label: `${editor.label}${status.data && !installed.has(editor.id) ? ' (not found)' : ''}` })),
        ]}
      />
      <p className={fieldHint}>
        Used to open a definition or reference from a review in your local repository. Find automatically picks the editor that is running, then the first one installed.
      </p>
    </div>
  )
}
