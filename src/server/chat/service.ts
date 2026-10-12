import type { ChatMessage, ChatSendInput, ChatState, ChatWorkspace } from '../../shared/chat'
import type { DiffFile, MergeRequest, MrRef } from '../../shared/types'
import type { ChatHost, StreamedProcess } from './host'
import { buildMrSummary, buildPatch, buildPrompt, buildSystemPrompt, EMPTY_CHAT_STATE } from '../../shared/chat'
import { mrKey } from '../../shared/mr-ref'
import { applyStreamLine, explainExit } from './claude-events'
import { findExecutable } from './host'
import { createWorkspaces, expandHome } from './workspace'

const IDLE_LIMIT_MS = 30 * 60_000
const IDLE_CHECK_MS = 60_000
const MAX_WAIT_MS = 20_000
const READ_ONLY_TOOLS = 'Read,Grep,Glob'
const REMOVED_ENV = ['ANTHROPIC_API_KEY', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']

export class ChatError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export interface MrSnapshot {
  mergeRequest: MergeRequest
  files: DiffFile[]
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
  lastUsed: number
  waiters: Set<() => void>
}

export interface ChatService {
  available: () => Promise<boolean>
  state: (ref: MrRef, since: number, waitMs: number) => Promise<ChatState>
  prepare: (ref: MrRef, load: () => Promise<MrSnapshot>, repoPath: string | null) => Promise<ChatState>
  send: (ref: MrRef, load: () => Promise<MrSnapshot>, input: ChatSendInput) => ChatState
  stop: (ref: MrRef) => ChatState
  reset: (ref: MrRef) => Promise<ChatState>
  dispose: () => Promise<void>
}

function createId() {
  return crypto.randomUUID()
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function createChatService(host: ChatHost): ChatService {
  const sessions = new Map<string, Session>()
  const workspaces = createWorkspaces(host)
  const claudePath = findExecutable(host, 'claude', [`${host.homeDir}/.local/bin`, `${host.homeDir}/.claude/local`])

  void workspaces.sweepStale()

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

  function sessionFor(ref: MrRef) {
    const key = mrKey(ref)
    let session = sessions.get(key)
    if (!session) {
      session = {
        ref,
        claudeSessionId: createId(),
        started: false,
        messages: [],
        version: 1,
        workspace: { kind: 'diff-only' },
        worktreeDir: null,
        workspaceTask: null,
        turn: null,
        turnCount: 0,
        lastUsed: Date.now(),
        waiters: new Set(),
      }
      sessions.set(key, session)
    }
    session.lastUsed = Date.now()
    return session
  }

  function claudeProjectDir(ref: MrRef) {
    return `${host.homeDir}/.claude/projects/${workspaces.contextDir(ref).replace(/[^a-z0-9]/gi, '-')}`
  }

  async function writeContext(ref: MrRef, mr: MrSnapshot) {
    const dir = workspaces.contextDir(ref)
    await host.makeDir(dir)
    await host.writeFile(`${dir}/merge-request.md`, buildMrSummary(mr.mergeRequest, mr.files))
    await host.writeFile(`${dir}/changes.diff`, buildPatch(mr.files))
    return dir
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

  async function claudeEnv() {
    const env = { ...await host.env() }
    for (const key of REMOVED_ENV)
      delete env[key]
    return env
  }

  async function runTurn(session: Session, reply: ChatMessage, load: () => Promise<MrSnapshot>, input: ChatSendInput) {
    const fail = (message: string) => {
      reply.status = 'error'
      reply.error = message
      session.turn = null
      changed(session)
    }
    try {
      const binary = await claudePath
      if (!binary)
        return fail('Claude Code is not installed.')
      const mr = await load()
      const contextDir = await writeContext(session.ref, mr)
      await ensureWorkspace(session, input.repoPath, mr.mergeRequest.diffRefs.headSha)
      if (reply.status !== 'streaming')
        return

      const worktreeDir = session.workspace.kind === 'ready' ? session.worktreeDir : null
      const promptFile = `${contextDir}/prompt-${++session.turnCount}.txt`
      await host.writeFile(promptFile, buildPrompt(input.text, input.contexts))

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
        READ_ONLY_TOOLS,
        '--setting-sources',
        '',
        '--strict-mcp-config',
        '--append-system-prompt',
        buildSystemPrompt({ mergeRequest: mr.mergeRequest, contextDir, worktreeDir }),
        ...(worktreeDir ? ['--add-dir', worktreeDir] : []),
        ...(session.started ? ['--resume', session.claudeSessionId] : ['--session-id', session.claudeSessionId]),
      ]

      let finished = false
      const pathPrefixes = [worktreeDir, contextDir].filter((dir): dir is string => Boolean(dir))
      const process = host.stream(args, {
        cwd: contextDir,
        stdinFile: promptFile,
        env: await claudeEnv(),
        onLine: (line) => {
          if (!session.started && line.includes('"subtype":"init"'))
            session.started = true
          const outcome = applyStreamLine(reply, line, pathPrefixes)
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
  }

  async function disposeSession(session: Session) {
    session.turn?.kill()
    sessions.delete(mrKey(session.ref))
    if (session.worktreeDir)
      await workspaces.removeWorktree(session.worktreeDir).catch(() => null)
    await host.remove(workspaces.contextDir(session.ref)).catch(() => null)
    await host.remove(claudeProjectDir(session.ref)).catch(() => null)
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
      const session = sessionFor(ref)
      if (session.version <= since) {
        await new Promise<void>((resolve) => {
          session.waiters.add(resolve)
          setTimeout(resolve, Math.min(MAX_WAIT_MS, Math.max(0, waitMs)))
        })
      }
      return snapshot(session)
    },

    async prepare(ref, load, repoPath) {
      const session = sessionFor(ref)
      if (repoPath?.trim()) {
        const mr = await load()
        void ensureWorkspace(session, repoPath, mr.mergeRequest.diffRefs.headSha)
      }
      else {
        void ensureWorkspace(session, null, '')
      }
      return snapshot(session)
    },

    send(ref, load, input) {
      if (!input.text.trim())
        throw new ChatError(400, 'The message is empty.')
      const session = sessionFor(ref)
      if (session.turn || session.messages.some(message => message.status === 'streaming'))
        throw new ChatError(409, 'Claude is still answering. Wait for it to finish or stop it.')
      session.messages.push({ id: createId(), role: 'user', text: input.text.trim(), contexts: input.contexts, tools: [], status: 'done', error: null })
      const reply: ChatMessage = { id: createId(), role: 'assistant', text: '', contexts: [], tools: [], status: 'streaming', error: null }
      session.messages.push(reply)
      changed(session)
      void runTurn(session, reply, load, input)
      return snapshot(session)
    },

    stop(ref) {
      const session = sessions.get(mrKey(ref))
      if (!session)
        return EMPTY_CHAT_STATE
      for (const message of session.messages) {
        if (message.status === 'streaming')
          message.status = 'stopped'
      }
      session.turn?.kill()
      changed(session)
      return snapshot(session)
    },

    async reset(ref) {
      const session = sessions.get(mrKey(ref))
      if (!session)
        return EMPTY_CHAT_STATE
      session.turn?.kill()
      session.turn = null
      await host.remove(claudeProjectDir(ref)).catch(() => null)
      session.claudeSessionId = createId()
      session.started = false
      session.messages = []
      changed(session)
      return snapshot(session)
    },

    async dispose() {
      clearInterval(idleTimer)
      for (const session of [...sessions.values()])
        await disposeSession(session)
      await workspaces.removeAll().catch(() => null)
    },
  }
}
