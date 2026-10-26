import type { FileGroup } from '../../shared/grouping'
import type { DiffFile, User } from '../../shared/types'
import { ArrowLeft, Check, Layers } from 'lucide-react'
import { Link } from 'react-router'
import { css, cx } from 'styled-system/css'
import { badge } from 'styled-system/recipes'
import { useApprovalActions, useApprovals } from '../hooks/use-merge-request'
import { useProjectInfo } from '../hooks/use-project'
import { diffStatsByGroup } from '../../shared/grouping'
import { parseMrTitle } from '../../shared/mr-title'
import { timeAgo } from '../lib/format'
import { homePath } from '../lib/last-home'
import { useSettings } from '../lib/settings'
import { BranchPills } from './branch-pills'
import { DiffStat } from './file-diff-card'
import { AppTagBadge, DraftChip, JiraChip } from './mr-list/title-parts'
import { useReview } from './review-context'
import { Avatar } from './ui/avatar'
import { Button, WithTooltip } from './ui/button'

const STATE_TONE = { opened: 'success', merged: 'accent', closed: 'danger', locked: 'neutral' } as const

interface MrHeaderProps {
  files: DiffFile[]
  groups: FileGroup[]
  localStatus?: React.ReactNode
}

const statCell = css({ fontFamily: 'mono', textAlign: 'right', fontVariantNumeric: 'tabular-nums' })

function DiffStatBreakdown({ groups }: { groups: FileGroup[] }) {
  const stats = diffStatsByGroup(groups)
  const row = (label: string, additions: number, deletions: number) => (
    <>
      <span>{label}</span>
      <span className={cx(statCell, css({ color: 'success.fg' }))}>{`+${additions}`}</span>
      <span className={cx(statCell, css({ color: 'danger.fg' }))}>{`−${deletions}`}</span>
    </>
  )
  const table = (
    <span className={css({ display: 'grid', gridTemplateColumns: 'auto auto auto', columnGap: '4', rowGap: '1', py: '1', fontSize: 'sm' })}>
      {stats.groups.map(group => <span key={group.key} className={css({ display: 'contents' })}>{row(group.label, group.additions, group.deletions)}</span>)}
      {stats.groups.length > 1 && (
        <>
          <span aria-hidden className={css({ gridColumn: '1 / -1', my: '0.5', borderTopWidth: '1px', borderColor: 'tooltip.border' })} />
          {row('Total', stats.total.additions, stats.total.deletions)}
        </>
      )}
    </span>
  )
  return (
    <WithTooltip label={table} contentStyle={{ maxW: 'none', px: '3', py: '2' }}>
      <span tabIndex={0} aria-label={`${stats.total.additions} lines added and ${stats.total.deletions} removed. Focus to see them by group.`} className={css({ display: 'inline-flex', cursor: 'default', textDecoration: 'underline dotted', textDecorationColor: 'fg.subtle', textUnderlineOffset: '4px', outline: 'none', _focusVisible: { boxShadow: '0 0 0 2px var(--colors-accent-default)', borderRadius: 'sm' } })}>
        <DiffStat additions={stats.total.additions} deletions={stats.total.deletions} />
      </span>
    </WithTooltip>
  )
}

const MAX_REVIEWER_AVATARS = 5

function ReviewerStack({ reviewers, approvedBy }: { reviewers: User[], approvedBy: User[] }) {
  const approvedIds = new Set(approvedBy.map(user => user.id))
  const reviewerIds = new Set(reviewers.map(user => user.id))
  const people = [...reviewers, ...approvedBy.filter(user => !reviewerIds.has(user.id))]
  if (!people.length)
    return null

  const shown = people.slice(0, MAX_REVIEWER_AVATARS)
  const hidden = people.length - shown.length
  const approvedCount = people.filter(user => approvedIds.has(user.id)).length
  const list = (
    <span className={css({ display: 'flex', flexDir: 'column', gap: '1.5', py: '1', fontSize: 'sm' })}>
      {people.map(user => (
        <span key={user.id} className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
          <Avatar user={user} size={18} />
          <span className={css({ flex: '1' })}>{user.name}</span>
          {approvedIds.has(user.id)
            ? <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', color: 'success.fg', '& svg': { w: '3.5', h: '3.5' } })}><Check />Approved</span>
            : <span className={css({ color: 'fg.muted' })}>Not yet</span>}
        </span>
      ))}
    </span>
  )

  return (
    <WithTooltip label={list} contentStyle={{ maxW: 'none', px: '3', py: '2' }}>
      <span
        tabIndex={0}
        aria-label={`${people.length} reviewers, ${approvedCount} approved. Focus to see who.`}
        className={css({ display: 'inline-flex', alignItems: 'center', cursor: 'default', outline: 'none', borderRadius: 'full', _focusVisible: { boxShadow: '0 0 0 2px var(--colors-accent-default)' } })}
      >
        {shown.map((user, index) => {
          const approved = approvedIds.has(user.id)
          return (
            <span
              key={user.id}
              style={{ zIndex: shown.length - index }}
              className={css({ position: 'relative', display: 'inline-flex', ml: '-1', borderRadius: 'full', borderWidth: '2px', borderColor: 'bg.surface', _first: { ml: '0' } })}
            >
              <span className={css({ display: 'inline-flex', borderRadius: 'full', boxShadow: approved ? '0 0 0 2px var(--colors-success-solid)' : 'none', opacity: approved ? 1 : 0.7 })}>
                <Avatar user={user} size={22} />
              </span>
              {approved && (
                <span aria-hidden className={css({ position: 'absolute', right: '-1', bottom: '-1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', w: '3', h: '3', borderRadius: 'full', bg: 'success.solid', color: 'white', boxShadow: '0 0 0 1.5px var(--colors-bg-surface)', '& svg': { w: '2', h: '2', strokeWidth: '4' } })}>
                  <Check />
                </span>
              )}
            </span>
          )
        })}
        {hidden > 0 && (
          <span className={css({ ml: '1', fontSize: 'xs', color: 'fg.muted', fontVariantNumeric: 'tabular-nums' })}>{`+${hidden}`}</span>
        )}
      </span>
    </WithTooltip>
  )
}

function ApproveButton() {
  const { mergeRequest } = useReview()
  const approvals = useApprovals(mergeRequest.ref)
  const { approve, unapprove } = useApprovalActions(mergeRequest.ref)
  const data = approvals.data
  if (!data)
    return null

  const busy = approve.isPending || unapprove.isPending
  const error = approve.error ?? unapprove.error
  const summary = data.approvalsRequired
    ? `${data.approvedBy.length} of ${data.approvalsRequired} approvals`
    : `${data.approvedBy.length} approvals`

  return (
    <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
      <ReviewerStack reviewers={mergeRequest.reviewers} approvedBy={data.approvedBy} />
      <WithTooltip label={error ? error.message : summary}>
        {data.userHasApproved
          ? (
              <Button size="md" onClick={() => unapprove.mutate()} disabled={busy}>
                Revoke approval
              </Button>
            )
          : (
              <Button size="md" variant="success" onClick={() => approve.mutate()} disabled={busy || !data.userCanApprove}>
                <Check />
                Approve
              </Button>
            )}
      </WithTooltip>
    </div>
  )
}

export function MrHeader({ files, groups, localStatus }: MrHeaderProps) {
  const { mergeRequest } = useReview()
  const title = parseMrTitle(mergeRequest.title)
  const [settings] = useSettings()
  const jiraBaseUrl = settings.jiraBaseUrl
  const projectInfo = useProjectInfo({ host: mergeRequest.ref.host, project: mergeRequest.ref.project })
  const defaultBranch = projectInfo.data?.defaultBranch

  return (
    <header className={css({ display: 'flex', alignItems: 'center', gap: '4', px: '4', py: '2.5', borderBottomWidth: '1px', borderColor: 'border.default', bg: 'bg.surface' })}>
      <WithTooltip label="Back to merge requests">
        <Link
          to={homePath()}
          aria-label="Back to merge requests"
          className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, w: '8', h: '8', borderRadius: 'md', color: 'fg.muted', _hover: { bg: 'bg.muted', color: 'fg.default' }, _focusVisible: { outline: '2px solid', outlineColor: 'accent.default' }, '& svg': { w: '4.5', h: '4.5' } })}
        >
          <ArrowLeft />
        </Link>
      </WithTooltip>
      <div className={css({ minW: '0', flex: '1', display: 'flex', flexDir: 'column', gap: '0.5' })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2', minW: '0' })}>
          <span className={badge({ tone: STATE_TONE[mergeRequest.state] })}>{mergeRequest.state}</span>
          {(mergeRequest.draft || title.draft) && <DraftChip />}
          <h1 className={css({ fontSize: 'md', fontWeight: 'semibold', truncate: true })} title={mergeRequest.title}>
            {title.text || mergeRequest.title}
          </h1>
          <span className={css({ color: 'fg.subtle', fontSize: 'md', flexShrink: 0 })}>
            !
            {mergeRequest.ref.iid}
          </span>
          {title.jiraKeys.map(key => <JiraChip key={key} jiraKey={key} baseUrl={jiraBaseUrl} />)}
          {(title.stackedLevel !== null || (defaultBranch !== undefined && mergeRequest.targetBranch !== defaultBranch)) && (
            <WithTooltip label={`Targets ${mergeRequest.targetBranch}${title.stackedLevel !== null ? `. The title marks it as stacked level ${title.stackedLevel}.` : '.'}`}>
              <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', h: '5', px: '1.5', flexShrink: 0, borderRadius: 'sm', fontSize: '2xs', fontWeight: 'semibold', color: 'fg.muted', bg: 'bg.muted', '& svg': { w: '3', h: '3' } })}>
                <Layers />
                {title.stackedLevel !== null ? `Stacked ${title.stackedLevel}` : 'Stacked'}
              </span>
            </WithTooltip>
          )}
        </div>
        {title.apps.length > 0 && (
          <div className={css({ display: 'flex', alignItems: 'center', gap: '1', minW: '0', overflow: 'hidden', maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)' })}>
            {title.apps.map(app => <AppTagBadge key={`${app.name}-${app.qualifier ?? ''}`} app={app} />)}
          </div>
        )}
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'xs', color: 'fg.muted', minW: '0', '& svg': { w: '3', h: '3' } })}>
          <Avatar user={mergeRequest.author} size={16} />
          <span>{mergeRequest.author.name}</span>
          <span className={css({ color: 'fg.subtle' })}>
            {'updated '}
            {timeAgo(mergeRequest.updatedAt)}
          </span>
          <BranchPills source={mergeRequest.sourceBranch} target={mergeRequest.targetBranch} />
          {localStatus}
          <span>
            {files.length}
            {' files'}
          </span>
          <DiffStatBreakdown groups={groups} />
        </div>
      </div>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2', flexShrink: 0 })}>
        <ApproveButton />
      </div>
    </header>
  )
}
