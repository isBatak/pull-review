import type { ChatMessage, ChatPromptSection, ChatPromptView, ChatSendInput, ChatState, ChatWorkspace } from '../../shared/chat'
import type { DiffFile, Discussion, MergeRequest, MrRef } from '../../shared/types'
import type { CommitPlan, CommitPlanInput } from '../../shared/commit-plan'
import type { FindingStatus, ReviewRunInput, ReviewRunState } from '../../shared/claude-review'
import type { LocalHost, StreamedProcess } from '../local/host'
import type { SavedChat, SentPrompt } from './saved-chat'
import { buildContextUpdateNote, buildDiscussionsSummary, buildMrSummary, buildPatch, buildPrompt, buildSystemPrompt, chatModelArgs, EMPTY_CHAT_STATE, fileDiffName } from '../../shared/chat'
import { mrKey } from '../../shared/mr-ref'
import { applyStreamLine, explainExit } from './claude-events'
import { findExecutable } from '../local/host'
import { expandHome } from '../local/git'
import type { ResolvedFile, ResolvePromptInput } from '../../shared/conflicts'
import type { MrDraft, MrDraftPromptInput } from '../../shared/new-mr'
import { buildChatUiPrompt } from '../../shared/chat-ui'
import { buildMrDraftPrompt, MR_DRAFT_SCHEMA, MR_DRAFT_SYSTEM_PROMPT, readMrDraft } from '../../shared/new-mr'
import { buildResolvePrompt, readResolution, RESOLVE_SCHEMA, RESOLVE_SYSTEM_PROMPT } from '../../shared/conflicts'
import { buildCommitPlanPrompt, COMMIT_PLAN_SCHEMA, COMMIT_PLAN_SYSTEM_PROMPT, normalizeCommitPlan, readCommitPlan, splitInfo } from '../../shared/commit-plan'
import { readLocalChanges } from '../local/changes'
import { createGitTools } from '../local/git'
import { MAX_SENT_PROMPTS, packSent, rememberSent, unpackSent } from './saved-chat'
import type { PostComment } from './review'
import { createReviewRunner } from './review'
import { localFixesFile, readSavedFixes } from '../local/fixes'
import { createWorkspaces } from './workspace'
import { commentToolConfig, commentToolScript, commentToolTargets } from './comment-tool'
import { COMMENT_TOOL } from '../../shared/comment-proposals'

const IDLE_LIMIT_MS = 30 * 60_000
const IDLE_CHECK_MS = 60_000
const MAX_WAIT_MS = 20_000
const READ_ONLY_TOOLS = 'Read,Grep,Glob'
const REMOVED_ENV = ['ANTHROPIC_API_KEY', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']
const MAX_PREVIEW_CHARS = 200_000
const MAX_PLAN_DIFF_CHARS = 150_000
const MAX_PLAN_FILE_DIFF_CHARS = 20_000
const CHAT_RETENTION_MS = 30 * 24 * 60 * 60_000

export class ChatError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export interface MrSnapshot {
  mergeRequest: MergeRequest
  files: DiffFile[]
  discussions: Discussion[]
}

interface ContextFile {
  name: string
  path: string
  text: string
}

function hashText(text: string) {
  let hash = 0x811C9DC5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${(hash >>> 0).toString(36)}:${text.length}`
}

interface Session {
  ref: MrRef
  claudeSessionId: string
  started: boolean
  messages: ChatMessage[]
  version: number
  workspace: ChatWorkspace
  worktreeDir: string | null
  workspaceTask: Promise<void> | null
  turn: StreamedProcess | null
  turnCount: number
  sent: Map<string, SentPrompt>
  written: Map<string, string>
  seenContext: Record<string, string>
  lastUsed: number
  waiters: Set<() => void>
  saving: Promise<void>
}

export interface ChatService {
  available: () => Promise<boolean>
  state: (ref: MrRef, since: number, waitMs: number) => Promise<ChatState>
  prepare: (ref: MrRef, load: () => Promise<MrSnapshot>, repoPath: string | null) => Promise<ChatState>
  send: (ref: MrRef, load: () => Promise<MrSnapshot>, input: ChatSendInput) => Promise<ChatState>
  preview: (ref: MrRef, load: () => Promise<MrSnapshot>, input: ChatSendInput) => Promise<ChatPromptView>
  sentPrompt: (ref: MrRef, messageId: string) => Promise<ChatPromptView>
  stop: (ref: MrRef) => Promise<ChatState>
  planCommits: (ref: MrRef, input: CommitPlanInput & { title: string, branch: string }) => Promise<CommitPlan>
  resolveConflicts: (input: ResolvePromptInput & { model: string, effort: string }) => Promise<ResolvedFile[]>
  draftMergeRequest: (input: MrDraftPromptInput & { model: string, effort: string }) => Promise<MrDraft>
  reset: (ref: MrRef) => Promise<ChatState>
  reviewState: (ref: MrRef, since: number, waitMs: number) => Promise<ReviewRunState>
  runReview: (ref: MrRef, load: () => Promise<MrSnapshot>, input: ReviewRunInput, postComment: PostComment) => Promise<ReviewRunState>
  stopReview: (ref: MrRef) => Promise<ReviewRunState>
  setFindingStatus: (ref: MrRef, ids: string[], status: FindingStatus) => Promise<ReviewRunState>
  setFindingDraft: (ref: MrRef, id: string, draft: string | null) => Promise<ReviewRunState>
  dispose: () => Promise<void>
}

const chatUiPrompts = {
  withMergeStatus: buildChatUiPrompt({ mergeStatus: true }),
  withoutMergeStatus: buildChatUiPrompt({ mergeStatus: false }),
}

function chatSystemPrompt(base: string, input: ChatSendInput) {
  return `${base}\n\n${input.mergeStatus ? chatUiPrompts.withMergeStatus : chatUiPrompts.withoutMergeStatus}`
}

function createId() {
  return crypto.randomUUID()
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function createChatService(host: LocalHost): ChatService {
  const sessions = new Map<string, Session>()
  const workspaces = createWorkspaces(host)
  const claudePath = findExecutable(host, 'claude', [`${host.homeDir}/.local/bin`, `${host.homeDir}/.claude/local`])

  const reviews = createReviewRunner({
    host,
    claudePath,
    claudeEnv,
    reviewFile: ref => reviewFileIn(workspaces.chatDir(ref)),
  })

  void workspaces.sweepStale()
  void sweepOldChats()

  function snapshot(session: Session | undefined): ChatState {
    if (!session)
      return EMPTY_CHAT_STATE
    return {
      version: session.version,
      messages: session.messages.map(message => ({ ...message, tools: [...message.tools] })),
      running: session.turn !== null,
      workspace: session.workspace,
    }
  }

  function changed(session: Session) {
    session.version++
    const waiters = [...session.waiters]
    session.waiters.clear()
    for (const resolve of waiters)
      resolve()
  }

  const loading = new Map<string, Promise<Session>>()

  function reviewFileIn(dir: string) {
    return `${dir}/review.json`
  }

  function savedChatFile(ref: MrRef) {
    return `${workspaces.chatDir(ref)}/chat.json`
  }

  async function readSavedChat(path: string): Promise<SavedChat | null> {
    const text = await host.readFile(path)
    if (!text)
      return null
    try {
      return JSON.parse(text) as SavedChat
    }
    catch {
      return null
    }
  }

  async function createSession(ref: MrRef): Promise<Session> {
    const saved = await readSavedChat(savedChatFile(ref))
    return {
      ref,
      claudeSessionId: saved?.claudeSessionId ?? createId(),
      started: saved?.started ?? false,
      messages: (saved?.messages ?? []).map(message => message.status === 'streaming' ? { ...message, status: 'stopped' } : message),
      // Starts from the clock so a browser that saw the previous server's versions still accepts this one.
      version: Date.now(),
      workspace: { kind: 'diff-only' },
      worktreeDir: null,
      workspaceTask: null,
      turn: null,
      turnCount: saved?.turnCount ?? 0,
      sent: unpackSent(saved),
      written: new Map(),
      seenContext: saved?.seenContext ?? {},
      lastUsed: Date.now(),
      waiters: new Set(),
      saving: Promise.resolve(),
    }
  }

  async function sessionFor(ref: MrRef) {
    const key = mrKey(ref)
    let session = sessions.get(key)
    if (!session) {
      let pending = loading.get(key)
      if (!pending) {
        pending = createSession(ref).then((created) => {
          sessions.set(key, created)
          return created
        }).finally(() => loading.delete(key))
        loading.set(key, pending)
      }
      session = await pending
    }
    session.lastUsed = Date.now()
    return session
  }

  function persist(session: Session) {
    const saved: SavedChat = {
      claudeSessionId: session.claudeSessionId,
      started: session.started,
      turnCount: session.turnCount,
      messages: session.messages,
      ...packSent(session.sent),
      seenContext: session.seenContext,
      updatedAt: Date.now(),
    }
    const text = JSON.stringify(saved)
    session.saving = session.saving
      .then(async () => {
        await host.makeDir(workspaces.chatDir(session.ref))
        await host.writeFile(savedChatFile(session.ref), text)
      })
      .catch(() => undefined)
    return session.saving
  }

  function claudeProjectDirFor(contextDir: string) {
    return `${host.homeDir}/.claude/projects/${contextDir.replace(/[^a-z0-9]/gi, '-')}`
  }

  function claudeProjectDir(ref: MrRef) {
    return claudeProjectDirFor(workspaces.contextDir(ref))
  }

  async function sweepOldChats() {
    const cutoff = Date.now() - CHAT_RETENTION_MS
    for (const name of await host.listDir(workspaces.chatsRoot)) {
      const dir = `${workspaces.chatsRoot}/${name}`
      const saved = await readSavedChat(`${dir}/chat.json`)
      const reviewedAt = await reviews.updatedAt(reviewFileIn(dir))
      const fixedAt = (await readSavedFixes(host, localFixesFile(dir)))?.updatedAt ?? 0
      if (Math.max(saved?.updatedAt ?? 0, reviewedAt ?? 0, fixedAt) >= cutoff)
        continue
      await host.remove(claudeProjectDirFor(`${dir}/context`)).catch(() => null)
      await host.remove(dir).catch(() => null)
    }
  }

  async function writeContext(session: Session, mr: MrSnapshot) {
    const dir = workspaces.contextDir(session.ref)
    const named = [
      { name: 'merge-request.md', text: buildMrSummary(mr.mergeRequest, mr.files) },
      { name: 'changes.diff', text: buildPatch(mr.files) },
      { name: 'discussions.md', text: buildDiscussionsSummary(mr.discussions) },
      ...mr.files.filter(file => file.diff).map(file => ({ name: fileDiffName(file.path), text: buildPatch([file]) })),
    ]
    const files: ContextFile[] = named.map(file => ({ ...file, path: `${dir}/${file.name}` }))
    for (const file of files) {
      const hash = hashText(file.text)
      if (session.written.get(file.path) === hash)
        continue
      await host.makeDir(file.path.slice(0, file.path.lastIndexOf('/')))
      await host.writeFile(file.path, file.text)
      session.written.set(file.path, hash)
    }
    return { dir, files }
  }

  async function writeCommentTool(contextDir: string, files: MrSnapshot['files']) {
    const toolDir = `${contextDir}/comment-tool`
    const script = `${toolDir}/server.mjs`
    const targets = `${toolDir}/targets.json`
    const config = `${toolDir}/mcp.json`
    await host.makeDir(toolDir)
    await host.writeFile(targets, JSON.stringify(commentToolTargets(files)))
    await host.writeFile(script, commentToolScript(targets))
    await host.writeFile(config, commentToolConfig(host.scriptRunner, script))
    return config
  }

  function contextUpdate(session: Session, files: ContextFile[]) {
    const seen = Object.fromEntries(files.map(file => [file.name, hashText(file.text)]))
    const known = session.started && Object.keys(session.seenContext).length > 0
    const changed = known ? files.map(file => file.name).filter(name => session.seenContext[name] !== seen[name]) : []
    return { seen, note: buildContextUpdateNote(changed) }
  }

  function withUpdateNote(note: string | null, prompt: string) {
    return note ? `${note}\n\n${prompt}` : prompt
  }

  function promptSections(prompt: SentPrompt): ChatPromptSection[] {
    return [
      { label: 'Your message', detail: 'Your text and everything you attached', text: prompt.message },
      { label: 'System prompt', detail: 'Instructions Pull Review adds to every message', text: prompt.systemPrompt },
    ]
  }

  function fileSection(file: ContextFile): ChatPromptSection {
    const truncated = file.text.length > MAX_PREVIEW_CHARS
    const size = `${Math.ceil(file.text.length / 1024)} KB`
    return {
      label: file.path.slice(file.path.lastIndexOf('/') + 1),
      detail: truncated ? `${file.path}, ${size}, showing the first ${MAX_PREVIEW_CHARS / 1000}K characters` : `${file.path}, ${size}`,
      text: truncated ? file.text.slice(0, MAX_PREVIEW_CHARS) : file.text,
    }
  }

  function ensureWorkspace(session: Session, rawRepoPath: string | null, headSha: string): Promise<void> {
    const repoPath = rawRepoPath?.trim() ? expandHome(rawRepoPath, host.homeDir) : null
    const current = session.workspace
    if (!repoPath) {
      if (current.kind !== 'diff-only') {
        const dir = session.worktreeDir
        session.worktreeDir = null
        session.workspace = { kind: 'diff-only' }
        changed(session)
        if (dir)
          void workspaces.removeWorktree(dir)
      }
      return Promise.resolve()
    }
    if (current.kind === 'ready' && current.repoPath === repoPath && current.headSha === headSha)
      return Promise.resolve()
    if (current.kind === 'preparing' && current.repoPath === repoPath && session.workspaceTask)
      return session.workspaceTask

    session.workspace = { kind: 'preparing', repoPath }
    changed(session)
    const task = workspaces.prepare(session.ref, repoPath, headSha)
      .then((dir) => {
        session.worktreeDir = dir
        session.workspace = { kind: 'ready', repoPath, headSha }
      })
      .catch((error: unknown) => {
        session.workspace = { kind: 'error', repoPath, message: errorMessage(error) }
      })
      .finally(() => {
        if (session.workspaceTask === task)
          session.workspaceTask = null
        changed(session)
      })
    session.workspaceTask = task
    return task
  }

  async function runStructured(input: { folder: string, prompt: string, systemPrompt: string, schema: unknown, model: string, effort: string }) {
    const binary = await claudePath
    if (!binary)
      throw new ChatError(404, 'Claude Code is not installed.')
    const dir = `${host.cacheDir}/${input.folder}`
    await host.makeDir(dir)
    const promptFile = `${dir}/${createId()}.txt`
    await host.writeFile(promptFile, input.prompt)
    const lines: string[] = []
    try {
      const process = host.stream([
        binary,
        '-p',
        '--output-format',
        'json',
        '--tools',
        '',
        '--setting-sources',
        '',
        '--strict-mcp-config',
        '--no-session-persistence',
        '--append-system-prompt',
        input.systemPrompt,
        '--json-schema',
        JSON.stringify(input.schema),
        ...chatModelArgs(input.model, input.effort),
      ], { cwd: dir, stdinFile: promptFile, env: await claudeEnv(), onLine: line => lines.push(line) })
      const { code, stderr } = await process.exited
      const value = lines.map((line) => {
        try {
          return JSON.parse(line) as unknown
        }
        catch {
          return null
        }
      }).findLast(item => item !== null)
      return { value, code, stderr }
    }
    finally {
      await host.remove(promptFile).catch(() => null)
    }
  }

  async function claudeEnv() {
    const env = { ...await host.env() }
    for (const key of REMOVED_ENV)
      delete env[key]
    return env
  }

  async function runTurn(session: Session, question: ChatMessage, reply: ChatMessage, load: () => Promise<MrSnapshot>, input: ChatSendInput) {
    const fail = (message: string) => {
      reply.status = 'error'
      reply.error = message
      session.turn = null
      changed(session)
    }
    let promptFile: string | null = null
    try {
      const binary = await claudePath
      if (!binary)
        return fail('Claude Code is not installed.')
      const mr = await load()
      const { dir: contextDir, files } = await writeContext(session, mr)
      await ensureWorkspace(session, input.repoPath, mr.mergeRequest.diffRefs.headSha)
      if (reply.status !== 'streaming')
        return

      const worktreeDir = session.workspace.kind === 'ready' ? session.worktreeDir : null
      promptFile = `${contextDir}/prompt-${++session.turnCount}.txt`
      const update = contextUpdate(session, files)
      session.seenContext = update.seen
      const message = withUpdateNote(update.note, buildPrompt(input.text, input.contexts))
      const systemPrompt = chatSystemPrompt(buildSystemPrompt({ mergeRequest: mr.mergeRequest, contextDir, worktreeDir }), input)
      const mcpConfig = await writeCommentTool(contextDir, mr.files)
      await host.writeFile(promptFile, message)
      rememberSent(session.sent, question.id, { message, systemPrompt, files: [...files.filter(file => !file.name.startsWith('diffs/')).map(file => file.path), `${contextDir}/diffs/ (one diff per changed file)`, ...(worktreeDir ? [worktreeDir] : [])] })

      const args = [
        binary,
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--tools',
        READ_ONLY_TOOLS,
        '--allowedTools',
        `${READ_ONLY_TOOLS},${COMMENT_TOOL}`,
        '--setting-sources',
        '',
        '--mcp-config',
        mcpConfig,
        '--strict-mcp-config',
        ...chatModelArgs(input.model, input.effort),
        '--append-system-prompt',
        systemPrompt,
        ...(worktreeDir ? ['--add-dir', worktreeDir] : []),
        ...(session.started ? ['--resume', session.claudeSessionId] : ['--session-id', session.claudeSessionId]),
      ]

      let finished = false
      const process = host.stream(args, {
        cwd: contextDir,
        stdinFile: promptFile,
        env: await claudeEnv(),
        onLine: (line) => {
          if (!session.started && line.includes('"subtype":"init"'))
            session.started = true
          const outcome = applyStreamLine(reply, line, { repo: worktreeDir, context: contextDir })
          finished ||= outcome.finished
          if (outcome.changed)
            changed(session)
        },
      })
      session.turn = process
      changed(session)

      const { code, stderr } = await process.exited
      if (session.turn === process)
        session.turn = null
      if (!finished && reply.status === 'streaming') {
        reply.status = 'error'
        reply.error = explainExit(code, stderr)
      }
      changed(session)
    }
    catch (error) {
      fail(errorMessage(error))
    }
    finally {
      reply.finishedAt ??= new Date().toISOString()
      if (promptFile)
        await host.remove(promptFile).catch(() => null)
      await persist(session)
    }
  }

  async function disposeSession(session: Session) {
    session.turn?.kill()
    for (const message of session.messages) {
      if (message.status === 'streaming')
        message.status = 'stopped'
    }
    sessions.delete(mrKey(session.ref))
    await persist(session)
    if (session.worktreeDir)
      await workspaces.removeWorktree(session.worktreeDir).catch(() => null)
  }

  const idleTimer = setInterval(() => {
    const cutoff = Date.now() - IDLE_LIMIT_MS
    for (const session of sessions.values()) {
      if (!session.turn && !session.workspaceTask && session.lastUsed < cutoff)
        void disposeSession(session)
    }
  }, IDLE_CHECK_MS)
  ;(idleTimer as { unref?: () => void }).unref?.()

  return {
    available: async () => Boolean(await claudePath),

    async state(ref, since, waitMs) {
      const session = await sessionFor(ref)
      if (session.version <= since) {
        await new Promise<void>((resolve) => {
          session.waiters.add(resolve)
          setTimeout(resolve, Math.min(MAX_WAIT_MS, Math.max(0, waitMs)))
        })
      }
      return snapshot(session)
    },

    async prepare(ref, load, repoPath) {
      const session = await sessionFor(ref)
      if (repoPath?.trim()) {
        const mr = await load()
        void ensureWorkspace(session, repoPath, mr.mergeRequest.diffRefs.headSha)
      }
      else {
        void ensureWorkspace(session, null, '')
      }
      return snapshot(session)
    },

    async send(ref, load, input) {
      if (!input.text.trim())
        throw new ChatError(400, 'The message is empty.')
      const session = await sessionFor(ref)
      if (session.turn || session.messages.some(message => message.status === 'streaming'))
        throw new ChatError(409, 'Claude is still answering. Wait for it to finish or stop it.')
      const question: ChatMessage = { id: createId(), role: 'user', text: input.text.trim(), contexts: input.contexts, tools: [], status: 'done', error: null }
      session.messages.push(question)
      const reply: ChatMessage = { id: createId(), role: 'assistant', text: '', contexts: [], tools: [], status: 'streaming', error: null, startedAt: new Date().toISOString() }
      session.messages.push(reply)
      changed(session)
      void persist(session)
      void runTurn(session, question, reply, load, input)
      return snapshot(session)
    },

    async preview(ref, load, input) {
      const session = await sessionFor(ref)
      const mr = await load()
      const { dir: contextDir, files } = await writeContext(session, mr)
      const worktreeDir = session.workspace.kind === 'ready' ? session.worktreeDir : null
      const fileDiffs = files.filter(file => file.name.startsWith('diffs/'))
      const prompt = {
        message: withUpdateNote(contextUpdate(session, files).note, buildPrompt(input.text, input.contexts)),
        systemPrompt: chatSystemPrompt(buildSystemPrompt({ mergeRequest: mr.mergeRequest, contextDir, worktreeDir }), input),
        files: [],
      }
      const fileDiffList: ChatPromptSection = {
        label: 'diffs/',
        detail: `${contextDir}/diffs, one diff per changed file`,
        text: fileDiffs.map(file => file.name.slice('diffs/'.length)).join('\n'),
      }
      return { sections: [...promptSections(prompt), ...files.filter(file => !fileDiffs.includes(file)).map(fileSection), fileDiffList] }
    },

    async sentPrompt(ref, messageId) {
      const prompt = (await sessionFor(ref)).sent.get(messageId)
      if (!prompt)
        throw new ChatError(404, `Pull Review keeps what was sent only for the last ${MAX_SENT_PROMPTS} questions in a chat.`)
      return {
        sections: [
          ...promptSections(prompt),
          { label: 'Files Claude could read', detail: 'They are rewritten on each message, so they now hold the latest version', text: prompt.files.join('\n') },
        ],
      }
    },

    async planCommits(ref, input) {
      const binary = await claudePath
      if (!binary)
        throw new ChatError(404, 'Claude Code is not installed.')
      const gitTools = createGitTools(host)
      const changes = await readLocalChanges(gitTools, ref, input.repoPath)
      if (!changes.files.length)
        throw new ChatError(400, 'There are no local changes to commit.')
      const recent = await gitTools.git(['log', '--max-count=20', '--format=%s'], changes.path)
      let budget = MAX_PLAN_DIFF_CHARS
      const files = changes.files.map((file) => {
        const diff = file.diff.slice(0, Math.max(0, Math.min(MAX_PLAN_FILE_DIFF_CHARS, budget)))
        budget -= diff.length
        return { path: file.path, status: file.status, diff, untracked: file.untracked, isBinary: file.isBinary }
      })
      const output = await runStructured({
        folder: 'commit-plans',
        prompt: buildCommitPlanPrompt({ title: input.title, branch: input.branch, recentSubjects: recent.stdout.split('\n').filter(Boolean), files }),
        systemPrompt: COMMIT_PLAN_SYSTEM_PROMPT,
        schema: COMMIT_PLAN_SCHEMA,
        model: input.model,
        effort: input.effort,
      })
      const plan = readCommitPlan(output.value)
      if (!plan)
        throw new ChatError(502, output.code === 0 ? 'Claude did not return a commit plan. Try again, or write the commits yourself.' : explainExit(output.code, output.stderr))
      return normalizeCommitPlan(plan, changes.files.map(splitInfo))
    },

    async resolveConflicts(input) {
      const output = await runStructured({
        folder: 'conflicts',
        prompt: buildResolvePrompt(input),
        systemPrompt: RESOLVE_SYSTEM_PROMPT,
        schema: RESOLVE_SCHEMA,
        model: input.model,
        effort: input.effort,
      })
      const result = readResolution(output.value, input.files.map(file => file.path))
      if ('error' in result)
        throw new ChatError(502, output.code === 0 ? result.error : explainExit(output.code, output.stderr))
      return result.files
    },

    async draftMergeRequest(input) {
      const output = await runStructured({
        folder: 'mr-drafts',
        prompt: buildMrDraftPrompt(input),
        systemPrompt: MR_DRAFT_SYSTEM_PROMPT,
        schema: MR_DRAFT_SCHEMA,
        model: input.model,
        effort: input.effort,
      })
      const draft = readMrDraft(output.value)
      if (!draft)
        throw new ChatError(502, output.code === 0 ? 'Claude did not return a title. Write it yourself.' : explainExit(output.code, output.stderr))
      return draft
    },

    async stop(ref) {
      const session = await sessionFor(ref)
      for (const message of session.messages) {
        if (message.status === 'streaming') {
          message.status = 'stopped'
          message.finishedAt = new Date().toISOString()
        }
      }
      session.turn?.kill()
      changed(session)
      void persist(session)
      return snapshot(session)
    },

    async reset(ref) {
      const session = await sessionFor(ref)
      session.turn?.kill()
      session.turn = null
      await host.remove(claudeProjectDir(ref)).catch(() => null)
      session.claudeSessionId = createId()
      session.started = false
      session.messages = []
      session.sent.clear()
      session.seenContext = {}
      session.turnCount = 0
      changed(session)
      await persist(session)
      return snapshot(session)
    },

    reviewState: (ref, since, waitMs) => reviews.state(ref, since, waitMs),

    runReview: (ref, load, input, postComment) => reviews.run(ref, input, async () => {
      const session = await sessionFor(ref)
      const mr = await load()
      const { dir } = await writeContext(session, mr)
      await ensureWorkspace(session, input.repoPath, mr.mergeRequest.diffRefs.headSha)
      return {
        contextDir: dir,
        worktreeDir: session.workspace.kind === 'ready' ? session.worktreeDir : null,
        title: mr.mergeRequest.title,
        headSha: mr.mergeRequest.diffRefs.headSha,
        diffRefs: mr.mergeRequest.diffRefs,
        files: mr.files,
      }
    }, postComment),

    stopReview: ref => reviews.stop(ref),

    setFindingStatus: (ref, ids, status) => reviews.setFindingStatus(ref, ids, status),

    setFindingDraft: (ref, id, draft) => reviews.setFindingDraft(ref, id, draft),

    async dispose() {
      clearInterval(idleTimer)
      reviews.dispose()
      for (const session of [...sessions.values()])
        await disposeSession(session)
      await workspaces.removeAll().catch(() => null)
    },
  }
}
