import type { ChatMessage } from '../../shared/chat'
import type { FindingStatus, ReviewRunInput, ReviewRunState } from '../../shared/claude-review'
import type { DiffFile, DiffRefs, MrRef, NewDiffComment } from '../../shared/types'
import type { LocalHost, StreamedProcess } from '../local/host'
import { chatModelArgs } from '../../shared/chat'
import { buildReviewPrompt, buildReviewSystemPrompt, EMPTY_REVIEW_STATE, findingComment, findingPostBody, normalizeFindings, readReview, reviewSchema, withConventionalDefaults } from '../../shared/claude-review'
import { mrKey } from '../../shared/mr-ref'
import { applyStreamLine, explainExit } from './claude-events'

const READ_ONLY_TOOLS = 'Read,Grep,Glob'
const MAX_WAIT_MS = 20_000
const FINDING_STATUSES = new Set<FindingStatus>(['open', 'dismissed', 'posted'])

export class ReviewError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export interface ReviewWorkspace {
  contextDir: string
  worktreeDir: string | null
  title: string
  headSha: string
  diffRefs: DiffRefs
  files: DiffFile[]
}

export type PostComment = (body: string, diffRefs: DiffRefs, comment: NewDiffComment) => Promise<void>

export interface ReviewRunnerDeps {
  host: LocalHost
  claudePath: Promise<string | null>
  claudeEnv: () => Promise<Record<string, string>>
  reviewFile: (ref: MrRef) => string
}

interface ReviewSession {
  ref: MrRef
  state: ReviewRunState
  process: StreamedProcess | null
  waiters: Set<() => void>
  saving: Promise<void>
}

interface SavedReview extends Omit<ReviewRunState, 'version'> {
  updatedAt: number
}

export interface ReviewRunner {
  state: (ref: MrRef, since: number, waitMs: number) => Promise<ReviewRunState>
  run: (ref: MrRef, input: ReviewRunInput, prepare: () => Promise<ReviewWorkspace>, postComment: PostComment) => Promise<ReviewRunState>
  stop: (ref: MrRef) => Promise<ReviewRunState>
  setFindingStatus: (ref: MrRef, ids: string[], status: FindingStatus) => Promise<ReviewRunState>
  setFindingDraft: (ref: MrRef, id: string, draft: string | null) => Promise<ReviewRunState>
  updatedAt: (path: string) => Promise<number | null>
  dispose: () => void
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function createReviewRunner(deps: ReviewRunnerDeps): ReviewRunner {
  const { host } = deps
  const sessions = new Map<string, ReviewSession>()
  const loading = new Map<string, Promise<ReviewSession>>()

  async function readSaved(path: string): Promise<SavedReview | null> {
    const text = await host.readFile(path)
    if (!text)
      return null
    try {
      return JSON.parse(text) as SavedReview
    }
    catch {
      return null
    }
  }

  async function createSession(ref: MrRef): Promise<ReviewSession> {
    const saved = await readSaved(deps.reviewFile(ref))
    const state: ReviewRunState = saved
      ? { ...EMPTY_REVIEW_STATE, ...saved, status: saved.status === 'running' ? 'stopped' : saved.status, findings: saved.findings.map(withConventionalDefaults), tools: saved.tools ?? [], posting: null }
      : { ...EMPTY_REVIEW_STATE }
    // Starts from the clock so a browser that saw the previous server's versions still accepts this one.
    state.version = Date.now()
    return { ref, state, process: null, waiters: new Set(), saving: Promise.resolve() }
  }

  async function sessionFor(ref: MrRef) {
    const key = mrKey(ref)
    const existing = sessions.get(key)
    if (existing)
      return existing
    let pending = loading.get(key)
    if (!pending) {
      pending = createSession(ref).then((created) => {
        sessions.set(key, created)
        return created
      }).finally(() => loading.delete(key))
      loading.set(key, pending)
    }
    return pending
  }

  function changed(session: ReviewSession) {
    session.state.version++
    const waiters = [...session.waiters]
    session.waiters.clear()
    for (const resolve of waiters)
      resolve()
  }

  function persist(session: ReviewSession) {
    const { version: _version, ...rest } = session.state
    const text = JSON.stringify({ ...rest, updatedAt: Date.now() } satisfies SavedReview)
    const path = deps.reviewFile(session.ref)
    session.saving = session.saving
      .then(async () => {
        await host.makeDir(path.slice(0, path.lastIndexOf('/')))
        await host.writeFile(path, text)
      })
      .catch(() => undefined)
    return session.saving
  }

  function snapshot(session: ReviewSession): ReviewRunState {
    return { ...session.state, findings: session.state.findings.map(finding => ({ ...finding })), tools: [...session.state.tools] }
  }

  async function postFindings(session: ReviewSession, workspace: ReviewWorkspace, postComment: PostComment, signature: string | null) {
    const state = session.state
    const pending = state.findings.filter(finding => finding.status === 'open')
    state.posting = { done: 0, total: pending.length }
    changed(session)
    for (const finding of pending) {
      if (state.status !== 'running')
        return
      const file = workspace.files.find(item => item.path === finding.path)
      try {
        if (!file)
          throw new Error('The file is not in the merge request any more.')
        await postComment(findingPostBody(finding, signature), workspace.diffRefs, findingComment(finding, file))
        finding.status = 'posted'
      }
      catch (error) {
        state.postErrors.push(`${finding.path}:${finding.endLine}: ${errorMessage(error)}`)
      }
      state.posting = { done: state.posting.done + 1, total: pending.length }
      changed(session)
    }
    state.posting = null
  }

  async function execute(session: ReviewSession, input: ReviewRunInput, prepare: () => Promise<ReviewWorkspace>, postComment: PostComment) {
    const state = session.state
    const fail = (message: string) => {
      state.status = 'error'
      state.error = message
      state.finishedAt = new Date().toISOString()
      session.process = null
      changed(session)
    }
    let promptFile: string | null = null
    try {
      const binary = await deps.claudePath
      if (!binary)
        return fail('Claude Code is not installed.')
      const workspace = await prepare()
      if (state.status !== 'running')
        return
      state.headSha = workspace.headSha
      promptFile = `${workspace.contextDir}/review-${crypto.randomUUID()}.txt`
      await host.writeFile(promptFile, buildReviewPrompt(workspace.title))

      const progress: ChatMessage = { id: 'review', role: 'assistant', text: '', contexts: [], tools: state.tools, status: 'streaming', error: null }
      let result: unknown = null
      const process = host.stream([
        binary,
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--tools',
        READ_ONLY_TOOLS,
        '--allowedTools',
        READ_ONLY_TOOLS,
        '--setting-sources',
        '',
        '--strict-mcp-config',
        '--no-session-persistence',
        '--json-schema',
        JSON.stringify(reviewSchema(input.mode)),
        ...chatModelArgs(input.model, input.effort),
        '--append-system-prompt',
        buildReviewSystemPrompt({ ...workspace, mode: input.mode }),
        ...(workspace.worktreeDir ? ['--add-dir', workspace.worktreeDir] : []),
      ], {
        cwd: workspace.contextDir,
        stdinFile: promptFile,
        env: await deps.claudeEnv(),
        onLine: (line) => {
          if (line.includes('"type":"result"')) {
            try {
              result = JSON.parse(line)
            }
            catch {}
          }
          if (applyStreamLine(progress, line, { repo: workspace.worktreeDir, context: workspace.contextDir }).changed)
            changed(session)
        },
      })
      session.process = process
      changed(session)

      const { code, stderr } = await process.exited
      if (session.process === process)
        session.process = null
      if (state.status !== 'running')
        return
      const review = readReview(result)
      if (!review)
        return fail(progress.status === 'error' && progress.error ? progress.error : code === 0 ? 'Claude did not return a review. Try again.' : explainExit(code, stderr))
      const { findings, dropped } = normalizeFindings(review.findings, workspace.files, () => crypto.randomUUID())
      state.findings = findings
      state.dropped = dropped
      state.summary = review.summary.trim()
      if (input.post)
        await postFindings(session, workspace, postComment, input.signature)
      if (state.status !== 'running')
        return
      state.status = 'done'
      state.finishedAt = new Date().toISOString()
      changed(session)
    }
    catch (error) {
      fail(errorMessage(error))
    }
    finally {
      if (promptFile)
        await host.remove(promptFile).catch(() => null)
      await persist(session)
    }
  }

  return {
    async state(ref, since, waitMs) {
      const session = await sessionFor(ref)
      if (session.state.version <= since) {
        await new Promise<void>((resolve) => {
          session.waiters.add(resolve)
          setTimeout(resolve, Math.min(MAX_WAIT_MS, Math.max(0, waitMs)))
        })
      }
      return snapshot(session)
    },

    async run(ref, input, prepare, postComment) {
      const session = await sessionFor(ref)
      if (session.state.status === 'running')
        throw new ReviewError(409, 'Claude is still reviewing. Wait for it to finish or stop it.')
      session.state = { ...EMPTY_REVIEW_STATE, version: session.state.version, status: 'running', mode: input.mode, headSha: session.state.headSha, startedAt: new Date().toISOString() }
      changed(session)
      void execute(session, input, prepare, postComment)
      return snapshot(session)
    },

    async stop(ref) {
      const session = await sessionFor(ref)
      if (session.state.status === 'running') {
        session.state.status = 'stopped'
        session.state.finishedAt = new Date().toISOString()
        session.process?.kill()
        session.process = null
        changed(session)
        await persist(session)
      }
      return snapshot(session)
    },

    async setFindingStatus(ref, ids, status) {
      if (!FINDING_STATUSES.has(status))
        throw new ReviewError(400, 'Unknown finding status.')
      const session = await sessionFor(ref)
      const wanted = new Set(ids)
      for (const finding of session.state.findings) {
        if (wanted.has(finding.id))
          finding.status = status
      }
      changed(session)
      await persist(session)
      return snapshot(session)
    },

    async setFindingDraft(ref, id, draft) {
      const session = await sessionFor(ref)
      const finding = session.state.findings.find(item => item.id === id)
      if (!finding)
        throw new ReviewError(404, 'This finding is not in the review any more.')
      if (finding.status === 'posted')
        throw new ReviewError(409, 'This finding is already posted. Edit the comment in GitLab instead.')
      finding.draft = draft?.trim() ? draft : null
      changed(session)
      await persist(session)
      return snapshot(session)
    },

    async updatedAt(path) {
      return (await readSaved(path))?.updatedAt ?? null
    },

    dispose() {
      for (const session of sessions.values())
        session.process?.kill()
      sessions.clear()
    },
  }
}
