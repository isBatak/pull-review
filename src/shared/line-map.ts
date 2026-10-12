import type { DiffSide } from './types'

interface HunkRange {
  oldStart: number
  oldLength: number
  newStart: number
  newLength: number
}

export interface LineMap {
  resolve: (side: DiffSide, line: number) => { oldLine: number | null, newLine: number | null }
}

export interface ChangeCounts {
  additions: number
  deletions: number
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function* diffLines(diff: string) {
  for (const line of diff.split('\n')) {
    if (line.startsWith('\\'))
      continue
    yield line
  }
}

export function countChanges(diff: string): ChangeCounts {
  let additions = 0
  let deletions = 0
  let inHunk = false
  for (const line of diffLines(diff)) {
    if (HUNK_HEADER.test(line)) {
      inHunk = true
      continue
    }
    if (!inHunk)
      continue
    if (line.startsWith('+'))
      additions++
    else if (line.startsWith('-'))
      deletions++
  }
  return { additions, deletions }
}

export function createLineMap(diff: string): LineMap {
  const added = new Set<number>()
  const removed = new Set<number>()
  const contextNewToOld = new Map<number, number>()
  const contextOldToNew = new Map<number, number>()
  const hunks: HunkRange[] = []

  let oldLine = 0
  let newLine = 0
  let inHunk = false
  for (const line of diffLines(diff)) {
    const header = HUNK_HEADER.exec(line)
    if (header) {
      const hunk: HunkRange = {
        oldStart: Number(header[1]),
        oldLength: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLength: header[4] === undefined ? 1 : Number(header[4]),
      }
      hunks.push(hunk)
      oldLine = hunk.oldStart
      newLine = hunk.newStart
      inHunk = true
      continue
    }
    if (!inHunk)
      continue
    if (line.startsWith('+')) {
      added.add(newLine++)
    }
    else if (line.startsWith('-')) {
      removed.add(oldLine++)
    }
    else {
      contextNewToOld.set(newLine, oldLine)
      contextOldToNew.set(oldLine, newLine)
      oldLine++
      newLine++
    }
  }

  function offsetBefore(line: number, side: DiffSide) {
    let offset = 0
    for (const hunk of hunks) {
      const end = side === 'additions' ? hunk.newStart + hunk.newLength : hunk.oldStart + hunk.oldLength
      if (end <= line)
        offset += hunk.newLength - hunk.oldLength
    }
    return offset
  }

  return {
    resolve(side, line) {
      if (side === 'additions') {
        if (added.has(line))
          return { oldLine: null, newLine: line }
        return { oldLine: contextNewToOld.get(line) ?? line - offsetBefore(line, side), newLine: line }
      }
      if (removed.has(line))
        return { oldLine: line, newLine: null }
      return { oldLine: line, newLine: contextOldToNew.get(line) ?? line + offsetBefore(line, side) }
    },
  }
}

export function sideForPosition(oldLine: number | null, newLine: number | null): { side: DiffSide, line: number } | null {
  if (newLine !== null)
    return { side: 'additions', line: newLine }
  if (oldLine !== null)
    return { side: 'deletions', line: oldLine }
  return null
}

export function codeForRange(diff: string, side: DiffSide, startLine: number, endLine: number): string | null {
  const wanted = new Map<number, string>()
  let oldLine = 0
  let newLine = 0
  let inHunk = false
  for (const line of diffLines(diff)) {
    const header = HUNK_HEADER.exec(line)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[3])
      inHunk = true
      continue
    }
    if (!inHunk)
      continue
    const text = line.slice(1)
    if (line.startsWith('+')) {
      if (side === 'additions')
        wanted.set(newLine, text)
      newLine++
    }
    else if (line.startsWith('-')) {
      if (side === 'deletions')
        wanted.set(oldLine, text)
      oldLine++
    }
    else {
      wanted.set(side === 'additions' ? newLine : oldLine, text)
      oldLine++
      newLine++
    }
  }
  const lines: string[] = []
  for (let line = startLine; line <= endLine; line++) {
    const text = wanted.get(line)
    if (text === undefined)
      return null
    lines.push(text)
  }
  return lines.join('\n')
}
