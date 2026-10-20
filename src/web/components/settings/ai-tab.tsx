import type { AppSettings } from '../../lib/settings'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { DEFAULT_SIGNATURE, MAX_SIGNATURE_LENGTH } from '../../../shared/claude-review'
import { useChatAvailable } from '../../lib/chat'
import { Checkbox } from '../ui/checkbox'
import { Segmented } from '../ui/segmented'

const fieldLabel = css({ display: 'block', fontSize: 'xs', fontWeight: 'semibold', mb: '1.5' })
const fieldHint = css({ fontSize: 'xs', color: 'fg.subtle', mt: '1.5' })
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
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
})

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

function SignatureSetting({ settings, onChange }: AiTabProps) {
  const [draft, setDraft] = useState(settings.reviewSignatureText)
  useEffect(() => setDraft(settings.reviewSignatureText), [settings.reviewSignatureText])
  const commit = () => onChange({ reviewSignatureText: draft.trim() || DEFAULT_SIGNATURE })

  return (
    <div>
      <span className={fieldLabel}>Signature on AI review comments</span>
      <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '2', fontSize: 'sm' })}>
        <Checkbox checked={settings.reviewSignature} onCheckedChange={reviewSignature => onChange({ reviewSignature })} label="Add a signature to AI review comments" />
        <span className={css({ cursor: 'pointer', userSelect: 'none' })} onClick={() => onChange({ reviewSignature: !settings.reviewSignature })}>Add a signature to AI review comments</span>
      </span>
      <input
        aria-label="Signature text"
        className={cx(input, css({ mt: '2' }))}
        disabled={!settings.reviewSignature}
        maxLength={MAX_SIGNATURE_LENGTH}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter')
            commit()
        }}
      />
      <p className={fieldHint}>
        {settings.reviewSignature
          ? 'Added in small text at the end of every comment Claude drafts, when you post it. Edits to a draft never include it, so changing this applies to drafts too.'
          : 'AI review comments are posted without a signature, so they read like the rest of your review.'}
        {settings.reviewSignature && settings.reviewSignatureText !== DEFAULT_SIGNATURE && (
          <>
            {' '}
            <button type="button" onClick={() => onChange({ reviewSignatureText: DEFAULT_SIGNATURE })} className={css({ color: 'accent.fg', cursor: 'pointer', _hover: { textDecoration: 'underline' } })}>
              Use the default text
            </button>
          </>
        )}
      </p>
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
      <SignatureSetting settings={settings} onChange={onChange} />
      <div>
        <span className={fieldLabel}>Merge status and actions (experimental)</span>
        <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '2', fontSize: 'sm' })}>
          <Checkbox checked={settings.liveMergeStatus} onCheckedChange={liveMergeStatus => onChange({ liveMergeStatus })} label="Show the merge status in the Claude chat" />
          <span className={css({ cursor: 'pointer', userSelect: 'none' })} onClick={() => onChange({ liveMergeStatus: !settings.liveMergeStatus })}>Show the merge status in the Claude chat</span>
        </span>
        <p className={fieldHint}>
          {settings.liveMergeStatus
            ? 'The chat shows the merge request status and offers merge, rebase, commit and push, and conflict fixes. The start page offers Create MR. The status is checked every 5 seconds while something runs and every 30 seconds otherwise, which adds requests to your GitLab server.'
            : 'Off. Pull Review does not check the merge status in the background, and the merge, rebase, commit and push, conflict and Create MR actions are hidden.'}
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
