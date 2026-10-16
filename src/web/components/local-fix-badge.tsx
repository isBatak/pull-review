import type { Discussion } from '../../shared/types'
import { CheckCheck, GitCommitHorizontal } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { css } from 'styled-system/css'
import { fixFor, hasLocalChanges } from '../../shared/local-changes'
import { useLocalFixes } from '../lib/local-fixes'
import { useLocalChanges, useLocalRepo } from '../lib/local-repos'
import { useReview } from './review-context'
import { Button } from './ui/button'

function useLocalState() {
  const { mergeRequest } = useReview()
  const localRepo = useLocalRepo(mergeRequest.ref)
  const changes = useLocalChanges(mergeRequest.ref, localRepo.path, mergeRequest.diffRefs.headSha, mergeRequest.sourceBranch)
  return { ranges: changes.data?.changedSinceHead, ...useLocalFixes(mergeRequest.ref) }
}

const linkButton = css({ flexShrink: 0, color: 'accent.fg', cursor: 'pointer', _hover: { textDecoration: 'underline' }, _disabled: { opacity: 0.5, cursor: 'not-allowed' } })

interface LocalFixBadgeProps {
  discussionId?: string
  findingId?: string
}

export function LocalFixBadge({ discussionId, findingId }: LocalFixBadgeProps) {
  const { ranges, fixes, removeFix, busy } = useLocalState()
  const [, setParams] = useSearchParams()
  const fix = fixFor(fixes, { discussionId, findingId })
  if (!fix || !hasLocalChanges(ranges, fix.paths))
    return null

  return (
    <div
      role="status"
      className={css({
        display: 'flex',
        alignItems: 'center',
        gap: '1.5',
        px: '3',
        py: '1.5',
        fontSize: 'xs',
        color: 'success.fg',
        bg: 'success.subtle',
        borderBottomWidth: '1px',
        borderColor: 'border.subtle',
        '& svg': { w: '3.5', h: '3.5', flexShrink: 0 },
      })}
    >
      <GitCommitHorizontal />
      <span className={css({ flex: '1', minW: '0' })}>
        <strong className={css({ fontWeight: 'semibold' })}>Fixed locally.</strong>
        {' '}
        {fix.manual ? 'You marked this comment as fixed, and the change is not pushed yet.' : 'You applied a fix for this comment, and it is not pushed yet.'}
      </span>
      <button
        type="button"
        onClick={() => setParams((current) => {
          const next = new URLSearchParams(current)
          next.set('tab', 'local')
          return next
        }, { replace: true })}
        className={linkButton}
      >
        View local changes
      </button>
      <button type="button" disabled={busy} onClick={() => void removeFix({ discussionId, findingId })} className={linkButton}>
        Unmark
      </button>
    </div>
  )
}

export function MarkFixedButton({ discussion }: { discussion: Discussion }) {
  const { ranges, fixes, addFix, busy } = useLocalState()
  const path = discussion.position?.newPath
  if (!path || discussion.resolved || fixFor(fixes, { discussionId: discussion.id }) || !hasLocalChanges(ranges, [path]))
    return null
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={busy}
      title="Mark this comment as fixed by your local changes. It shows until you push or discard them."
      onClick={() => addFix({ discussionIds: [discussion.id], findingIds: [], paths: [path], manual: true })}
    >
      <CheckCheck />
      Mark as fixed locally
    </Button>
  )
}
