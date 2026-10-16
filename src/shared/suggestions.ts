import type { DiffSide } from './types'
import { fence } from './chat'

type PatchLineKind = ' ' | '-' | '+'

interface PatchLine {
  kind: PatchLineKind
  text: string
}

interface PatchHunk {
  oldStart: number
  lines: PatchLine[]
}

export interface PatchFile {
  oldPath: string | null
  newPath: string | null
  hunks: PatchHunk[]
}

export interface SuggestionDraft {
  path: string
  side?: DiffSide
  line: number
  body: string
}

export interface SuggestionPlan {
  drafts: SuggestionDraft[]
  skipped: string[]
}

export interface SuggestionTarget {
  headContents: string | null
  shows: (line: number) => boolean
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/

function stripPrefix(path: string) {
  const trimmed = path.split('\t')[0]!.trim()
  if (trimmed === '/dev/null')
    return null
  return trimmed.replace(/^[ab]\//, '')
}

export function parseUnifiedPatch(patch: string): PatchFile[] {
  const files: PatchFile[] = []
  let file: PatchFile | null = null
  let hunk: PatchHunk | null = null
  const lines = patch.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    if (line.startsWith('--- ') && lines[index + 1]?.startsWith('+++ ')) {
      file = { oldPath: stripPrefix(line.slice(4)), newPath: stripPrefix(lines[index + 1]!.slice(4)), hunks: [] }
      files.push(file)
      hunk = null
      index++
      continue
    }
    const header = HUNK_HEADER.exec(line)
    if (header && file) {
      hunk = { oldStart: Number(header[1]), lines: [] }
      file.hunks.push(hunk)
      continue
    }
    if (!hunk || line.startsWith('\\'))
      continue
    const kind = line[0]
    if (kind === '+' || kind === '-' || kind === ' ')
      hunk.lines.push({ kind, text: line.slice(1) })
    else if (line === '')
      hunk.lines.push({ kind: ' ', text: '' })
  }
  for (const each of files) {
    for (const eachHunk of each.hunks) {
      while (eachHunk.lines.length && eachHunk.lines.at(-1)!.kind === ' ' && eachHunk.lines.at(-1)!.text === '')
        eachHunk.lines.pop()
    }
  }
  return files
}

function findHunk(headLines: string[], hunk: PatchHunk) {
  const expected = hunk.lines.filter(line => line.kind !== '+').map(line => line.text)
  if (!expected.length)
    return null
  let best: number | null = null
  for (let start = 0; start + expected.length <= headLines.length; start++) {
    if (!expected.every((text, offset) => headLines[start + offset] === text))
      continue
    if (best === null || Math.abs(start + 1 - hunk.oldStart) < Math.abs(best + 1 - hunk.oldStart))
      best = start
  }
  return best === null ? null : best + 1
}

interface ChangeBlock {
  start: number
  end: number
  replacement: string[]
}

function changeBlocks(headLines: string[], hunk: PatchHunk, firstLine: number): ChangeBlock[] {
  const blocks: ChangeBlock[] = []
  let headLine = firstLine
  let index = 0
  while (index < hunk.lines.length) {
    if (hunk.lines[index]!.kind === ' ') {
      headLine++
      index++
      continue
    }
    const blockStart = headLine
    const added: string[] = []
    let removed = 0
    while (index < hunk.lines.length && hunk.lines[index]!.kind !== ' ') {
      const line = hunk.lines[index]!
      if (line.kind === '-')
        removed++
      else
        added.push(line.text)
      index++
    }
    headLine += removed
    if (removed > 0)
      blocks.push({ start: blockStart, end: blockStart + removed - 1, replacement: added })
    else if (blockStart > 1)
      blocks.push({ start: blockStart - 1, end: blockStart - 1, replacement: [headLines[blockStart - 2]!, ...added] })
    else
      blocks.push({ start: 1, end: 1, replacement: [...added, headLines[0] ?? ''] })
  }
  return blocks
}

function suggestionBody(block: ChangeBlock, anchor: number) {
  const content = block.replacement.join('\n')
  const marker = fence(content)
  const header = `${marker}suggestion:-${anchor - block.start}+${block.end - anchor}`
  return block.replacement.length ? `${header}\n${content}\n${marker}` : `${header}\n${marker}`
}

export function planSuggestions(files: PatchFile[], targetFor: (path: string) => SuggestionTarget | null): SuggestionPlan {
  const plan: SuggestionPlan = { drafts: [], skipped: [] }
  for (const file of files) {
    const path = file.newPath ?? file.oldPath ?? 'unknown file'
    if (!file.oldPath || !file.newPath) {
      plan.skipped.push(`${path}: GitLab suggestions can't create or delete files.`)
      continue
    }
    if (file.oldPath !== file.newPath) {
      plan.skipped.push(`${path}: GitLab suggestions can't rename files.`)
      continue
    }
    const target = targetFor(path)
    if (!target || target.headContents === null) {
      plan.skipped.push(`${path}: this file isn't changed in the merge request, so GitLab can't take comments on it.`)
      continue
    }
    const headLines = target.headContents.replace(/\n$/, '').split('\n')
    for (const hunk of file.hunks) {
      const firstLine = findHunk(headLines, hunk)
      if (firstLine === null) {
        plan.skipped.push(`${path}: a change near line ${hunk.oldStart} doesn't match the merge request's version of the file.`)
        continue
      }
      for (const block of changeBlocks(headLines, hunk, firstLine)) {
        const anchor = Array.from({ length: block.end - block.start + 1 }, (_, offset) => block.start + offset).find(line => target.shows(line))
        if (anchor === undefined) {
          plan.skipped.push(`${path}: lines ${block.start}-${block.end} aren't part of the merge request's diff, so GitLab can't take a comment there.`)
          continue
        }
        plan.drafts.push({ path, line: anchor, body: suggestionBody(block, anchor) })
      }
    }
  }
  return plan
}

export function patchHasChanges(patch: string) {
  return parseUnifiedPatch(patch).some(file => file.hunks.some(hunk => hunk.lines.some(line => line.kind !== ' ')))
}

const SUGGESTION_LANGUAGE = /^suggestion(?::-(\d+)\+(\d+))?$/

export function parseSuggestionRange(language: string | null) {
  const match = language ? SUGGESTION_LANGUAGE.exec(language) : null
  if (!match)
    return null
  return { above: Number(match[1] ?? 0), below: Number(match[2] ?? 0) }
}
