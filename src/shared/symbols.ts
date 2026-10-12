import type { DiffFile } from './types'

export type SymbolHitKind = 'definition' | 'reference'

export interface SymbolHit {
  path: string
  line: number
  column: number
  text: string
  kind: SymbolHitKind
}

export interface SymbolResult {
  name: string
  source: 'repository' | 'diff'
  definitions: SymbolHit[]
  references: SymbolHit[]
  truncated: boolean
}

export const MAX_SYMBOL_HITS = 500
const MAX_TEXT_LENGTH = 300
const IDENTIFIER = /^[A-Z_$][\w$]*$/i
const KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'declare', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'instanceof',
  'interface', 'is', 'keyof', 'let', 'new', 'null', 'of', 'private', 'protected', 'public', 'readonly', 'return', 'set', 'static', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield', 'def', 'fn', 'func', 'self',
])

export function isSearchableSymbol(text: string) {
  return IDENTIFIER.test(text) && !KEYWORDS.has(text)
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wordPattern(name: string, flags = '') {
  return new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`, flags)
}

const MODIFIERS = '(?:(?:export|default|declare|public|private|protected|static|readonly|async|override|abstract|get|set)\\s+)*'

function definitionPatterns(name: string) {
  const n = escapeRegExp(name)
  const end = '(?![\\w$])'
  return [
    new RegExp(`\\b(?:function\\*?|class|interface|type|enum|namespace|module|def|fn|func|struct|trait|protocol|record|object)\\s+${n}${end}`),
    new RegExp(`\\b(?:const|let|var|val)\\s+${n}${end}`),
    new RegExp(`\\bfunc\\s*\\([^)]*\\)\\s*${n}\\s*\\(`),
    new RegExp(`^\\s*${MODIFIERS}${n}\\s*(?:<[^>]*>)?\\s*\\([^)]*\\)\\s*(?::[^=;{]+)?\\{\\s*$`),
    new RegExp(`^\\s*${MODIFIERS}${n}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*(?::[^=]+)?=>|[A-Z_$][\\w$]*\\s*=>)`, 'i'),
  ]
}

export function createClassifier(name: string) {
  const patterns = definitionPatterns(name)
  return (text: string): SymbolHitKind => patterns.some(pattern => pattern.test(text)) ? 'definition' : 'reference'
}

function trimText(text: string) {
  const trimmed = text.trim()
  return trimmed.length > MAX_TEXT_LENGTH ? `${trimmed.slice(0, MAX_TEXT_LENGTH)}…` : trimmed
}

export function parseGitGrep(output: string, sha: string, name: string): { hits: SymbolHit[], truncated: boolean } {
  const classify = createClassifier(name)
  const prefix = `${sha}:`
  const hits: SymbolHit[] = []
  let truncated = false
  for (const raw of output.split('\n')) {
    if (!raw.startsWith(prefix))
      continue
    const match = /^(.+?):(\d+):(\d+):(.*)$/.exec(raw.slice(prefix.length))
    if (!match)
      continue
    if (hits.length >= MAX_SYMBOL_HITS) {
      truncated = true
      break
    }
    const text = match[4]!
    hits.push({ path: match[1]!, line: Number(match[2]), column: Number(match[3]), text: trimText(text), kind: classify(text) })
  }
  return { hits, truncated }
}

function* newSideLines(diff: string) {
  let line = 0
  let inHunk = false
  for (const raw of diff.split('\n')) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
    if (header) {
      line = Number(header[1])
      inHunk = true
      continue
    }
    if (!inHunk || raw.startsWith('\\') || raw.startsWith('-'))
      continue
    yield { line, text: raw.slice(1) }
    line++
  }
}

export function searchDiffFiles(files: DiffFile[], name: string): { hits: SymbolHit[], truncated: boolean } {
  const classify = createClassifier(name)
  const pattern = wordPattern(name)
  const hits: SymbolHit[] = []
  for (const file of files) {
    if (file.status === 'removed')
      continue
    for (const { line, text } of newSideLines(file.diff)) {
      const match = pattern.exec(text)
      if (!match)
        continue
      if (hits.length >= MAX_SYMBOL_HITS)
        return { hits, truncated: true }
      hits.push({ path: file.path, line, column: match.index + 1, text: trimText(text), kind: classify(text) })
    }
  }
  return { hits, truncated: false }
}

export function buildSymbolResult(name: string, source: SymbolResult['source'], found: { hits: SymbolHit[], truncated: boolean }, changedPaths: Set<string>): SymbolResult {
  const rank = (hit: SymbolHit) => (changedPaths.has(hit.path) ? 0 : 1)
  const sorted = [...found.hits].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path) || a.line - b.line)
  return {
    name,
    source,
    definitions: sorted.filter(hit => hit.kind === 'definition'),
    references: sorted.filter(hit => hit.kind === 'reference'),
    truncated: found.truncated,
  }
}

const KIND_KEYWORDS: [RegExp, string][] = [
  [/\bclass\s/, 'class'],
  [/\binterface\s/, 'interface'],
  [/\btype\s/, 'type'],
  [/\benum\s/, 'enum'],
  [/\b(?:function\*?|def|fn|func)\s/, 'function'],
  [/\bconst\s/, 'const'],
  [/\b(?:let|var|val)\s/, 'variable'],
]

export function definitionKind(text: string, name: string): string {
  const before = text.slice(0, Math.max(0, text.search(new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`))) + 1)
  for (const [pattern, kind] of KIND_KEYWORDS) {
    if (pattern.test(before))
      return kind
  }
  return /=>|\bfunction\b|\(/.test(text) ? 'function' : 'symbol'
}
