import type { StackedTag } from './mr-title'
import type { MrSummary } from './types'
import { formatStackedTag, parseMrTitle, sameStackedTag } from './mr-title'

export type StackIssue
  = | { kind: 'missing-tag', expected: StackedTag }
    | { kind: 'wrong-level', tagged: StackedTag, expected: StackedTag }
    | { kind: 'tagged-but-not-stacked', tagged: StackedTag }
    | { kind: 'parent-not-open', branch: string }

export interface StackInfo {
  depth: number
  expectedTag: StackedTag | null
  parent: MrSummary | null
  baseBranch: string
  issues: StackIssue[]
}

export interface StackRowGuides {
  passThrough: number[]
  hasLaterSibling: boolean
  hasChildren: boolean
}

export interface MrStack {
  root: MrSummary
  members: { mr: MrSummary, depth: number }[]
}

export type MrListEntry
  = | { kind: 'single', mr: MrSummary }
    | { kind: 'stack', stack: MrStack }

export function analyzeStacks(mrs: MrSummary[], defaultBranch: string): Map<number, StackInfo> {
  const bySourceBranch = new Map(mrs.map(mr => [mr.sourceBranch, mr]))
  const result = new Map<number, StackInfo>()

  function resolve(mr: MrSummary, seen: Set<number>): StackInfo {
    const cached = result.get(mr.iid)
    if (cached)
      return cached
    const tagged = parseMrTitle(mr.title).stacked
    const issues: StackIssue[] = []
    let info: StackInfo

    if (mr.targetBranch === defaultBranch) {
      if (tagged !== null)
        issues.push({ kind: 'tagged-but-not-stacked', tagged })
      info = { depth: 0, expectedTag: null, parent: null, baseBranch: defaultBranch, issues }
    }
    else {
      const parent = bySourceBranch.get(mr.targetBranch)
      let depth = 1
      let expectedTag = startLevel(1, tagged)
      let baseBranch = mr.targetBranch
      if (parent && !seen.has(parent.iid)) {
        seen.add(parent.iid)
        const parentInfo = resolve(parent, seen)
        depth = Math.max(1, parentInfo.depth + 1)
        expectedTag = expectedChildTag(parentInfo.expectedTag, parseMrTitle(parent.title).stacked, tagged)
        baseBranch = parentInfo.baseBranch
      }
      else if (!parent) {
        issues.push({ kind: 'parent-not-open', branch: mr.targetBranch })
      }
      if (tagged === null)
        issues.push({ kind: 'missing-tag', expected: expectedTag })
      else if (!sameStackedTag(tagged, expectedTag))
        issues.push({ kind: 'wrong-level', tagged, expected: expectedTag })
      info = { depth, expectedTag, parent: parent ?? null, baseBranch, issues }
    }

    result.set(mr.iid, info)
    return info
  }

  for (const mr of mrs)
    resolve(mr, new Set([mr.iid]))
  return result
}

function startLevel(level: number, tagged: StackedTag | null): StackedTag {
  return { level, part: tagged?.part ?? null }
}

function expectedChildTag(parentExpected: StackedTag | null, parentTagged: StackedTag | null, tagged: StackedTag | null): StackedTag {
  const parentLevel = parentExpected?.level ?? 0
  const continuesParts = tagged?.part != null && parentTagged?.part != null && tagged.level === parentTagged.level
  if (continuesParts)
    return { level: parentLevel, part: parentTagged.part! + 1 }
  return startLevel(parentLevel + 1, tagged)
}

export function stackGuides(depths: number[]): StackRowGuides[] {
  const hasLaterAtDepth = (index: number, depth: number) => {
    for (let next = index + 1; next < depths.length; next++) {
      if (depths[next]! < depth)
        return false
      if (depths[next] === depth)
        return true
    }
    return false
  }
  return depths.map((depth, index) => ({
    passThrough: Array.from({ length: Math.max(0, depth - 1) }, (_, offset) => offset + 1).filter(column => hasLaterAtDepth(index, column)),
    hasLaterSibling: depth > 0 && hasLaterAtDepth(index, depth),
    hasChildren: depths[index + 1] === depth + 1,
  }))
}

export function groupIntoStacks(mrs: MrSummary[], info: Map<number, StackInfo>): MrListEntry[] {
  const children = new Map<number, MrSummary[]>()
  const included = new Set(mrs.map(mr => mr.iid))
  for (const mr of mrs) {
    const parent = info.get(mr.iid)?.parent
    if (parent && included.has(parent.iid)) {
      const list = children.get(parent.iid) ?? []
      list.push(mr)
      children.set(parent.iid, list)
    }
  }

  const entries: MrListEntry[] = []
  const placed = new Set<number>()
  for (const mr of mrs) {
    const parent = info.get(mr.iid)?.parent
    if (parent && included.has(parent.iid))
      continue
    if (!children.has(mr.iid) && (info.get(mr.iid)?.depth ?? 0) === 0) {
      placed.add(mr.iid)
      entries.push({ kind: 'single', mr })
      continue
    }
    const members: MrStack['members'] = []
    const walk = (node: MrSummary) => {
      if (placed.has(node.iid))
        return
      placed.add(node.iid)
      members.push({ mr: node, depth: info.get(node.iid)?.depth ?? 0 })
      for (const child of children.get(node.iid) ?? [])
        walk(child)
    }
    walk(mr)
    if (members.length === 1)
      entries.push({ kind: 'single', mr })
    else
      entries.push({ kind: 'stack', stack: { root: mr, members } })
  }
  for (const mr of mrs) {
    if (!placed.has(mr.iid))
      entries.push({ kind: 'single', mr })
  }
  return entries
}

export function isWarning(issue: StackIssue) {
  return issue.kind !== 'parent-not-open'
}

export function describeStackIssue(issue: StackIssue): string {
  switch (issue.kind) {
    case 'missing-tag':
      return `Stacked on another merge request, but the title has no [stacked-${formatStackedTag(issue.expected)}] tag.`
    case 'wrong-level':
      return `Title says [stacked-${formatStackedTag(issue.tagged)}], but its place in the stack is [stacked-${formatStackedTag(issue.expected)}]. A parent may have been merged.`
    case 'tagged-but-not-stacked':
      return `Title says [stacked-${formatStackedTag(issue.tagged)}], but it targets the default branch.`
    case 'parent-not-open':
      return `Targets ${issue.branch}, which has no open merge request.`
  }
}
