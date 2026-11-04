import type { BootFailure, FeedbackContext, LocalChange, RunningBuild, SelfImproveState } from '../../shared/self-improve'
import type { GitTools } from '../local/git'
import type { LocalHost } from '../local/host'
import type { OverlayConfig } from './overlay'
import { BOOT_FAILURE_FILE, NEEDS_YOU_STATUSES, OPEN_STATUSES, pngBytes, reloadKind } from '../../shared/self-improve'
import { findClaude } from '../local/claude'
import { createOverlayStore } from './overlay'
import { createChangeRunner } from './runner'

export const MAX_REQUEST_LENGTH = 4000

export class SelfImproveError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message)
  }
}

export interface NewChange {
  request: string
  context: FeedbackContext
}

const DISMISSABLE = new Set([...OPEN_STATUSES, ...NEEDS_YOU_STATUSES])

export interface SelfImproveOptions {
  claudePath?: Promise<string | null>
  probeBackend?: (overlayDir: string) => Promise<string | null>
  running?: () => RunningBuild
  timeoutMs?: number
}

export type SelfImproveService = ReturnType<typeof createSelfImproveService>

export function createSelfImproveService(host: LocalHost, tools: GitTools, config: OverlayConfig, options: SelfImproveOptions = {}) {
  const overlay = createOverlayStore(host, tools, config)
  const changesFile = `${config.root}/changes.json`
  const bootFailureFile = `${config.root}/${BOOT_FAILURE_FILE}`
  let queue: Promise<unknown> = Promise.resolve()

  function attachmentDir(id: string) {
    return `${config.root}/attachments/${id}`
  }

  function screenshotPath(id: string) {
    return `${attachmentDir(id)}/screenshot.png`
  }

  async function readChanges(): Promise<LocalChange[]> {
    const text = await host.readFile(changesFile)
    if (!text)
      return []
    try {
      return JSON.parse(text) as LocalChange[]
    }
    catch {
      return []
    }
  }

  function updateChanges<T>(mutate: (changes: LocalChange[]) => T): Promise<T> {
    const run = queue.then(async () => {
      const changes = await readChanges()
      const result = mutate(changes)
      await host.makeDir(config.root)
      await host.writeFile(changesFile, `${JSON.stringify(changes, null, 2)}\n`)
      return result
    })
    queue = run.catch(() => undefined)
    return run
  }

  async function readBootFailure(): Promise<BootFailure | null> {
    const text = await host.readFile(bootFailureFile)
    try {
      return text ? JSON.parse(text) as BootFailure : null
    }
    catch {
      return null
    }
  }

  async function state(): Promise<SelfImproveState> {
    const [active, exists, bootFailure, changes] = await Promise.all([
      overlay.isActive(),
      host.exists(`${overlay.dir}/.git`),
      readBootFailure(),
      readChanges(),
    ])
    const running = options.running?.() ?? { overlay: false, canRestart: false }
    return { active, overlayDir: exists ? overlay.dir : null, bootFailure, changes, run: runner.progress(), reload: reloadKind(changes, running) }
  }

  async function create({ request, context }: NewChange): Promise<LocalChange> {
    const text = request.trim()
    if (!text)
      throw new SelfImproveError('Write what should change.')
    if (text.length > MAX_REQUEST_LENGTH)
      throw new SelfImproveError(`Keep the request under ${MAX_REQUEST_LENGTH} characters.`)
    const id = crypto.randomUUID()
    const screenshot = context.screenshot ? pngBytes(context.screenshot) : null
    if (screenshot) {
      await host.makeDir(attachmentDir(id))
      await host.writeBinary(screenshotPath(id), screenshot)
    }
    const change: LocalChange = {
      id,
      request: text,
      context: { ...context, screenshot: null },
      hasScreenshot: Boolean(screenshot),
      touchesBackend: false,
      version: config.version,
      status: 'queued',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      commits: [],
      sessionId: null,
      summary: null,
      error: null,
    }
    await updateChanges(changes => changes.push(change))
    void runner.kick()
    return change
  }

  function dismiss(id: string) {
    return updateChanges((changes) => {
      const change = changes.find(item => item.id === id)
      if (!change)
        throw new SelfImproveError('This request no longer exists.', 404)
      if (!DISMISSABLE.has(change.status))
        throw new SelfImproveError('Only waiting or failed requests can be dismissed.', 409)
      if (runner.stop(id))
        return change
      change.status = 'dismissed'
      change.finishedAt = new Date().toISOString()
      return change
    })
  }

  function markApplied() {
    return updateChanges((changes) => {
      for (const change of changes) {
        if (change.status === 'ready' && change.version === config.version)
          change.status = 'applied'
      }
    })
  }

  function markBroken(reason: string) {
    return updateChanges((changes) => {
      const ours = changes.filter(change => change.version === config.version)
      const culprit = ours.findLast(change => change.status === 'ready') ?? ours.findLast(change => change.status === 'applied')
      if (culprit)
        Object.assign(culprit, { status: 'broke-app', error: reason })
      return culprit ?? null
    })
  }

  async function setActive(on: boolean) {
    if (on && !await host.exists(`${overlay.dir}/.git`))
      throw new SelfImproveError('There are no local changes for this version yet.', 409)
    await overlay.setActive(on)
    if (on)
      await host.remove(bootFailureFile)
  }

  const runner = createChangeRunner({
    host,
    overlay,
    version: config.version,
    parts: config.parts.map(part => part.name),
    claudePath: options.claudePath ?? findClaude(host),
    attachmentDir,
    screenshotPath,
    readChanges,
    updateChanges,
    probeBackend: options.probeBackend,
    timeoutMs: options.timeoutMs,
  })

  return {
    overlay,
    start: runner.start,
    runQueue: runner.kick,
    state,
    create,
    dismiss,
    markApplied,
    markBroken,
    setActive,
    updateChanges,
    screenshotPath,
    clearBootFailure: () => host.remove(bootFailureFile),
    openFolder: () => host.launch(['/usr/bin/open', config.root], {}),
  }
}
