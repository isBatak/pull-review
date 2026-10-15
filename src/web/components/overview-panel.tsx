import type { Discussion } from '../../shared/types'
import { FileCode2 } from 'lucide-react'
import { css, cx } from 'styled-system/css'
import { card } from 'styled-system/recipes'
import { CommentComposer } from './comment-composer'
import { useReview, useReviewActions } from './review-context'
import { ThreadCard } from './thread-card'
import { Avatar } from './ui/avatar'
import { Markdown } from './ui/markdown'

const sectionTitle = css({ fontSize: 'xs', fontWeight: 'semibold', color: 'fg.muted', textTransform: 'uppercase', letterSpacing: 'wider', mb: '2' })

interface OverviewPanelProps {
  general: Discussion[]
  detached: Discussion[]
}

export function OverviewPanel({ general, detached }: OverviewPanelProps) {
  const { mergeRequest, projectUrl } = useReview()
  const { create } = useReviewActions()

  return (
    <div id="overview" className={css({ display: 'flex', flexDir: 'column', gap: '6', scrollMarginTop: '2' })}>
      <div className={cx(card(), css({ p: '4' }))}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2', mb: '3', fontSize: 'xs', color: 'fg.muted' })}>
          <Avatar user={mergeRequest.author} size={20} />
          <span className={css({ fontWeight: 'semibold', color: 'fg.default' })}>{mergeRequest.author.name}</span>
          opened this merge request
        </div>
        {mergeRequest.description.trim()
          ? <Markdown baseUrl={projectUrl}>{mergeRequest.description}</Markdown>
          : <span className={css({ color: 'fg.subtle', fontSize: 'sm' })}>No description provided.</span>}
      </div>

      {general.length > 0 && (
        <div>
          <h2 className={sectionTitle}>Conversation</h2>
          <div className={css({ display: 'flex', flexDir: 'column', gap: '3' })}>
            {general.map(discussion => <ThreadCard key={discussion.id} discussion={discussion} />)}
          </div>
        </div>
      )}

      {detached.length > 0 && (
        <div>
          <h2 className={sectionTitle}>Outdated and unmatched threads</h2>
          <div className={css({ display: 'flex', flexDir: 'column', gap: '3' })}>
            {detached.map(discussion => (
              <ThreadCard
                key={discussion.id}
                discussion={discussion}
                header={(
                  <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', fontFamily: 'mono', minW: '0', truncate: true })}>
                    <FileCode2 />
                    {discussion.position?.newPath}
                    {discussion.position && `:${discussion.position.line}`}
                  </span>
                )}
              />
            ))}
          </div>
        </div>
      )}

      <div className={cx(card(), css({ p: '3' }))}>
        <h2 className={sectionTitle}>Add a comment</h2>
        <CommentComposer
          submitLabel="Comment"
          baseUrl={projectUrl}
          busy={create.isPending}
          error={create.error?.message}
          onSubmit={body => create.mutateAsync({ body })}
        />
      </div>
    </div>
  )
}
