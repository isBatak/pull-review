import type { MrSummary } from './types'
import { parseMrTitle } from './mr-title'

export type StackIssue
  = | { kind: 'missing-tag', depth: number }
    | { kind: 'wrong-level', tagged: number, depth: number }
    | { kind: 'tagged-but-not-stacked', tagged: number }
    | { kind: 'parent-not-open', branch: string }

export interface StackInfo {
  depth: number
  parent: MrSummary | null
  baseBranch: string
  issues: StackIssue[]
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
    const tagged = parseMrTitle(mr.title).stackedLevel
    const issues: StackIssue[] = []
    let info: StackInfo

    if (mr.targetBranch === defaultBranch) {
      if (tagged !== null)
        issues.push({ kind: 'tagged-but-not-stacked', tagged })
      info = { depth: 0, parent: null, baseBranch: defaultBranch, issues }
    }
    else {
      const parent = bySourceBranch.get(mr.targetBranch)
      let depth = 1
      let baseBranch = mr.targetBranch
      if (parent && !seen.has(parent.iid)) {
        seen.add(parent.iid)
        const parentInfo = resolve(parent, seen)
        depth = Math.max(1, parentInfo.depth + 1)
        baseBranch = parentInfo.baseBranch
      }
      else if (!parent) {
        issues.push({ kind: 'parent-not-open', branch: mr.targetBranch })
      }
      if (tagged === null)
        issues.push({ kind: 'missing-tag', depth })
      else if (tagged !== depth)
        issues.push({ kind: 'wrong-level', tagged, depth })
      info = { depth, parent: parent ?? null, baseBranch, issues }
    }

    result.set(mr.iid, info)
    return info
  }

  for (const mr of mrs)
    resolve(mr, new Set([mr.iid]))
  return result
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
      return `Stacked ${issue.depth} level${issue.depth === 1 ? '' : 's'} deep, but the title has no [stacked-${issue.depth}] tag.`
    case 'wrong-level':
      return `Title says [stacked-${issue.tagged}], but it is ${issue.depth} level${issue.depth === 1 ? '' : 's'} deep. A parent may have been merged.`
    case 'tagged-but-not-stacked':
      return `Title says [stacked-${issue.tagged}], but it targets the default branch.`
    case 'parent-not-open':
      return `Targets ${issue.branch}, which has no open merge request.`
  }
}
