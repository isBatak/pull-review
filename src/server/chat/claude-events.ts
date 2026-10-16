import type { ChatMessage, ChatToolRoot, ChatToolUse } from '../../shared/chat'

interface ContentBlock {
  type: string
  id?: string
  name?: string
  text?: string
  input?: Record<string, unknown>
}

interface StreamLine {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  errors?: string[]
  event?: {
    type?: string
    content_block?: ContentBlock
    delta?: { type?: string, text?: string }
  }
  message?: { content?: ContentBlock[] | string }
}

const DETAIL_KEYS = ['file_path', 'pattern', 'path'] as const
const PATH_KEYS = new Set<string>(['file_path', 'path'])

export interface ToolRoots {
  repo?: string | null
  context?: string | null
}

function rawDetail(input: Record<string, unknown> | undefined) {
  for (const key of DETAIL_KEYS) {
    const value = input?.[key]
    if (typeof value === 'string' && value)
      return { value, isPath: PATH_KEYS.has(key) }
  }
  return null
}

function within(path: string, dir: string | null | undefined) {
  return dir && path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : null
}

export function describeToolInput(input: Record<string, unknown> | undefined, roots: ToolRoots): Pick<ChatToolUse, 'detail' | 'root' | 'line'> {
  const raw = rawDetail(input)
  if (!raw)
    return { detail: null, root: null, line: null }
  const offset = input?.offset
  const line = typeof offset === 'number' && offset > 0 ? Math.floor(offset) : null
  if (!raw.isPath)
    return { detail: raw.value, root: null, line: null }
  for (const root of ['repo', 'context'] as ChatToolRoot[]) {
    const relative = within(raw.value, roots[root])
    if (relative)
      return { detail: relative, root, line }
  }
  return { detail: raw.value, root: null, line }
}

export interface StreamOutcome {
  changed: boolean
  finished: boolean
}

export function applyStreamLine(message: ChatMessage, raw: string, roots: ToolRoots = {}): StreamOutcome {
  let line: StreamLine
  try {
    line = JSON.parse(raw) as StreamLine
  }
  catch {
    return { changed: false, finished: false }
  }

  if (line.type === 'stream_event') {
    const event = line.event
    if (event?.type === 'content_block_start' && event.content_block?.type === 'text' && message.text && !message.text.endsWith('\n\n')) {
      message.text += '\n\n'
      return { changed: true, finished: false }
    }
    if (event?.type === 'content_block_start' && event.content_block?.type === 'tool_use' && event.content_block.id) {
      message.tools.push({ id: event.content_block.id, name: event.content_block.name ?? 'Tool', detail: null })
      return { changed: true, finished: false }
    }
    if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
      message.text += event.delta.text
      return { changed: true, finished: false }
    }
    return { changed: false, finished: false }
  }

  if (line.type === 'assistant' && Array.isArray(line.message?.content)) {
    let changed = false
    for (const block of line.message.content) {
      if (block.type !== 'tool_use' || !block.id)
        continue
      const tool = message.tools.find(item => item.id === block.id)
      const described = describeToolInput(block.input, roots)
      if (tool && (tool.detail !== described.detail || tool.root !== described.root || tool.line !== described.line)) {
        Object.assign(tool, described)
        changed = true
      }
      else if (!tool) {
        message.tools.push({ id: block.id, name: block.name ?? 'Tool', ...described })
        changed = true
      }
    }
    return { changed, finished: false }
  }

  if (line.type === 'result') {
    message.text = message.text.trimEnd()
    if (line.is_error || (line.subtype && line.subtype !== 'success')) {
      message.status = 'error'
      message.error = line.errors?.join('\n') || line.result || 'Claude stopped with an error.'
    }
    else {
      message.status = 'done'
      if (!message.text && line.result)
        message.text = line.result
    }
    return { changed: true, finished: true }
  }

  return { changed: false, finished: false }
}

const SIGNED_OUT = /not logged in|please run \/login|invalid api key|authentication/i

export function explainExit(code: number, stderr: string): string {
  if (SIGNED_OUT.test(stderr))
    return 'Claude Code is not signed in. Run `claude` in a terminal, sign in, then try again.'
  const detail = stderr.trim()
  return detail ? `Claude Code exited with code ${code}: ${detail}` : `Claude Code exited with code ${code}.`
}
