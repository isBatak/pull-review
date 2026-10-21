export const RISK_CATEGORIES = ['alignment', 'impact', 'verification', 'rollback', 'errors'] as const

export type RiskCategory = typeof RISK_CATEGORIES[number]

export const RISK_VERDICTS = ['good', 'decent', 'poor', 'small', 'medium', 'large', 'low', 'high', 'n/a'] as const

export type RiskVerdict = typeof RISK_VERDICTS[number]

export type RiskLevel = 'low' | 'medium' | 'high'

export interface RiskRow {
  category: RiskCategory
  verdict: RiskVerdict
}

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  alignment: 'Alignment',
  impact: 'Impact',
  verification: 'Verification',
  rollback: 'Rollback cost',
  errors: 'Error detection',
}

const WEIGHTS: Record<RiskCategory, number> = {
  alignment: 1,
  impact: 2,
  verification: 2,
  rollback: 1.5,
  errors: 1,
}

const VERDICT_POINTS: Record<RiskVerdict, 1 | 2 | 3> = {
  'good': 1,
  'small': 1,
  'low': 1,
  'n/a': 1,
  'decent': 2,
  'medium': 2,
  'poor': 3,
  'large': 3,
  'high': 3,
}

export function verdictPoints(verdict: RiskVerdict): 1 | 2 | 3 {
  return VERDICT_POINTS[verdict] ?? 2
}

export function scoreMergeRisk(rows: RiskRow[]): RiskLevel | null {
  const known = rows.filter(row => WEIGHTS[row.category] !== undefined && VERDICT_POINTS[row.verdict] !== undefined)
  if (!known.length)
    return null
  const weight = known.reduce((sum, row) => sum + WEIGHTS[row.category], 0)
  const score = known.reduce((sum, row) => sum + verdictPoints(row.verdict) * WEIGHTS[row.category], 0) / weight
  if (score < 1.5)
    return 'low'
  return score < 2.25 ? 'medium' : 'high'
}

export function sortRiskRows<T extends RiskRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => RISK_CATEGORIES.indexOf(a.category) - RISK_CATEGORIES.indexOf(b.category))
}

// Adapted from the MIT-licensed merge-risk skill: https://github.com/warpdotdev/common-skills/blob/main/.agents/skills/merge-risk/SKILL.md
export const MERGE_RISK_RULES = [
  'When the developer asks about merge risk, or whether the merge request is safe to merge, answer with a MergeRisk card that rates all five categories. Pull Review computes the overall risk from the verdicts, so never state a score or an overall level yourself.',
  'alignment (good, decent or poor): the code matches the description and the source issue when there is one. Assumptions about behavior and drive-by changes must be documented.',
  'impact (small, medium or large): the scope is contained and away from sensitive code paths. Think about the blast radius: layout shift, breakage for consumers, mobile layouts. Auth, permissions, payments, personal data, secrets, data migrations, dependency bumps and infra or config changes are sensitive whatever the diff size. Flag any that are touched, and call out anything that widens access, weakens validation or logs sensitive data.',
  'verification (good, decent or poor): behavior is verified where it applies. Changes to the user experience need end-to-end proof such as screenshots or recordings, before and after is best. Changes that can affect performance need profiling. Missing proof is poor. Edge cases must be tested, or documented when they are not.',
  'rollback (low, medium or high): how hard the change is to undo once merged. Destructive actions and hard-to-reverse decisions, one-way doors, are high.',
  'errors (good, decent, poor, or n/a when nothing can fail in production): if this breaks in production, someone finds out before users report it. Look for swallowed errors and fallbacks that hide breakage.',
  'For each category give a short note and list the gaps that raise the risk, each with the file and line when there is one. Leave gaps empty when there are none.',
]
