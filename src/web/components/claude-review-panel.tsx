import type { ReviewFinding, ReviewMode, ReviewRunState } from '../../shared/claude-review'
import type { ThinkingStep } from '../../shared/thinking-steps'
import type { ThinkingOutcome } from './thinking-timeline'
import { Info, MessageSquarePlus, RotateCcw, Sparkles, Square } from 'lucide-react'
import { useMemo, useState } from 'react'
import { css } from 'styled-system/css'
import { badge } from 'styled-system/recipes'
import { conventionalPrefix, FINDING_SEVERITIES, findingComment, findingPostBody, REVIEW_MODE_INFO, REVIEW_MODES } from '../../shared/claude-review'
import { stepsFromTools } from '../../shared/thinking-steps'
import { useClaudeReviewControls } from '../lib/claude-review'
import { useLocalRepo } from '../lib/local-repos'
import { MODEL_OPTIONS } from '../lib/model-options'
import { useReviewSignature, useSettings } from '../lib/settings'
import { SeverityBadge } from './finding-card'
import { useReview, useReviewActions } from './review-context'
import { ThinkingTimeline } from './thinking-timeline'
import { Button, WithTooltip } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { EffortSlider } from './ui/effort-slider'
import { Markdown } from './ui/markdown'
import { Segmented } from './ui/segmented'
import { Select } from './ui/select'

type PostState = { kind: 'idle' } | { kind: 'confirm' } | { kind: 'posting', done: number, total: number } | { kind: 'done', failed: string[] }

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function reviewSteps(state: ReviewRunState): ThinkingStep[] {
  const steps = stepsFromTools(state.tools, 'the review')
  if (state.posting) {
    const { done, total } = state.posting
    steps.push({ id: 'posting', kind: 'post', doneLabel: `Posted ${plural(done, 'comment', 'comments')} to GitLab`, activeLabel: `Posting comments to GitLab, ${Math.min(done + 1, total)} of ${total}`, items: [] })
  }
  else if (state.findings.some(finding => finding.status === 'posted')) {
    const posted = state.findings.filter(finding => finding.status === 'posted').length
    steps.push({ id: 'posted', kind: 'post', doneLabel: `Posted ${plural(posted, 'comment', 'comments')} to GitLab`, activeLabel: '', items: [] })
  }
  return steps
}

function reviewOutcome(state: ReviewRunState): ThinkingOutcome {
  if (state.status === 'running')
    return 'running'
  if (state.status === 'done')
    return 'done'
  return state.status === 'error' ? 'error' : 'stopped'
}

function Emphasized({ text }: { text: string }) {
  return text.split('**').map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part)
}

const MODE_ITEMS = REVIEW_MODES.map(mode => ({
  value: mode,
  label: (
    <>
      {REVIEW_MODE_INFO[mode].label}
      <WithTooltip label={<Emphasized text={REVIEW_MODE_INFO[mode].description} />}>
        <span aria-label={`About ${REVIEW_MODE_INFO[mode].label}`} className={css({ display: 'inline-flex', color: 'fg.subtle', _hover: { color: 'fg.default' }, '& svg': { w: '3', h: '3' } })}>
          <Info />
        </span>
      </WithTooltip>
    </>
  ),
}))

function FindingRow({ finding, onJump }: { finding: ReviewFinding, onJump: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onJump}
        className={css({ display: 'flex', flexDir: 'column', gap: '1', w: 'full', textAlign: 'left', px: '2.5', py: '2', borderRadius: 'md', cursor: 'pointer', _hover: { bg: 'bg.muted' } })}
      >
        <span className={css({ display: 'flex', alignItems: 'flex-start', gap: '2' })}>
          <SeverityBadge severity={finding.severity} />
          <span className={css({ flex: '1', minW: '0', fontSize: 'sm', fontWeight: 'medium', color: 'fg.default' })}>{finding.title}</span>
        </span>
        <span className={css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'xs', color: 'fg.subtle' })}>
          <span className={css({ fontFamily: 'mono', flexShrink: 0 })}>{conventionalPrefix(finding)}</span>
          <span className={css({ fontFamily: 'mono', truncate: true, minW: '0' })}>
            {finding.path}:{finding.startLine === finding.endLine ? finding.endLine : `${finding.startLine}-${finding.endLine}`}
          </span>
          {finding.draft && finding.status !== 'posted' && <span className={badge({ tone: 'accent' })}>Edited</span>}
          <span className={badge({ tone: finding.status === 'posted' ? 'success' : 'neutral' })}>{finding.status === 'posted' ? 'Posted' : 'Draft'}</span>
        </span>
      </button>
    </li>
  )
}

export function ClaudeReviewPanel() {
  const review = useClaudeReviewControls()
  const { mergeRequest, files, projectUrl } = useReview()
  const { create } = useReviewActions()
  const localRepo = useLocalRepo(mergeRequest.ref)
  const [settings, updateSettings] = useSettings()
  const signature = useReviewSignature()
  const [post, setPost] = useState<PostState>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const state = review?.state
  const steps = useMemo(() => (state ? reviewSteps(state) : []), [state])
  if (!review || !state)
    return null

  const { current } = review
  const running = state.status === 'running'
  const listed = current ? state.findings.filter(finding => finding.status !== 'dismissed') : []
  const openFindings = listed.filter(finding => finding.status === 'open')

  async function start() {
    setError(null)
    setPost({ kind: 'idle' })
    try {
      await review!.run({ repoPath: localRepo.path, model: settings.reviewModel, effort: settings.reviewEffort, post: settings.reviewAutoPost, mode: settings.reviewMode, signature })
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function postAll() {
    const pending = [...openFindings]
    const failed: string[] = []
    const posted: string[] = []
    setPost({ kind: 'posting', done: 0, total: pending.length })
    for (const [index, finding] of pending.entries()) {
      try {
        const file = files.find(item => item.path === finding.path)
        if (!file)
          throw new Error(`${finding.path} is not in the merge request any more.`)
        await create.mutateAsync({ body: findingPostBody(finding, signature), comment: findingComment(finding, file) })
        posted.push(finding.id)
      }
      catch (cause) {
        failed.push(`${finding.path}:${finding.endLine}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
      setPost({ kind: 'posting', done: index + 1, total: pending.length })
    }
    if (posted.length)
      await review!.setStatus(posted, 'posted').catch(() => null)
    setPost({ kind: 'done', failed })
  }

  const counts = FINDING_SEVERITIES
    .map(severity => ({ severity, count: listed.filter(finding => finding.severity === severity).length }))
    .filter(item => item.count)
  const kept = state.findings.filter(finding => finding.status !== 'dismissed').length
  const finishedMeta = state.status === 'done'
    ? [REVIEW_MODE_INFO[state.mode ?? 'focused'].label, kept ? plural(kept, 'finding', 'findings') : 'no findings', state.dropped ? `${state.dropped} left out` : ''].filter(Boolean).join(' · ')
    : undefined

  return (
    <div className={css({ flex: '1', minH: '0', overflowY: 'auto', display: 'flex', flexDir: 'column', gap: '4', p: '3', fontSize: 'xs' })}>
      <section className={css({ display: 'flex', flexDir: 'column', gap: '2.5', p: '3', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg' })}>
        <p className={css({ color: 'fg.muted' })}>
          {settings.reviewAutoPost
            ? 'Claude reads the changes and posts each comment to GitLab from your account, without a chance to edit them first.'
            : 'Claude reads the changes and adds draft comments on the lines. Edit the drafts in the diff, then post them. Nothing goes to GitLab before that.'}
        </p>
        <div>
          <Segmented<ReviewMode> label="Review depth" value={settings.reviewMode} onChange={reviewMode => updateSettings({ reviewMode })} items={MODE_ITEMS} />
        </div>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '3', flexWrap: 'wrap' })}>
          <Select variant="compact" label="Model for reviews" value={settings.reviewModel} options={MODEL_OPTIONS} disabled={running} onChange={reviewModel => updateSettings({ reviewModel })} />
          <EffortSlider label="Effort for reviews" value={settings.reviewEffort} disabled={running} onChange={reviewEffort => updateSettings({ reviewEffort })} />
        </div>
        <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', color: 'fg.muted' })}>
          <Checkbox checked={settings.reviewAutoPost} onCheckedChange={reviewAutoPost => updateSettings({ reviewAutoPost })} label="Post to GitLab right away, without editing" />
          <span className={css({ cursor: 'pointer', userSelect: 'none' })} onClick={() => updateSettings({ reviewAutoPost: !settings.reviewAutoPost })}>Post to GitLab right away, without editing</span>
        </span>
        {running
          ? (
              <Button size="md" onClick={() => void review.stop()}>
                <Square />
                Stop the review
              </Button>
            )
          : (
              <Button size="md" variant="solid" onClick={() => void start()}>
                {state.status === 'idle' ? <Sparkles /> : <RotateCcw />}
                {state.status === 'idle' ? 'Review with Claude' : 'Review again'}
              </Button>
            )}
        {error && <div className={css({ color: 'danger.fg' })}>{error}</div>}
      </section>

      {state.status !== 'idle' && (
        <ThinkingTimeline steps={steps} outcome={reviewOutcome(state)} startedAt={state.startedAt} finishedAt={state.finishedAt} finishedMeta={finishedMeta} />
      )}

      {state.status === 'error' && <div className={css({ color: 'danger.fg', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>{state.error}</div>}
      {state.status === 'done' && !current && (
        <div className={css({ color: 'warning.fg' })}>This review is for an older commit. Review again to check the latest changes.</div>
      )}

      {current && state.summary && <Markdown baseUrl={projectUrl} className={css({ color: 'fg.muted' })}>{state.summary}</Markdown>}

      {current && state.postErrors.length > 0 && (
        <div className={css({ color: 'danger.fg' })}>
          These findings could not be posted and are shown in the diff instead:
          <ul className={css({ mt: '1', pl: '4', listStyle: 'disc' })}>
            {state.postErrors.map(reason => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      )}

      {listed.length > 0 && (
        <section className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap' })}>
            <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold' })}>Findings</h3>
            {counts.map(item => (
              <span key={item.severity} className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', color: 'fg.muted' })}>
                <SeverityBadge severity={item.severity} />
                {item.count}
              </span>
            ))}
          </div>
          {openFindings.length > 0 && post.kind === 'idle' && (
            <Button size="sm" variant="success" onClick={() => setPost({ kind: 'confirm' })}>
              <MessageSquarePlus />
              Post {plural(openFindings.length, 'draft', 'drafts')} to GitLab
            </Button>
          )}
          {post.kind === 'confirm' && (
            <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', flexWrap: 'wrap' })}>
              Post {plural(openFindings.length, 'comment', 'comments')} as you?
              <Button size="xs" variant="success" onClick={() => void postAll()}>Post</Button>
              <Button size="xs" variant="ghost" onClick={() => setPost({ kind: 'idle' })}>Cancel</Button>
            </div>
          )}
          {post.kind === 'posting' && <div className={css({ color: 'fg.muted' })}>Posting {Math.min(post.done + 1, post.total)} of {post.total}…</div>}
          {post.kind === 'done' && post.failed.length > 0 && (
            <ul className={css({ pl: '4', listStyle: 'disc', color: 'danger.fg' })}>
              {post.failed.map(reason => <li key={reason}>{reason}</li>)}
            </ul>
          )}
          <ul className={css({ display: 'flex', flexDir: 'column', mx: '-2.5' })}>
            {listed.map(finding => <FindingRow key={finding.id} finding={finding} onJump={() => review.jumpTo(finding.id)} />)}
          </ul>
        </section>
      )}
    </div>
  )
}
