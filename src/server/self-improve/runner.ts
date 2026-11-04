import type { ChatMessage } from '../../shared/chat'
import type { ChangeRun, ChangeStatus, LocalChange } from '../../shared/self-improve'
import type { LocalHost, StreamedProcess } from '../local/host'
import type { OverlayStore } from './overlay'
import { buildChangePrompt, buildChangeSystemPrompt, buildFollowUpPrompt } from '../../shared/self-improve-prompt'
import { applyStreamLine, explainExit } from '../chat/claude-events'
import { claudeEnv } from '../local/claude'

export const RUN_TIMEOUT_MS = 30 * 60_000

const CHECKED_MODULE = /^build\/.+\.m?js$/
const APP_BACKEND_FILE = /^build\/app-backend\//
const PAGE_FILE = /^build\/(?:app-web|web)\//

export interface ChangeRunnerOptions {
  host: LocalHost
  overlay: OverlayStore
  version: string
  parts: string[]
  claudePath: Promise<string | null>
  attachmentDir: (id: string) => string
  screenshotPath: (id: string) => string
  readChanges: () => Promise<LocalChange[]>
  updateChanges: <T>(mutate: (changes: LocalChange[]) => T) => Promise<T>
  probeBackend?: (overlayDir: string) => Promise<string | null>
  timeoutMs?: number
}

interface CurrentRun {
  changeId: string
  message: ChatMessage
  process: StreamedProcess | null
  stopped: boolean
}

export type ChangeRunner = ReturnType<typeof createChangeRunner>

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function commitMessage(change: LocalChange) {
  const firstLine = change.request.split('\n', 1)[0]!.trim()
  const title = firstLine.length > 72 ? `${firstLine.slice(0, 71)}…` : firstLine
  return `${title}\n\n${change.request}\n\nRequest: ${change.id}`
}

export function createChangeRunner(options: ChangeRunnerOptions) {
  const { host, overlay } = options
  let current: CurrentRun | null = null
  let looping: Promise<void> | null = null
  let again = false

  function patch(id: string, fields: Partial<LocalChange>) {
    return options.updateChanges((changes) => {
      const change = changes.find(item => item.id === id)
      if (change)
        Object.assign(change, fields)
      return change ?? null
    })
  }

  function finish(id: string, status: ChangeStatus, fields: Partial<LocalChange> = {}) {
    return patch(id, { error: null, followUp: null, ...fields, status, finishedAt: new Date().toISOString() })
  }

  async function check(dir: string, files: string[]): Promise<string | null> {
    for (const file of files.filter(path => CHECKED_MODULE.test(path))) {
      if (!await host.exists(`${dir}/${file}`))
        continue
      const problem = await host.checkModuleSyntax(`${dir}/${file}`)
      if (problem)
        return `${file} has a syntax error:\n${problem}`
    }
    if (options.probeBackend && files.some(file => APP_BACKEND_FILE.test(file)))
      return options.probeBackend(dir)
    return null
  }

  function promptFor(change: LocalChange, resume: boolean) {
    if (resume)
      return buildFollowUpPrompt(change.followUp!)
    const prompt = buildChangePrompt(change, change.hasScreenshot ? options.screenshotPath(change.id) : null)
    return change.followUp ? `${prompt}\n\n${buildFollowUpPrompt(change.followUp)}` : prompt
  }

  async function run(change: LocalChange) {
    const resume = Boolean(change.followUp && change.sessionId)
    const sessionId = resume ? change.sessionId! : crypto.randomUUID()
    const message: ChatMessage = { id: change.id, role: 'assistant', text: '', contexts: [], tools: [], status: 'streaming', error: null }
    const run: CurrentRun = { changeId: change.id, message, process: null, stopped: false }
    current = run
    const promptFile = `${options.attachmentDir(change.id)}/prompt.txt`
    try {
      await patch(change.id, { status: 'working', startedAt: new Date().toISOString(), sessionId, error: null })
      const binary = await options.claudePath
      if (!binary)
        return await finish(change.id, 'needs-you', { error: 'Claude Code is not installed.' })

      const dir = await overlay.ensure()
      await overlay.discard()
      await host.makeDir(options.attachmentDir(change.id))
      await host.writeFile(promptFile, promptFor(change, resume))

      let finished = false
      const process = host.stream([
        binary,
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--permission-mode',
        'acceptEdits',
        '--append-system-prompt',
        buildChangeSystemPrompt(options.parts),
        ...(resume ? ['--resume', sessionId] : ['--session-id', sessionId]),
        '--add-dir',
        options.attachmentDir(change.id),
      ], {
        cwd: dir,
        stdinFile: promptFile,
        env: await claudeEnv(host),
        onLine: (line) => {
          finished = applyStreamLine(message, line, { repo: dir }).finished || finished
        },
      })
      run.process = process
      const timer = setTimeout(() => process.kill(), options.timeoutMs ?? RUN_TIMEOUT_MS)
      const { code, stderr } = await process.exited
      clearTimeout(timer)

      const summary = message.text.trim() || null
      if (run.stopped) {
        await overlay.discard()
        return await finish(change.id, 'dismissed', { summary })
      }
      if (!finished || message.status === 'error') {
        await overlay.discard()
        return await finish(change.id, 'needs-you', { summary, error: finished ? message.error : explainExit(code, stderr) })
      }
      const files = await overlay.changedFiles()
      if (!files.length)
        return await finish(change.id, 'needs-you', { summary })
      const problem = await check(dir, files)
      if (problem) {
        await overlay.discard()
        return await finish(change.id, 'needs-you', { summary, error: problem })
      }
      const sha = await overlay.commit(commitMessage(change))
      await overlay.setActive(true)
      return await finish(change.id, 'ready', {
        summary,
        needsReload: true,
        commits: sha ? [...change.commits, sha] : change.commits,
        touchesBackend: change.touchesBackend || files.some(file => file.startsWith('build/') && !PAGE_FILE.test(file)),
      })
    }
    catch (error) {
      await overlay.discard().catch(() => null)
      return await finish(change.id, 'needs-you', { error: errorMessage(error) })
    }
    finally {
      current = null
      await host.remove(promptFile).catch(() => null)
    }
  }

  async function loop() {
    for (;;) {
      const next = (await options.readChanges()).find(change => change.status === 'queued' && change.version === options.version)
      if (!next)
        return
      await run(next)
    }
  }

  function kick() {
    again = true
    looping ??= (async () => {
      while (again) {
        again = false
        await loop()
      }
    })().finally(() => {
      looping = null
    })
    return looping
  }

  async function start() {
    await options.updateChanges((changes) => {
      for (const change of changes) {
        if (change.status === 'working')
          Object.assign(change, { status: 'queued', startedAt: null })
      }
    })
    return kick()
  }

  function stop(id: string) {
    if (current?.changeId !== id)
      return false
    current.stopped = true
    current.process?.kill()
    return true
  }

  function progress(): ChangeRun | null {
    return current ? { changeId: current.changeId, text: current.message.text, tools: current.message.tools } : null
  }

  return { kick, start, stop, progress, busy: () => current !== null }
}
