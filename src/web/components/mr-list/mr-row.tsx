import type { StackInfo } from '../../../shared/stacks'
import type { MrSummary } from '../../../shared/types'
import type { StatusTone } from '../../lib/mr-display'
import { ExternalLink, GitBranch, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, Layers, MessageSquare, TriangleAlert } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router'
import { css, cx } from 'styled-system/css'
import { mrAppPath, parseMrRef } from '../../../shared/mr-ref'
import { parseMrTitle } from '../../../shared/mr-title'
import { describeStackIssue, isWarning } from '../../../shared/stacks'
import { timeAgo } from '../../lib/format'
import { mergeStatusOf } from '../../lib/mr-display'
import { Avatar } from '../ui/avatar'
import { WithTooltip } from '../ui/button'
import { AppTagBadge, DraftChip, JiraChip } from './title-parts'

const TONE_COLORS: Record<StatusTone, { fg: string, bg: string }> = {
  success: { fg: 'success.fg', bg: 'success.subtle' },
  warning: { fg: 'warning.fg', bg: 'warning.subtle' },
  danger: { fg: 'danger.fg', bg: 'danger.subtle' },
  accent: { fg: 'accent.fg', bg: 'accent.subtle' },
  neutral: { fg: 'fg.muted', bg: 'bg.muted' },
}

function StateIcon({ mr }: { mr: MrSummary }) {
  const iconClass = css({ w: '4', h: '4', flexShrink: 0, mt: '0.5' })
  if (mr.state === 'merged')
    return <GitMerge aria-label="Merged" className={cx(iconClass, css({ color: 'accent.fg' }))} />
  if (mr.state === 'closed')
    return <GitPullRequestClosed aria-label="Closed" className={cx(iconClass, css({ color: 'danger.fg' }))} />
  if (mr.draft)
    return <GitPullRequestDraft aria-label="Draft" className={cx(iconClass, css({ color: 'fg.subtle' }))} />
  return <GitPullRequest aria-label="Open" className={cx(iconClass, css({ color: 'success.fg' }))} />
}

function stateTime(mr: MrSummary) {
  if (mr.state === 'merged' && mr.mergedAt)
    return `merged ${timeAgo(mr.mergedAt)}`
  if (mr.state === 'closed' && mr.closedAt)
    return `closed ${timeAgo(mr.closedAt)}`
  return `updated ${timeAgo(mr.updatedAt)}`
}

interface MrRowProps {
  mr: MrSummary
  stack: StackInfo | undefined
  defaultBranch: string
  jiraBaseUrl: string
  depth?: number
  isLastInStack?: boolean
  activeTags: Set<string>
  onToggleTag: (tag: string) => void
}

function MrRowImpl({ mr, stack, defaultBranch, jiraBaseUrl, depth = 0, isLastInStack, activeTags, onToggleTag }: MrRowProps) {
  const parsed = parseMrTitle(mr.title)
  const status = mergeStatusOf(mr)
  const warnings = stack?.issues.filter(isWarning) ?? []
  const notes = stack?.issues.filter(issue => !isWarning(issue)) ?? []
  const level = stack?.depth ?? parsed.stackedLevel ?? 0
  const ref = parseMrRef(mr.webUrl)
  const appPath = ref ? mrAppPath(ref) : mr.webUrl

  return (
    <div
      className={cx('group', css({
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '3',
        py: '3',
        pr: '4',
        transition: 'background 120ms',
        _hover: { bg: 'bg.subtle' },
      }))}
      style={{ paddingLeft: 16 + depth * 28 }}
    >
      {depth > 0 && (
        <span
          aria-hidden
          className={css({
            position: 'absolute',
            top: '0',
            w: '3.5',
            borderLeftWidth: '1.5px',
            borderBottomWidth: '1.5px',
            borderColor: 'border.strong',
            borderBottomLeftRadius: 'md',
            h: '5',
          })}
          style={{ left: depth * 28 - 6 }}
        />
      )}
      {depth > 0 && !isLastInStack && (
        <span aria-hidden className={css({ position: 'absolute', top: '0', bottom: '0', borderLeftWidth: '1.5px', borderColor: 'border.strong' })} style={{ left: depth * 28 - 6 }} />
      )}
      <StateIcon mr={mr} />
      <div className={css({ flex: '1', minW: '0', display: 'flex', flexDir: 'column', gap: '1.5' })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', flexWrap: 'wrap', minW: '0' })}>
          <Link
            to={appPath}
            className={css({
              fontSize: 'sm',
              fontWeight: 'semibold',
              color: 'fg.default',
              lineHeight: '1.35',
              _hover: { color: 'accent.fg' },
              _after: { content: '""', position: 'absolute', inset: '0', zIndex: 0 },
            })}
          >
            {parsed.text || mr.title}
          </Link>
          {(mr.draft || parsed.draft) && mr.state === 'opened' && <DraftChip />}
          {parsed.apps.map(app => (
            <AppTagBadge key={`${app.name}-${app.qualifier ?? ''}`} app={app} active={activeTags.has(app.name)} onClick={onToggleTag} />
          ))}
        </div>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap', fontSize: 'xs', color: 'fg.muted', '& svg': { w: '3.5', h: '3.5' } })}>
          <span className={css({ fontFamily: 'mono', color: 'fg.subtle' })}>
            !
            {mr.iid}
          </span>
          <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5' })}>
            <Avatar user={mr.author} size={16} />
            {mr.author.name}
          </span>
          <span className={css({ color: 'fg.subtle' })}>{stateTime(mr)}</span>
          {parsed.jiraKeys.map(key => <JiraChip key={key} jiraKey={key} baseUrl={jiraBaseUrl} />)}
          {level > 0 && (
            <WithTooltip label={[...warnings, ...notes].map(describeStackIssue).join(' ') || `Stacked on ${mr.targetBranch}`}>
              <span
                className={css({
                  position: 'relative',
                  zIndex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '1',
                  h: '5',
                  px: '1.5',
                  borderRadius: 'sm',
                  fontSize: '2xs',
                  fontWeight: 'semibold',
                  color: warnings.length ? 'warning.fg' : 'fg.muted',
                  bg: warnings.length ? 'warning.subtle' : 'bg.muted',
                })}
              >
                {warnings.length ? <TriangleAlert /> : <Layers />}
                Stacked
                {' '}
                {level}
                {parsed.stackedLevel !== null && parsed.stackedLevel !== level && (
                  <span className={css({ fontWeight: 'medium', opacity: 0.8 })}>
                    {'· title says '}
                    {parsed.stackedLevel}
                  </span>
                )}
              </span>
            </WithTooltip>
          )}
          {level === 0 && warnings.length > 0 && (
            <WithTooltip label={warnings.map(describeStackIssue).join(' ')}>
              <span className={css({ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: '1', h: '5', px: '1.5', borderRadius: 'sm', fontSize: '2xs', fontWeight: 'semibold', color: 'warning.fg', bg: 'warning.subtle' })}>
                <TriangleAlert />
                Check stacked tag
              </span>
            </WithTooltip>
          )}
          {mr.targetBranch !== defaultBranch && (
            <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', fontFamily: 'mono', fontSize: '2xs', color: 'fg.subtle', minW: '0' })} title={`Targets ${mr.targetBranch}`}>
              <GitBranch />
              <span className={css({ truncate: true, maxW: '64' })}>{mr.targetBranch}</span>
            </span>
          )}
        </div>
      </div>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '3', flexShrink: 0, pt: '0.5' })}>
        {status && (
          <span className={css({ display: { base: 'none', lg: 'inline-flex' }, alignItems: 'center', h: '5', px: '2', borderRadius: 'full', fontSize: '2xs', fontWeight: 'semibold', whiteSpace: 'nowrap' })} style={toneStyle(status.tone)}>
            {status.label}
          </span>
        )}
        {mr.userNotesCount > 0 && (
          <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', fontSize: 'xs', color: 'fg.muted', fontVariantNumeric: 'tabular-nums', '& svg': { w: '3.5', h: '3.5' } })} title={`${mr.userNotesCount} comments`}>
            <MessageSquare />
            {mr.userNotesCount}
          </span>
        )}
        {mr.reviewers.length > 0 && (
          <WithTooltip label={`Reviewers: ${mr.reviewers.map(reviewer => reviewer.name).join(', ')}`}>
            <span className={css({ position: 'relative', zIndex: 1, display: 'inline-flex' })}>
              {mr.reviewers.slice(0, 3).map(reviewer => (
                <span key={reviewer.id} className={css({ ml: '-1.5', borderRadius: 'full', borderWidth: '2px', borderColor: 'bg.surface', _first: { ml: '0' } })}>
                  <Avatar user={reviewer} size={20} />
                </span>
              ))}
              {mr.reviewers.length > 3 && (
                <span className={css({ ml: '-1.5', w: '6', h: '6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'full', borderWidth: '2px', borderColor: 'bg.surface', bg: 'bg.muted', fontSize: '2xs', color: 'fg.muted' })}>
                  +
                  {mr.reviewers.length - 3}
                </span>
              )}
            </span>
          </WithTooltip>
        )}
        <a
          href={mr.webUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open in GitLab"
          title="Open in GitLab"
          className={css({ position: 'relative', zIndex: 1, color: 'fg.subtle', opacity: 0, _groupHover: { opacity: 1 }, _focusVisible: { opacity: 1 }, _hover: { color: 'fg.default' }, '& svg': { w: '3.5', h: '3.5' } })}
        >
          <ExternalLink />
        </a>
      </div>
    </div>
  )
}

function toneStyle(tone: StatusTone): React.CSSProperties {
  const colors = TONE_COLORS[tone]
  return { color: `var(--colors-${colors.fg.replace('.', '-')})`, background: `var(--colors-${colors.bg.replace('.', '-')})` }
}

export const MrRow = memo(MrRowImpl)
