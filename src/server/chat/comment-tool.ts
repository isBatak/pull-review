import type { DiffFile } from '../../shared/types'
import { COMMENT_TOOL_NAME, COMMENT_TOOL_SERVER } from '../../shared/comment-proposals'
import { shownLines } from '../../shared/line-map'

export interface CommentToolFile {
  path: string
  previousPath: string | null
  additions: number[]
  deletions: number[]
}

export interface CommentToolFiles {
  script: string
  targets: string
  config: string
}

export function commentToolTargets(files: Pick<DiffFile, 'path' | 'previousPath' | 'diff'>[]): CommentToolFile[] {
  return files.map(file => ({ path: file.path, previousPath: file.previousPath, ...shownLines(file.diff) }))
}

export function commentToolConfig(runner: string[], scriptFile: string) {
  return JSON.stringify({
    mcpServers: {
      [COMMENT_TOOL_SERVER]: { type: 'stdio', command: runner[0], args: [...runner.slice(1), scriptFile] },
    },
  })
}

const TOOL = {
  name: COMMENT_TOOL_NAME,
  description: 'Add a review comment on one line of the merge request diff. The comment opens as a draft in Pull Review, where the developer edits and posts it to GitLab. Call it once per comment. Do not repeat the comment text in your answer.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the repository root.' },
      line: { type: 'integer', description: 'Line number in the version given by side. It must be a line shown in the diff.' },
      side: { type: 'string', enum: ['new', 'old'], description: 'new for a line in the new version of the file (added or unchanged lines), old for a removed line. Defaults to new.' },
      body: { type: 'string', description: 'The comment in Markdown, written to the merge request author, who has not seen the chat. It may include a GitLab ```suggestion block that replaces the commented line.' },
    },
    required: ['path', 'line', 'body'],
  },
}

export function commentToolScript(targetsFile: string) {
  return `const TARGETS_FILE = ${JSON.stringify(targetsFile)}
const TOOL = ${JSON.stringify(TOOL)}
const isTjs = typeof tjs !== 'undefined'
const encoder = new TextEncoder()
const writer = isTjs ? tjs.stdout.getWriter() : null

async function send(message) {
  const text = JSON.stringify(message) + '\\n'
  if (writer)
    await writer.write(encoder.encode(text))
  else
    process.stdout.write(text)
}

async function readTargets() {
  if (isTjs)
    return JSON.parse(new TextDecoder().decode(await tjs.readFile(TARGETS_FILE)))
  const fs = await import('node:fs/promises')
  return JSON.parse(await fs.readFile(TARGETS_FILE, 'utf8'))
}

function ranges(lines) {
  const parts = []
  for (const line of lines) {
    const last = parts[parts.length - 1]
    if (last && line === last[1] + 1)
      last[1] = line
    else
      parts.push([line, line])
  }
  return parts.map(([start, end]) => start === end ? String(start) : start + '-' + end).join(', ')
}

function check(input, files) {
  const path = String(input.path ?? '').replace(/^[ab]\\//, '')
  const line = Number(input.line)
  const side = input.side === 'old' ? 'deletions' : 'additions'
  if (!path || !Number.isInteger(line) || !String(input.body ?? '').trim())
    return 'path, line and body are required.'
  const file = files.find(each => each.path === path || (side === 'deletions' && each.previousPath === path))
  if (!file)
    return path + ' is not changed in this merge request, so GitLab cannot take a comment on it. Changed files: ' + files.map(each => each.path).join(', ')
  const lines = file[side]
  if (!lines.includes(line)) {
    const version = side === 'deletions' ? 'old' : 'new'
    return 'Line ' + line + ' of the ' + version + ' version of ' + path + ' is not shown in the diff, so GitLab cannot take a comment there. Lines shown in the diff: ' + (ranges(lines) || 'none') + '.'
  }
  return null
}

async function handle(message) {
  if (message.id === undefined)
    return
  const reply = result => send({ jsonrpc: '2.0', id: message.id, result })
  if (message.method === 'initialize')
    return reply({ protocolVersion: message.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'pull-review', version: '1' } })
  if (message.method === 'ping')
    return reply({})
  if (message.method === 'tools/list')
    return reply({ tools: [TOOL] })
  if (message.method === 'tools/call' && message.params?.name === TOOL.name) {
    const input = message.params.arguments ?? {}
    const problem = check(input, await readTargets())
    if (problem)
      return reply({ content: [{ type: 'text', text: problem }], isError: true })
    const where = input.path + ':' + input.line + (input.side === 'old' ? ' (old version)' : '')
    return reply({ content: [{ type: 'text', text: 'Added a draft comment on ' + where + '. The developer sees it in the chat and posts it.' }] })
  }
  return send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unknown method ' + message.method } })
}

async function handleText(text) {
  let message
  try {
    message = JSON.parse(text)
  }
  catch {
    return
  }
  await handle(message)
}

const decoder = new TextDecoder()
let buffer = ''
async function take(chunk) {
  buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
  let end
  while ((end = buffer.indexOf('\\n')) >= 0) {
    const text = buffer.slice(0, end).trim()
    buffer = buffer.slice(end + 1)
    if (text)
      await handleText(text)
  }
}

if (isTjs) {
  const reader = tjs.stdin.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done)
      break
    await take(value)
  }
}
else {
  for await (const chunk of process.stdin)
    await take(chunk)
}
await take('\\n')
`
}
