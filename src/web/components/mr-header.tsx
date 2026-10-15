import type { DiffFile } from '../../shared/types'
import type { DiffLayout, ThemeMode } from '../lib/preferences'
import { ArrowLeft, Check, Columns2, ExternalLink, Layers, Moon, RefreshCw, Rows2, Settings, Sparkles, Sun, WrapText } from 'lucide-react'
import { Link } from 'react-router'
import { css } from 'styled-system/css'
import { badge } from 'styled-system/recipes'
import { useApprovalActions, useApprovals } from '../hooks/use-merge-request'
import { useProjectInfo } from '../hooks/use-project'
import { parseMrTitle } from '../../shared/mr-title'
import { timeAgo } from '../lib/format'
import { homePath } from '../lib/last-home'
import { openExternal } from '../lib/platform'
import { themeHasLightMode, useThemeName } from '../lib/preferences'
import { useSettings } from '../lib/settings'
import { BranchPills } from './branch-pills'
import { DiffStat } from './file-diff-card'
import { AppTagBadge, DraftChip, JiraChip } from './mr-list/title-parts'
import { useReview } from './review-context'
import { Avatar } from './ui/avatar'
import { Button, IconButton, WithTooltip } from './ui/button'
import { Segmented } from './ui/segmented'

const STATE_TONE = { opened: 'success', merged: 'accent', closed: 'danger', locked: 'neutral' } as const

interface MrHeaderProps {
  files: DiffFile[]
  layout: DiffLayout
  onLayoutChange: (layout: DiffLayout) => void
  wrap: boolean
  onWrapChange: (wrap: boolean) => void
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
  onRefresh: () => void
  refreshing: boolean
  onOpenSettings: () => void
  localStatus?: React.ReactNode
  chatOpen: boolean | null
  onChatOpenChange: (open: boolean) => void
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
      {data.approvedBy.length > 0 && (
        <WithTooltip label={`Approved by ${data.approvedBy.map(user => user.name).join(', ')}`}>
          <span className={css({ display: 'inline-flex', alignItems: 'center' })}>
            {data.approvedBy.slice(0, 4).map(user => (
              <span key={user.id} className={css({ ml: '-1', borderRadius: 'full', borderWidth: '2px', borderColor: 'bg.surface', _first: { ml: '0' } })}>
                <Avatar user={user} size={20} />
              </span>
            ))}
          </span>
        </WithTooltip>
      )}
      <WithTooltip label={error ? error.message : summary}>
        {data.userHasApproved
          ? (
              <Button size="md" onClick={() => unapprove.mutate()} disabled={busy}>
                Revoke approval
              </Button>
            )
          : (
              <Button size="md" variant="success" frame onClick={() => approve.mutate()} disabled={busy || !data.userCanApprove}>
                <Check />
                Approve
              </Button>
            )}
      </WithTooltip>
    </div>
  )
}

export function MrHeader({ files, layout, onLayoutChange, wrap, onWrapChange, theme, onThemeChange, onRefresh, refreshing, onOpenSettings, chatOpen, onChatOpenChange, localStatus }: MrHeaderProps) {
  const { mergeRequest } = useReview()
  const additions = files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0)
  const title = parseMrTitle(mergeRequest.title)
  const [settings] = useSettings()
  const [themeName] = useThemeName()
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
          <DiffStat additions={additions} deletions={deletions} />
        </div>
      </div>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2', flexShrink: 0 })}>
        <Segmented
          label="Diff layout"
          value={layout}
          onChange={onLayoutChange}
          items={[
            { value: 'split', label: <Columns2 />, title: 'Split view' },
            { value: 'unified', label: <Rows2 />, title: 'Unified view' },
          ]}
        />
        <IconButton label={wrap ? 'Disable line wrap' : 'Wrap long lines'} onClick={() => onWrapChange(!wrap)} className={wrap ? css({ color: 'accent.fg' }) : undefined}>
          <WrapText />
        </IconButton>
        {themeHasLightMode(themeName) && (
          <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </IconButton>
        )}
        <IconButton label="Reload from GitLab" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? css({ animation: 'spin' }) : undefined} />
        </IconButton>
        <IconButton label="Open in GitLab" onClick={() => openExternal(mergeRequest.webUrl)}>
          <ExternalLink />
        </IconButton>
        {chatOpen !== null && (
          <IconButton label={chatOpen ? 'Close Claude chat' : 'Ask Claude about this merge request'} onClick={() => onChatOpenChange(!chatOpen)} className={chatOpen ? css({ color: 'accent.fg' }) : undefined}>
            <Sparkles />
          </IconButton>
        )}
        <IconButton label="Settings" onClick={onOpenSettings}>
          <Settings />
        </IconButton>
        <ApproveButton />
      </div>
    </header>
  )
}
