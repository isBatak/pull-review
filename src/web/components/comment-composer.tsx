import { Tabs } from '@ark-ui/react/tabs'
import { useState } from 'react'
import { css } from 'styled-system/css'
import { Button } from './ui/button'
import { Markdown } from './ui/markdown'

const tabTrigger = css({
  px: '2',
  h: '7',
  fontSize: 'xs',
  fontWeight: 'medium',
  color: 'fg.muted',
  cursor: 'pointer',
  borderBottomWidth: '2px',
  borderColor: 'transparent',
  _selected: { color: 'fg.default', borderColor: 'accent.default' },
})

const textarea = css({
  display: 'block',
  w: 'full',
  minH: '20',
  p: '2.5',
  fontSize: 'sm',
  fontFamily: 'body',
  bg: 'bg.surface',
  color: 'fg.default',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  resize: 'vertical',
  outline: 'none',
  _focus: { borderColor: 'accent.default', boxShadow: '0 0 0 1px token(colors.accent.default)' },
  _placeholder: { color: 'fg.subtle' },
})

interface CommentComposerProps {
  placeholder?: string
  submitLabel: string
  initialValue?: string
  busy?: boolean
  error?: string | null
  autoFocus?: boolean
  baseUrl?: string
  onSubmit: (body: string) => Promise<unknown> | void
  onCancel?: () => void
}

export function CommentComposer({
  placeholder = 'Leave a comment. Markdown is supported.',
  submitLabel,
  initialValue = '',
  busy,
  error,
  autoFocus,
  baseUrl,
  onSubmit,
  onCancel,
}: CommentComposerProps) {
  const [value, setValue] = useState(initialValue)
  const [tab, setTab] = useState('write')
  const canSubmit = value.trim().length > 0 && !busy

  async function submit() {
    if (!canSubmit)
      return
    try {
      await onSubmit(value)
      setValue('')
      setTab('write')
    }
    catch {}
  }

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
      <Tabs.Root value={tab} onValueChange={details => setTab(details.value)}>
        <Tabs.List className={css({ display: 'flex', gap: '1', mb: '2', borderBottomWidth: '1px', borderColor: 'border.subtle' })}>
          <Tabs.Trigger value="write" className={tabTrigger}>Write</Tabs.Trigger>
          <Tabs.Trigger value="preview" className={tabTrigger}>Preview</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="write">
          <textarea
            className={textarea}
            value={value}
            placeholder={placeholder}
            autoFocus={autoFocus}
            disabled={busy}
            onChange={event => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submit()
              }
              if (event.key === 'Escape' && onCancel) {
                event.preventDefault()
                onCancel()
              }
            }}
          />
        </Tabs.Content>
        <Tabs.Content value="preview" className={css({ minH: '20', p: '2.5', borderWidth: '1px', borderColor: 'border.subtle', borderRadius: 'md' })}>
          {value.trim() ? <Markdown baseUrl={baseUrl}>{value}</Markdown> : <span className={css({ color: 'fg.subtle' })}>Nothing to preview</span>}
        </Tabs.Content>
      </Tabs.Root>
      {error && <div className={css({ color: 'danger.fg', fontSize: 'xs' })}>{error}</div>}
      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2' })}>
        <span className={css({ mr: 'auto', fontSize: '2xs', color: 'fg.subtle' })}>⌘ Enter to submit</span>
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>}
        <Button variant="solid" onClick={() => void submit()} disabled={!canSubmit}>
          {busy ? 'Posting…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}
