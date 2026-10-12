import type { AppTag } from '../../../shared/mr-title'
import { css, cx } from 'styled-system/css'
import { jiraUrl } from '../../../shared/mr-title'
import { appTagStyle } from '../../lib/mr-display'

export const hueChip = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  h: '5',
  px: '1.5',
  borderRadius: 'sm',
  fontSize: '2xs',
  fontWeight: 'semibold',
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  color: 'var(--hue-fg)',
  bg: 'var(--hue-bg)',
  _dark: { color: 'var(--hue-fg-dark)', bg: 'var(--hue-bg-dark)' },
})

interface AppTagBadgeProps {
  app: AppTag
  active?: boolean
  onClick?: (name: string) => void
}

export function AppTagBadge({ app, active, onClick }: AppTagBadgeProps) {
  const content = (
    <>
      {app.name}
      {app.qualifier && <span className={css({ fontWeight: 'medium', opacity: 0.7 })}>{app.qualifier}</span>}
    </>
  )
  if (!onClick)
    return <span className={hueChip} style={appTagStyle(app.name)}>{content}</span>
  return (
    <button
      type="button"
      onClick={() => onClick(app.name)}
      title={active ? `Remove ${app.name} filter` : `Show only ${app.name}`}
      className={cx(hueChip, css({ position: 'relative', zIndex: 1, cursor: 'pointer', outlineOffset: '1px' }))}
      style={{ ...appTagStyle(app.name), outline: active ? '1.5px solid var(--hue-solid)' : 'none' }}
    >
      {content}
    </button>
  )
}

export function JiraChip({ jiraKey, baseUrl }: { jiraKey: string, baseUrl: string }) {
  return (
    <a
      href={jiraUrl(baseUrl, jiraKey)}
      target="_blank"
      rel="noreferrer"
      title={`Open ${jiraKey} in Jira`}
      className={css({
        position: 'relative',
        zIndex: 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '1',
        h: '5',
        px: '1.5',
        borderRadius: 'sm',
        fontFamily: 'mono',
        fontSize: '2xs',
        fontWeight: 'semibold',
        whiteSpace: 'nowrap',
        color: 'blue.700',
        bg: 'blue.50',
        _dark: { color: 'blue.300', bg: 'rgba(59, 130, 246, 0.14)' },
        _hover: { textDecoration: 'underline' },
      })}
    >
      <svg viewBox="0 0 16 16" aria-hidden width="10" height="10" fill="currentColor">
        <path d="M15.3 7.4 8.6.7 8 0 2.9 5.1.7 7.4a.9.9 0 0 0 0 1.2l4.6 4.6L8 16l5.1-5.1.1-.1 2.1-2.2a.9.9 0 0 0 0-1.2ZM8 10.1 5.9 8 8 5.9 10.1 8 8 10.1Z" />
      </svg>
      {jiraKey}
    </a>
  )
}

export function DraftChip() {
  return (
    <span className={css({ display: 'inline-flex', alignItems: 'center', h: '5', px: '1.5', borderRadius: 'sm', fontSize: '2xs', fontWeight: 'semibold', color: 'fg.muted', borderWidth: '1px', borderColor: 'border.strong', borderStyle: 'dashed', whiteSpace: 'nowrap' })}>
      Draft
    </span>
  )
}
