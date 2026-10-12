import type { AppSettings } from '../../lib/settings'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { css } from 'styled-system/css'
import { useChatAvailable } from '../../lib/chat'
import { Segmented } from '../ui/segmented'

const fieldLabel = css({ display: 'block', fontSize: 'xs', fontWeight: 'semibold', mb: '1.5' })
const fieldHint = css({ fontSize: 'xs', color: 'fg.subtle', mt: '1.5' })

interface AiTabProps {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}

function ClaudeStatus() {
  const available = useChatAvailable()
  return (
    <div className={css({ display: 'flex', alignItems: 'flex-start', gap: '2', p: '3', fontSize: 'sm', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', '& svg': { w: '4', h: '4', mt: '0.5', flexShrink: 0 } })}>
      {available
        ? <CheckCircle2 className={css({ color: 'success.fg' })} />
        : <CircleAlert className={css({ color: 'warning.fg' })} />}
      <div>
        <div className={css({ fontWeight: 'medium' })}>{available ? 'Claude Code is installed' : 'Claude Code is not installed'}</div>
        <div className={css({ color: 'fg.muted', fontSize: 'xs', mt: '0.5' })}>
          {available
            ? 'The Claude chat on a review uses your Claude Code login and subscription. No API key is needed.'
            : 'Install Claude Code and sign in with the claude command, then restart Pull Review to use the Claude chat.'}
        </div>
      </div>
    </div>
  )
}

export function AiTab({ settings, onChange }: AiTabProps) {
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '6' })}>
      <ClaudeStatus />
      <div>
        <span className={fieldLabel}>Selected lines in the Claude chat</span>
        <Segmented
          label="Selected lines in the Claude chat"
          value={settings.chatSelection}
          onChange={chatSelection => onChange({ chatSelection })}
          items={[
            { value: 'automatic', label: 'Add automatically' },
            { value: 'manual', label: 'Add with a button' },
          ]}
        />
        <p className={fieldHint}>
          {settings.chatSelection === 'automatic'
            ? 'While the chat is open, lines you select in a diff are added to your question right away.'
            : 'Lines you select are added only when you click Ask Claude in the file header.'}
        </p>
      </div>
      <div>
        <span className={fieldLabel}>Full files</span>
        <p className={css({ fontSize: 'sm', color: 'fg.muted' })}>
          Claude sees only the diff unless the project has a local repository. Add one in General, under Local repositories, or from the chat panel. Pull Review then makes a temporary git worktree at the merge request's commit so Claude can read full files.
        </p>
      </div>
    </div>
  )
}
