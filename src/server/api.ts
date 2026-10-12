import type { Context } from 'hono'
import type { DiffRefs, MrListState, MrRef, NewDiffComment, ProjectRef } from '../shared/types'
import type { ChatSendInput } from '../shared/chat'
import type { ChatService } from './chat/service'
import type { GitlabClient } from './gitlab'
import type { LocalHost } from './local/host'
import { Hono } from 'hono'
import { ChatError } from './chat/service'
import { EditorError, editorStatus, openInEditor } from './local/editor'
import { createGitTools, expandHome, GitError } from './local/git'
import { createRepoLinks } from './local/repo-link'
import { grepSymbol } from './local/symbols'
import { isSearchableSymbol } from '../shared/symbols'
import { createGitlabClient, GitlabError } from './gitlab'
import { createGitlabProjectClient } from './gitlab-project'
import { fileIconName, folderIconName, renderIcon } from './icons'
import type { TokenResolver } from './token-core'
import { tokenHelp } from './token-core'

export const API_HEADER = 'x-pull-review'


export interface ApiOptions {
  initialPath?: string
  localRepo?: () => Promise<LocalRepo | null>
  resolveToken: TokenResolver
  chat?: ChatService
  host?: LocalHost
}

export interface LocalRepo {
  host: string
  project: string
  path: string
}

type Env = { Variables: { client: GitlabClient, projectClient: ReturnType<typeof createGitlabProjectClient> } }

const LIST_STATES = new Set<MrListState>(['opened', 'merged', 'closed', 'all'])
const MAX_LIST_LIMIT = 500

function readProjectRef(c: Context): ProjectRef | null {
  const host = c.req.query('host')
  const project = c.req.query('project')
  if (!host || !project || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host))
    return null
  return { host, project }
}

function readRef(c: Context): MrRef | null {
  const project = readProjectRef(c)
  const iid = Number(c.req.query('iid'))
  if (!project || !Number.isInteger(iid) || iid <= 0)
    return null
  return { ...project, iid }
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
}

function contentTypeFor(path: string, upstream: string | null) {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return IMAGE_TYPES[extension] ?? upstream ?? 'application/octet-stream'
}

function readIds(value: string | undefined): number[] {
  return (value ?? '').split(',').map(Number).filter(id => Number.isInteger(id) && id > 0)
}

function errorResponse(c: Context, error: unknown) {
  if (error instanceof GitlabError || error instanceof ChatError)
    return c.json({ error: error.message }, error.status as 400)
  if (error instanceof GitError || error instanceof EditorError)
    return c.json({ error: error.message }, 400)
  const message = error instanceof Error ? error.message : String(error)
  return c.json({ error: message }, 500)
}

export function createApi(options: ApiOptions) {
  const app = new Hono<Env>()

  const api = new Hono<Env>()

  api.use('*', async (c, next) => {
    if (c.req.header(API_HEADER) !== '1')
      return c.json({ error: 'Missing request header' }, 403)
    await next()
  })

  api.get('/config', async c => c.json({
    initialPath: options.initialPath ?? null,
    localRepo: await options.localRepo?.().catch(() => null) ?? null,
  }))

  api.get('/chat/status', async c => c.json({ available: Boolean(await options.chat?.available()) }))

  const host = options.host
  const gitTools = host ? createGitTools(host) : null
  const repoLinks = host && gitTools ? createRepoLinks(host, gitTools) : null

  api.post('/local/inspect', async (c) => {
    if (!repoLinks)
      return c.json({ error: 'Local repositories are not available here.' }, 404)
    const input = await c.req.json<{ path: string, project: string }>()
    if (!input.path || !input.project)
      return c.json({ error: 'Expected path and project' }, 400)
    return c.json(await repoLinks.inspect(input.path, { project: input.project }))
  })

  api.post('/local/worktree', async (c) => {
    if (!repoLinks)
      return c.json({ error: 'Local repositories are not available here.' }, 404)
    const input = await c.req.json<{ sourcePath: string, targetPath: string, project: string }>()
    if (!input.sourcePath || !input.targetPath || !input.project)
      return c.json({ error: 'Expected sourcePath, targetPath and project' }, 400)
    return c.json(await repoLinks.createWorktree(input.sourcePath, input.targetPath, { project: input.project }))
  })

  api.get('/editor', async (c) => {
    if (!host)
      return c.json({ detected: null, installed: [] })
    return c.json(await editorStatus(host))
  })

  api.post('/editor/open', async (c) => {
    if (!host)
      return c.json({ error: 'Opening files in an editor is not available here.' }, 404)
    const input = await c.req.json<{ repoPath: string, path: string, line: number, column: number, editor: string }>()
    const segments = String(input.path ?? '').split('/')
    if (!input.repoPath || !input.path || segments.includes('..') || input.path.startsWith('/'))
      return c.json({ error: 'Expected a repository folder and a file path inside it.' }, 400)
    const workspace = expandHome(input.repoPath, host.homeDir)
    const editor = await openInEditor(host, {
      workspace,
      file: `${workspace}/${input.path}`,
      line: Math.max(1, Number(input.line) || 1),
      column: Math.max(1, Number(input.column) || 1),
      editor: String(input.editor || 'auto'),
    })
    return c.json({ editor })
  })

  api.use('/mr/*', async (c, next) => {
    const ref = readRef(c)
    if (!ref)
      return c.json({ error: 'Expected host, project and iid query parameters' }, 400)
    const token = await options.resolveToken(ref.host)
    if (!token)
      return c.json({ error: tokenHelp(ref.host), code: 'missing-token' }, 401)
    c.set('client', createGitlabClient(ref, token.token))
    await next()
  })

  api.use('/project/*', async (c, next) => {
    const ref = readProjectRef(c)
    if (!ref)
      return c.json({ error: 'Expected host and project query parameters' }, 400)
    const token = await options.resolveToken(ref.host)
    if (!token)
      return c.json({ error: tokenHelp(ref.host), code: 'missing-token' }, 401)
    c.set('projectClient', createGitlabProjectClient(ref, token.token))
    await next()
  })

  api.get('/project/info', async c => c.json(await c.var.projectClient.project()))

  api.get('/project/avatar', async (c) => {
    const upstream = await c.var.projectClient.avatar()
    if (!upstream)
      return c.json({ error: 'Not found' }, 404)
    const upstreamType = upstream.headers.get('content-type')
    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstreamType?.startsWith('image/') ? upstreamType : 'image/png',
        'Cache-Control': 'private, max-age=86400',
      },
    })
  })

  api.get('/project/viewer', async c => c.json(await c.var.projectClient.viewer()))

  api.get('/project/members', async c => c.json(await c.var.projectClient.members()))

  api.get('/project/merge-requests', async (c) => {
    const state = c.req.query('state') as MrListState
    if (!LIST_STATES.has(state))
      return c.json({ error: 'Unknown state' }, 400)
    const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, Number(c.req.query('limit')) || 20))
    return c.json(await c.var.projectClient.mergeRequests({
      state,
      limit,
      authorIds: readIds(c.req.query('authorIds')),
      reviewerId: readIds(c.req.query('reviewerId'))[0],
      search: c.req.query('search')?.trim() || undefined,
    }))
  })

  api.get('/project/counts', async c => c.json(await c.var.projectClient.counts(readIds(c.req.query('authorIds')))))

  api.get('/mr', async (c) => {
    const client = c.var.client
    const [mergeRequest, files, viewer] = await Promise.all([client.mergeRequest(), client.diffs(), client.viewer()])
    return c.json({ mergeRequest, files, viewer })
  })

  api.get('/mr/discussions', async c => c.json(await c.var.client.discussions()))

  api.get('/mr/approvals', async c => c.json(await c.var.client.approvals()))

  api.post('/mr/approve', async (c) => {
    await c.var.client.approve()
    return c.json({ ok: true })
  })

  api.post('/mr/unapprove', async (c) => {
    await c.var.client.unapprove()
    return c.json({ ok: true })
  })

  api.post('/mr/discussions', async (c) => {
    const input = await c.req.json<{ body: string, diffRefs: DiffRefs, comment?: NewDiffComment }>()
    if (!input.body?.trim())
      return c.json({ error: 'Comment is empty' }, 400)
    return c.json(await c.var.client.createDiscussion(input.body, input.diffRefs, input.comment))
  })

  api.post('/mr/discussions/:id/notes', async (c) => {
    const { body } = await c.req.json<{ body: string }>()
    if (!body?.trim())
      return c.json({ error: 'Reply is empty' }, 400)
    return c.json(await c.var.client.reply(c.req.param('id'), body))
  })

  api.put('/mr/discussions/:id/resolve', async (c) => {
    const { resolved } = await c.req.json<{ resolved: boolean }>()
    return c.json(await c.var.client.resolve(c.req.param('id'), resolved))
  })

  api.put('/mr/discussions/:id/notes/:noteId', async (c) => {
    const { body } = await c.req.json<{ body: string }>()
    return c.json(await c.var.client.editNote(c.req.param('id'), Number(c.req.param('noteId')), body))
  })

  api.delete('/mr/discussions/:id/notes/:noteId', async (c) => {
    await c.var.client.deleteNote(c.req.param('id'), Number(c.req.param('noteId')))
    return c.json({ ok: true })
  })

  api.get('/mr/blob', async (c) => {
    const path = c.req.query('path')
    const sha = c.req.query('sha')
    if (!path || !sha || !/^[0-9a-f]{7,64}$/i.test(sha))
      return c.json({ error: 'Expected path and sha' }, 400)
    const upstream = await c.var.client.blob(path, sha)
    if (!upstream)
      return c.json({ error: 'Not found' }, 404)
    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentTypeFor(path, upstream.headers.get('content-type')),
        'Cache-Control': 'private, max-age=86400, immutable',
      },
    })
  })

  api.get('/mr/bundle', async (c) => {
    const jobName = c.req.query('job')?.trim()
    const baseBranch = c.req.query('base')?.trim()
    if (!jobName || !baseBranch)
      return c.json({ error: 'Expected job and base query parameters' }, 400)
    return c.json(await c.var.client.bundleArtifacts({
      jobName,
      baseBranch,
      analysisPath: c.req.query('analysis') ?? '',
      modulesPath: c.req.query('modules') ?? '',
    }))
  })

  api.post('/mr/file-contents', async (c) => {
    const input = await c.req.json<{ diffRefs: DiffRefs, oldPath: string | null, newPath: string | null }>()
    return c.json(await c.var.client.fileContents(input.diffRefs, input.oldPath, input.newPath))
  })

  api.use('/mr/chat/*', async (c, next) => {
    if (!options.chat || !await options.chat.available())
      return c.json({ error: 'Claude Code is not installed.' }, 404)
    await next()
  })

  function chatService() {
    return options.chat!
  }

  function loadSnapshot(client: GitlabClient) {
    return async () => {
      const [mergeRequest, files] = await Promise.all([client.mergeRequest(), client.diffs()])
      return { mergeRequest, files }
    }
  }

  function chatRef(c: Context) {
    return readRef(c)!
  }

  api.post('/mr/local/checkout', async (c) => {
    if (!repoLinks)
      return c.json({ error: 'Local repositories are not available here.' }, 404)
    const { repoPath } = await c.req.json<{ repoPath: string }>()
    if (!repoPath)
      return c.json({ error: 'Expected repoPath' }, 400)
    const mergeRequest = await c.var.client.mergeRequest()
    return c.json(await repoLinks.checkout(repoPath, readRef(c)!, mergeRequest.sourceBranch, mergeRequest.diffRefs.headSha))
  })

  api.get('/mr/symbols', async (c) => {
    if (!gitTools)
      return c.json({ error: 'Searching a local repository is not available here.' }, 404)
    const name = c.req.query('name') ?? ''
    const sha = c.req.query('sha') ?? ''
    const repoPath = c.req.query('repoPath') ?? ''
    if (!isSearchableSymbol(name) || !/^[0-9a-f]{7,64}$/i.test(sha) || !repoPath)
      return c.json({ error: 'Expected name, sha and repoPath query parameters' }, 400)
    return c.json(await grepSymbol(gitTools, { ref: readRef(c)!, repoPath, sha, name }))
  })

  api.get('/mr/chat/state', async (c) => {
    const since = Number(c.req.query('since')) || 0
    const wait = Number(c.req.query('wait')) || 0
    return c.json(await chatService().state(chatRef(c), since, wait))
  })

  api.post('/mr/chat/prepare', async (c) => {
    const { repoPath } = await c.req.json<{ repoPath: string | null }>()
    return c.json(await chatService().prepare(chatRef(c), loadSnapshot(c.var.client), repoPath))
  })

  api.post('/mr/chat/messages', async (c) => {
    const input = await c.req.json<ChatSendInput>()
    return c.json(chatService().send(chatRef(c), loadSnapshot(c.var.client), {
      text: String(input.text ?? ''),
      contexts: Array.isArray(input.contexts) ? input.contexts : [],
      repoPath: input.repoPath ?? null,
    }))
  })

  api.post('/mr/chat/stop', async c => c.json(chatService().stop(chatRef(c))))

  api.post('/mr/chat/reset', async c => c.json(await chatService().reset(chatRef(c))))

  api.onError((error, c) => errorResponse(c, error))
  app.route('/api', api)

  app.get('/icons/:kind/:name', (c) => {
    const kind = c.req.param('kind')
    const name = c.req.param('name')
    const theme = c.req.query('theme') === 'light' ? 'light' : 'dark'
    if (kind !== 'file' && kind !== 'folder')
      return c.notFound()
    const svg = renderIcon(kind === 'file' ? fileIconName(name, theme) : folderIconName(name, c.req.query('open') === '1', theme))
    if (!svg)
      return c.notFound()
    return c.body(svg, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=604800' })
  })

  return app
}
