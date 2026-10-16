import type { ChatToolRoot, ChatToolUse } from './chat'

export type ThinkingStepKind = 'search' | 'read' | 'write' | 'post' | 'other'

export interface ThinkingItem {
  text: string
  root: ChatToolRoot | null
  line: number | null
}

export interface ThinkingStep {
  id: string
  kind: ThinkingStepKind
  doneLabel: string
  activeLabel: string
  items: ThinkingItem[]
}

const CONTEXT_FILE = /^(?:merge-request\.md|discussions\.md|changes\.diff|diffs\/.+\.diff)$/

function rootOf(tool: ChatToolUse): ChatToolRoot | null {
  if (tool.root !== undefined)
    return tool.root
  if (!tool.detail || tool.detail.startsWith('/') || !['Read', 'Glob'].includes(tool.name))
    return null
  return CONTEXT_FILE.test(tool.detail) ? 'context' : 'repo'
}

function itemOf(tool: ChatToolUse): ThinkingItem {
  return { text: tool.detail!, root: tool.name === 'Read' ? rootOf(tool) : null, line: tool.line ?? null }
}

const SEARCH_TOOLS = new Set(['Grep', 'Glob'])
const STRUCTURED_OUTPUT_TOOL = 'StructuredOutput'

function kindOf(tool: ChatToolUse): ThinkingStepKind {
  if (SEARCH_TOOLS.has(tool.name))
    return 'search'
  if (tool.name === 'Read')
    return 'read'
  if (tool.name === STRUCTURED_OUTPUT_TOOL)
    return 'write'
  return 'other'
}

function files(count: number) {
  return count === 1 ? '1 file' : `${count} files`
}

function labelled(step: Omit<ThinkingStep, 'doneLabel' | 'activeLabel'>, tool: ChatToolUse, writeLabel: string): ThinkingStep {
  switch (step.kind) {
    case 'search':
      return { ...step, doneLabel: 'Searched the codebase', activeLabel: 'Searching the codebase' }
    case 'read':
      return { ...step, doneLabel: `Read ${files(step.items.length)}`, activeLabel: `Reading ${files(step.items.length)}` }
    case 'write':
      return { ...step, doneLabel: `Wrote ${writeLabel}`, activeLabel: `Writing ${writeLabel}` }
    default:
      return { ...step, doneLabel: `Used ${tool.name}`, activeLabel: `Using ${tool.name}` }
  }
}

export function stepsFromTools(tools: ChatToolUse[], writeLabel = 'the answer'): ThinkingStep[] {
  const steps: ThinkingStep[] = []
  let last: { kind: ThinkingStepKind, items: ThinkingItem[], tool: ChatToolUse, id: string } | null = null
  const flush = () => {
    if (last)
      steps.push(labelled({ id: last.id, kind: last.kind, items: last.items }, last.tool, writeLabel))
  }
  for (const tool of tools) {
    const kind = kindOf(tool)
    if (!last || last.kind !== kind || kind === 'other' || kind === 'write') {
      flush()
      last = { kind, items: [], tool, id: tool.id }
    }
    if (tool.detail && kind !== 'write' && !last.items.some(item => item.text === tool.detail))
      last.items.push(itemOf(tool))
  }
  flush()
  return steps
}
