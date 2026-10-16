import type { DiffFile, DiffSide } from './types'
import type { SuggestionDraft } from './suggestions'
import { createLineMap } from './line-map'

export const COMMENT_TOOL_SERVER = 'pull-review'
export const COMMENT_TOOL_NAME = 'add_review_comment'
export const COMMENT_TOOL = `mcp__${COMMENT_TOOL_SERVER}__${COMMENT_TOOL_NAME}`

export interface CommentProposal {
  path: string
  side: DiffSide
  line: number
  body: string
}

export type CommentTarget = { kind: 'ok', draft: SuggestionDraft } | { kind: 'problem', message: string }

export function readCommentInput(input: Record<string, unknown> | undefined): CommentProposal | null {
  const path = typeof input?.path === 'string' ? input.path.replace(/^[ab]\//, '') : ''
  const line = Number(input?.line)
  const body = typeof input?.body === 'string' ? input.body.trim() : ''
  if (!path || !Number.isInteger(line) || line < 1 || !body)
    return null
  return { path, side: input?.side === 'old' ? 'deletions' : 'additions', line, body }
}

export function resolveCommentTarget(files: Pick<DiffFile, 'path' | 'previousPath' | 'diff'>[], proposal: CommentProposal): CommentTarget {
  const file = files.find(each => each.path === proposal.path || (proposal.side === 'deletions' && each.previousPath === proposal.path))
  if (!file)
    return { kind: 'problem', message: `${proposal.path} isn't changed in the merge request, so GitLab can't take a comment on it.` }
  if (!createLineMap(file.diff).shows(proposal.side, proposal.line)) {
    const version = proposal.side === 'deletions' ? 'old' : 'new'
    return { kind: 'problem', message: `Line ${proposal.line} of the ${version} version isn't part of the diff, so GitLab can't take a comment there.` }
  }
  return { kind: 'ok', draft: { path: file.path, side: proposal.side, line: proposal.line, body: proposal.body } }
}
