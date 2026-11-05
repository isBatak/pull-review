import type { BootFailure, ChangeDiffFile, ChangeStatus, FeedbackContext, LocalChange, RunningBuild, SelfImproveState } from '../../shared/self-improve'
import type { GitTools } from '../local/git'
import type { LocalHost } from '../local/host'
import type { OverlayConfig } from './overlay'
import { BOOT_FAILURE_FILE, NEEDS_YOU_STATUSES, NEW_CHANGE_FIELDS, OPEN_STATUSES, pngBytes, reloadKind } from '../../shared/self-improve'
import { splitPatchByFile } from '../local/changes'
import { issueUrl, SELF_IMPROVE_REPO } from '../../shared/self-improve-pr'
import { findClaude } from '../local/claude'
import { findExecutable } from '../local/host'
import { createOverlayStore } from './overlay'
import { createPullRequests } from './pull-request'
import { createChangeRunner } from './runner'

export const MAX_REQUEST_LENGTH = 4000
export const MAX_SHOWN_DIFF_LENGTH = 100_000

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
const REPLYABLE = new Set<ChangeStatus>([...NEEDS_YOU_STATUSES, 'ready', 'applied'])
const UNDOABLE = new Set<ChangeStatus>(['ready', 'applied', 'broke-app'])
const SENDABLE = new Set<ChangeStatus>(['ready', 'applied'])

export interface SelfImproveOptions {
  claudePath?: Promise<string | null>
  probeBackend?: (overlayDir: string) => Promise<string | null>
  running?: () => RunningBuild
  timeoutMs?: number
  gh?: Promise<string | null>
  remoteUrl?: (repo: string) => string
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
      return (JSON.parse(text) as LocalChange[]).map(change => ({ ...NEW_CHANGE_FIELDS, ...change }))
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
      version: config.version,
      status: 'queued',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      commits: [],
      sessionId: null,
      summary: null,
      error: null,
      ...NEW_CHANGE_FIELDS,
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

  function requireText(text: string) {
    const trimmed = text.trim()
    if (!trimmed)
      throw new SelfImproveError('Write a reply first.')
    if (trimmed.length > MAX_REQUEST_LENGTH)
      throw new SelfImproveError(`Keep the reply under ${MAX_REQUEST_LENGTH} characters.`)
    return trimmed
  }

  function findChange(changes: LocalChange[], id: string) {
    const change = changes.find(item => item.id === id)
    if (!change)
      throw new SelfImproveError('This request no longer exists.', 404)
    if (change.version !== config.version)
      throw new SelfImproveError(`This request was made on version ${change.version}. It moves to this version when the app updates its local changes.`, 409)
    return change
  }

  async function reply(id: string, text: string) {
    const reply = requireText(text)
    const change = await updateChanges((changes) => {
      const change = findChange(changes, id)
      if (!REPLYABLE.has(change.status))
        throw new SelfImproveError('You can reply once Claude has finished.', 409)
      change.replies.push({ text: reply, at: new Date().toISOString() })
      Object.assign(change, { followUp: reply, status: 'queued', error: null })
      return change
    })
    void runner.kick()
    return change
  }

  async function retry(id: string) {
    const change = await updateChanges((changes) => {
      const change = findChange(changes, id)
      if (change.status !== 'needs-you')
        throw new SelfImproveError('Only requests that need you can be tried again.', 409)
      Object.assign(change, { status: 'queued', sessionId: null, followUp: null, summary: null, error: null })
      return change
    })
    void runner.kick()
    return change
  }

  async function undo(id: string) {
    if (runner.busy())
      throw new SelfImproveError('Wait until Claude finishes the current request, then undo.', 409)
    const change = findChange(await readChanges(), id)
    if (!UNDOABLE.has(change.status) || !change.commits.length)
      throw new SelfImproveError('Only finished changes can be undone.', 409)
    const result = await overlay.revert(change.commits)
    if (!result.ok)
      throw new SelfImproveError('A later change builds on this one. Undo the later change first.', 409)
    if (change.status === 'broke-app') {
      await overlay.setActive(true)
      await host.remove(bootFailureFile)
    }
    return updateChanges((changes) => {
      const current = findChange(changes, id)
      Object.assign(current, { status: 'undone', needsReload: true, error: null, finishedAt: new Date().toISOString() })
      return current
    })
  }

  async function diff(id: string): Promise<ChangeDiffFile[]> {
    const change = findChange(await readChanges(), id)
    const files: ChangeDiffFile[] = []
    for (const commit of change.commits) {
      for (const [path, patch] of splitPatchByFile(await overlay.commitDiff(commit))) {
        const area = path.startsWith('source/') ? 'source' : 'build'
        files.push({ commit, area, path: path.replace(/^(?:source|build)\//, ''), diff: patch.length > MAX_SHOWN_DIFF_LENGTH ? null : patch })
      }
    }
    return files
  }

  async function sendPr(id: string) {
    const changes = await readChanges()
    const change = findChange(changes, id)
    if (!SENDABLE.has(change.status) || !change.commits.length)
      throw new SelfImproveError('Only finished changes can be sent as a pull request.', 409)
    const earlier = changes.slice(0, changes.indexOf(change)).filter(item => item.version === config.version && SENDABLE.has(item.status))
    const pr = await pullRequests.send(change, earlier)
    return updateChanges((all) => {
      const current = findChange(all, id)
      current.pr = pr
      return current
    })
  }

  async function patch(id: string) {
    const change = findChange(await readChanges(), id)
    const text = await pullRequests.patch(change)
    return { patch: text, issueUrl: issueUrl(change, text) }
  }

  async function refreshPrs() {
    const open = (await readChanges()).filter(change => change.pr?.state === 'open')
    const states = new Map<string, NonNullable<LocalChange['pr']>['state']>()
    for (const change of open)
      states.set(change.id, await pullRequests.state(change.pr!).catch(() => change.pr!.state))
    return updateChanges((changes) => {
      for (const change of changes) {
        const next = states.get(change.id)
        if (change.pr && next)
          change.pr.state = next
      }
    })
  }

  function markApplied() {
    return updateChanges((changes) => {
      for (const change of changes) {
        if (!change.needsReload || change.version !== config.version)
          continue
        change.needsReload = false
        if (change.status === 'ready')
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

  const pullRequests = createPullRequests({
    host,
    tools,
    overlay,
    repo: SELF_IMPROVE_REPO,
    workDir: `${host.cacheDir}/self-improve`,
    gh: options.gh ?? findExecutable(host, 'gh'),
    remoteUrl: options.remoteUrl,
  })

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
    reply,
    retry,
    undo,
    diff,
    sendPr,
    patch,
    refreshPrs,
    markApplied,
    markBroken,
    setActive,
    updateChanges,
    screenshotPath,
    clearBootFailure: () => host.remove(bootFailureFile),
    openFolder: () => host.launch(['/usr/bin/open', config.root], {}),
  }
}
