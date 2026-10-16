import type { FindingSeverity, ReviewFinding } from '../../shared/claude-review'
import type { DiffFile } from '../../shared/types'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Eye, EyeOff, GitPullRequestArrow, Loader2, MessageSquarePlus, Pencil, Sparkles, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { css } from 'styled-system/css'
import { badge } from 'styled-system/recipes'
import { buildFindingPatch, conventionalPrefix, findingAsChatThread, findingComment, findingCommentBody, findingDraftBody, findingPostBody, severityLabel } from '../../shared/claude-review'
import { codeForRange } from '../../shared/line-map'
import { api } from '../lib/api'
import { useChatControls } from '../lib/chat'
import { useClaudeReviewControls } from '../lib/claude-review'
import { timeAgo } from '../lib/format'
import { localChangesKey, useLocalRepo } from '../lib/local-repos'
import { useReviewSignature } from '../lib/settings'
import { CommentComposer } from './comment-composer'
import { CommentPreview } from './comment-preview'
import { useReview, useReviewActions } from './review-context'
import { SuggestionBlock } from './suggestion-block'
import { Button } from './ui/button'
import { Markdown } from './ui/markdown'

const SEVERITY_TONES: Record<FindingSeverity, 'danger' | 'warning' | 'neutral'> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

const spinner = css({ animation: 'spin', flexShrink: 0 })

type ApplyState = { kind: 'idle' } | { kind: 'applying' } | { kind: 'applied' } | { kind: 'error', message: string }

export function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  return <span className={badge({ tone: SEVERITY_TONES[severity] })}>{severityLabel(severity)}</span>
}

export function FindingCard({ finding, file, finishedAt }: { finding: ReviewFinding, file: DiffFile, finishedAt: string | null }) {
  const { mergeRequest, projectUrl, viewer } = useReview()
  const { create } = useReviewActions()
  const review = useClaudeReviewControls()
  const chat = useChatControls()
  const localRepo = useLocalRepo(mergeRequest.ref)
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const signature = useReviewSignature()
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [apply, setApply] = useState<ApplyState>({ kind: 'idle' })
  const original = finding.suggestion === null ? null : codeForRange(file.diff, 'additions', finding.startLine, finding.endLine)
  const edited = finding.draft !== null && finding.draft !== undefined

  async function run(action: () => Promise<void>) {
    setActionError(null)
    try {
      await action()
    }
    catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function post() {
    return run(async () => {
      await create.mutateAsync({ body: findingPostBody(finding, signature), comment: findingComment(finding, file) })
      await review?.setStatus([finding.id], 'posted')
    })
  }

  async function saveDraft(body: string) {
    setSaving(true)
    try {
      await review?.setDraft(finding.id, body.trim() === findingCommentBody(finding).trim() ? null : body)
      setEditing(false)
    }
    finally {
      setSaving(false)
    }
  }

  async function applyLocally() {
    if (!localRepo.path)
      return
    setApply({ kind: 'applying' })
    try {
      const contents = await api.fileContents(mergeRequest.ref, mergeRequest.diffRefs, null, file.path)
      const patch = contents.newContents === null ? null : buildFindingPatch(finding, contents.newContents)
      if (!patch)
        throw new Error('The suggestion no longer matches the file.')
      await api.applyPatch(mergeRequest.ref, localRepo.path, patch)
      setApply({ kind: 'applied' })
      void queryClient.invalidateQueries({ queryKey: localChangesKey(mergeRequest.ref, localRepo.path) })
    }
    catch (cause) {
      setApply({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  function ask() {
    chat?.addContext({
      path: file.path,
      side: finding.side,
      startLine: finding.startLine,
      endLine: finding.endLine,
      code: codeForRange(file.diff, finding.side, finding.startLine, finding.endLine),
      threads: [findingAsChatThread(finding)],
    })
  }

  return (
    <div className={css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', overflow: 'hidden', fontFamily: 'body', whiteSpace: 'normal', textAlign: 'left' })}>
      <div className={css({ display: 'flex', gap: '2.5', px: '3', py: '2.5' })}>
        <span className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, w: '6', h: '6', borderRadius: 'full', bg: 'accent.subtle', color: 'accent.fg', '& svg': { w: '3.5', h: '3.5' } })}>
          <Sparkles />
        </span>
        <div className={css({ flex: '1', minW: '0' })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', fontSize: 'xs', minH: '6' })}>
            <span className={css({ fontWeight: 'semibold' })}>Claude</span>
            <span className={badge({ tone: 'accent' })}>AI</span>
            {finishedAt && <span className={css({ color: 'fg.subtle' })} title={new Date(finishedAt).toLocaleString()}>{timeAgo(finishedAt)}</span>}
            {edited && <span className={badge({ tone: 'neutral' })}>Edited</span>}
            <span className={css({ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: '1.5' })}>
              <span className={css({ fontFamily: 'mono', fontSize: '2xs', color: 'fg.subtle' })} title="Conventional Comments label, posted at the start of the comment">{conventionalPrefix(finding)}</span>
              {finding.label !== 'praise' && <SeverityBadge severity={finding.severity} />}
            </span>
          </div>
          {editing
            ? (
                <div className={css({ mt: '2' })}>
                  <CommentComposer
                    initialValue={findingDraftBody(finding)}
                    submitLabel="Save"
                    autoFocus
                    baseUrl={projectUrl}
                    busy={saving}
                    onCancel={() => setEditing(false)}
                    onSubmit={saveDraft}
                  />
                </div>
              )
            : edited
              ? <Markdown baseUrl={projectUrl} className={css({ mt: '1' })}>{findingDraftBody(finding)}</Markdown>
              : (
                  <>
                    <div className={css({ mt: '1', fontSize: 'sm', fontWeight: 'semibold', color: 'fg.muted' })}>{finding.title}</div>
                    <Markdown baseUrl={projectUrl} className={css({ mt: '1' })}>{finding.body}</Markdown>
                    {finding.suggestion !== null && original !== null && (
                      <div className={css({ mt: '2' })}>
                        <SuggestionBlock path={file.path} original={original} suggested={finding.suggestion} />
                      </div>
                    )}
                  </>
                )}
          {!editing && (
            <div className={css({ mt: '2', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.5' })}>
              {chat && (
                <Button size="xs" onClick={ask}>
                  <Sparkles />
                  Ask
                </Button>
              )}
              {finding.suggestion !== null && localRepo.path && (
                <Button size="xs" disabled={apply.kind === 'applying' || apply.kind === 'applied'} title={`Apply Claude's suggested change to ${localRepo.path}`} onClick={() => void applyLocally()}>
                  {apply.kind === 'applying' ? <Loader2 className={spinner} /> : apply.kind === 'applied' ? <Check /> : <GitPullRequestArrow />}
                  {apply.kind === 'applied' ? 'Applied' : 'Apply locally'}
                </Button>
              )}
              <Button size="xs" onClick={() => setEditing(true)}>
                <Pencil />
                Edit
              </Button>
              <Button size="xs" aria-pressed={previewing} onClick={() => setPreviewing(!previewing)}>
                {previewing ? <EyeOff /> : <Eye />}
                {previewing ? 'Hide preview' : 'Preview'}
              </Button>
              {edited && (
                <Button size="xs" variant="ghost" title="Go back to Claude's text" onClick={() => void run(() => review!.setDraft(finding.id, null))}>
                  <Undo2 />
                  Undo edits
                </Button>
              )}
              <Button size="xs" variant="success" disabled={create.isPending} onClick={() => void post()} title="Post this comment on these lines in GitLab, as you.">
                {create.isPending ? <Loader2 className={spinner} /> : <MessageSquarePlus />}
                Post to GitLab
              </Button>
              <Button size="xs" variant="ghost" className={css({ ml: 'auto' })} onClick={() => void run(() => review!.setStatus([finding.id], 'dismissed'))}>
                <X />
                Dismiss
              </Button>
            </div>
          )}
          {previewing && !editing && (
            <div className={css({ mt: '2' })}>
              <CommentPreview body={findingPostBody(finding, signature)} author={viewer} side={finding.side} startLine={finding.startLine} endLine={finding.endLine} projectUrl={projectUrl} />
            </div>
          )}
          {actionError && <div className={css({ mt: '1.5', fontSize: 'xs', color: 'danger.fg' })}>{actionError}</div>}
          {apply.kind === 'error' && <div className={css({ mt: '1.5', fontSize: 'xs', color: 'danger.fg' })}>{apply.message}</div>}
        </div>
      </div>
    </div>
  )
}
