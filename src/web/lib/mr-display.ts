import type { MrSummary } from '../../shared/types'
import type { TeamColor } from './settings'

const KNOWN_APP_HUES: Record<string, string> = {
  WEB: 'blue',
  APP: 'violet',
  OFFICE: 'teal',
  ADMIN: 'orange',
  EXP: 'pink',
  DS: 'fuchsia',
  'DESIGN-SYSTEM': 'fuchsia',
  DATA: 'cyan',
  AMPHORA: 'amber',
  LIBS: 'indigo',
  HUB: 'emerald',
  TAF: 'lime',
  ACROPOLIS: 'sky',
  BRAND: 'rose',
  REPO: 'slate',
  CI: 'slate',
  COMMON: 'stone',
}

const FALLBACK_HUES = ['blue', 'violet', 'teal', 'orange', 'pink', 'cyan', 'amber', 'indigo', 'emerald', 'lime', 'sky', 'rose']

const TEAM_HUES: Record<TeamColor, string> = {
  violet: 'violet',
  blue: 'blue',
  teal: 'teal',
  green: 'green',
  amber: 'amber',
  orange: 'orange',
  rose: 'rose',
  slate: 'slate',
}

export interface HueVars extends React.CSSProperties {
  '--hue-fg': string
  '--hue-fg-dark': string
  '--hue-bg': string
  '--hue-bg-dark': string
  '--hue-solid': string
}

function hueVars(hue: string): HueVars {
  return {
    '--hue-fg': `var(--colors-${hue}-700)`,
    '--hue-fg-dark': `var(--colors-${hue}-300)`,
    '--hue-bg': `var(--colors-${hue}-100)`,
    '--hue-bg-dark': `color-mix(in srgb, var(--colors-${hue}-500) 18%, transparent)`,
    '--hue-solid': `var(--colors-${hue}-500)`,
  }
}

function hashHue(name: string) {
  let hash = 0
  for (const char of name)
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  return FALLBACK_HUES[Math.abs(hash) % FALLBACK_HUES.length]!
}

export function appTagStyle(name: string): HueVars {
  return hueVars(KNOWN_APP_HUES[name] ?? hashHue(name))
}

export function teamStyle(color: TeamColor): HueVars {
  return hueVars(TEAM_HUES[color])
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent'

export interface MergeStatus {
  label: string
  tone: StatusTone
  attention: boolean
}

const MERGE_STATUS: Record<string, MergeStatus> = {
  mergeable: { label: 'Ready to merge', tone: 'success', attention: false },
  not_approved: { label: 'Needs approval', tone: 'neutral', attention: false },
  approvals_syncing: { label: 'Needs approval', tone: 'neutral', attention: false },
  discussions_not_resolved: { label: 'Unresolved threads', tone: 'warning', attention: true },
  need_rebase: { label: 'Needs rebase', tone: 'warning', attention: true },
  conflict: { label: 'Conflicts', tone: 'danger', attention: true },
  broken_status: { label: 'Cannot merge', tone: 'danger', attention: true },
  ci_must_pass: { label: 'Pipeline must pass', tone: 'warning', attention: true },
  ci_still_running: { label: 'Pipeline running', tone: 'accent', attention: false },
  requested_changes: { label: 'Changes requested', tone: 'danger', attention: true },
  blocked_status: { label: 'Blocked', tone: 'danger', attention: true },
  jira_association_missing: { label: 'Missing Jira link', tone: 'warning', attention: true },
}

export function mergeStatusOf(mr: MrSummary): MergeStatus | null {
  if (mr.state !== 'opened' || mr.draft)
    return null
  if (mr.hasConflicts)
    return MERGE_STATUS.conflict!
  return MERGE_STATUS[mr.detailedMergeStatus] ?? null
}

export type QuickFilter = 'all' | 'ready' | 'attention' | 'draft' | 'review'

export function matchesQuickFilter(mr: MrSummary, filter: QuickFilter): boolean {
  const status = mergeStatusOf(mr)
  switch (filter) {
    case 'all':
      return true
    case 'ready':
      return status?.label === 'Ready to merge'
    case 'attention':
      return status?.attention === true
    case 'draft':
      return mr.draft
    case 'review':
      return mr.state === 'opened' && !mr.draft && status?.label !== 'Ready to merge' && status?.attention !== true
  }
}
