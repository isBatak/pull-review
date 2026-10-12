import type { DiffFile } from './types'
import picomatch from 'picomatch'

export interface CategoryConfig {
  id: string
  label: string
  description: string
  match: string[]
  keepExpanded: string[]
  collapsed: boolean
  builtin?: 'code' | 'other'
  includeGitlabGenerated?: boolean
}

export interface FileGroup {
  key: string
  label: string
  description: string
  collapsed: boolean
  keepsSomeExpanded: boolean
  files: DiffFile[]
}

export type RuleKind = 'name' | 'folder' | 'path' | 'regex'

export interface ParsedRule {
  source: string
  kind: RuleKind
  test: (path: string) => boolean
}

export interface RuleError {
  source: string
  message: string
}

const REGEX_RULE = /^\/(.+)\/([a-z]*)$/

export function parseRule(line: string): ParsedRule | RuleError | null {
  const source = line.trim()
  if (!source || source.startsWith('#'))
    return null

  const regex = REGEX_RULE.exec(source)
  if (regex) {
    try {
      const pattern = new RegExp(regex[1]!, regex[2])
      return { source, kind: 'regex', test: path => pattern.test(path) }
    }
    catch (error) {
      return { source, message: error instanceof Error ? error.message : 'Invalid regular expression' }
    }
  }

  try {
    if (source.endsWith('/')) {
      const folder = source.slice(0, -1).replace(/^\/+/, '')
      const matcher = picomatch(folder.includes('/') ? `${folder}/**` : `**/${folder}/**`, { dot: true })
      return { source, kind: 'folder', test: path => matcher(path) }
    }
    if (!source.includes('/')) {
      const matcher = picomatch(source, { dot: true })
      return { source, kind: 'name', test: path => matcher(path.slice(path.lastIndexOf('/') + 1)) }
    }
    const matcher = picomatch(source, { dot: true })
    return { source, kind: 'path', test: path => matcher(path) }
  }
  catch (error) {
    return { source, message: error instanceof Error ? error.message : 'Invalid pattern' }
  }
}

export function isRuleError(rule: ParsedRule | RuleError | null): rule is RuleError {
  return rule !== null && 'message' in rule
}

export function parseRules(lines: string[]): { rules: ParsedRule[], errors: RuleError[] } {
  const rules: ParsedRule[] = []
  const errors: RuleError[] = []
  for (const line of lines) {
    const parsed = parseRule(line)
    if (isRuleError(parsed))
      errors.push(parsed)
    else if (parsed)
      rules.push(parsed)
  }
  return { rules, errors }
}

const LOCALE_EXTENSIONS = '{json,yml,yaml,po,ftl,properties}'

export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  {
    id: 'code',
    label: 'Code',
    description: 'Source with its tests and stories next to it. Start here.',
    match: [],
    keepExpanded: [],
    collapsed: false,
    builtin: 'code',
  },
  {
    id: 'translations',
    label: 'Translations',
    description: 'Locale files. English is expanded, other languages start collapsed.',
    match: [
      `**/locales/**/*.${LOCALE_EXTENSIONS}`,
      `**/i18n/**/*.${LOCALE_EXTENSIONS}`,
      `**/translations/**/*.${LOCALE_EXTENSIONS}`,
      '**/lang/*.{json,yml,yaml}',
      '*.{po,pot,xliff,xlf}',
    ],
    keepExpanded: ['/\\/(?:locales|i18n|translations|lang)\\/en(?:[-_][A-Za-z]{2})?(?:\\/|\\.)/'],
    collapsed: true,
  },
  {
    id: 'visual-snapshots',
    label: 'Visual snapshots',
    description: 'Screenshot baselines from visual regression tests, shown as before and after images.',
    match: ['**/*snapshots*/**/*.{png,jpg,jpeg,webp,gif}', '__screenshots__/', '__image_snapshots__/', '.loki/'],
    keepExpanded: [],
    collapsed: false,
  },
  {
    id: 'test-snapshots',
    label: 'Test snapshots',
    description: 'Snapshot files written by tests. Collapsed by default.',
    match: ['*.snap', '__snapshots__/'],
    keepExpanded: [],
    collapsed: true,
  },
  {
    id: 'changesets',
    label: 'Changesets',
    description: 'Release notes and version bumps for the packages this change touches.',
    match: ['.changeset/'],
    keepExpanded: [],
    collapsed: false,
  },
  {
    id: 'docs',
    label: 'Docs',
    description: 'Documentation and readmes.',
    match: ['*.{md,mdx,mdc}', 'docs/', 'README*', 'CHANGELOG*'],
    keepExpanded: [],
    collapsed: false,
  },
  {
    id: 'config',
    label: 'Config',
    description: 'Tooling, CI and container configuration.',
    match: [
      '.gitlab-ci.yml',
      '.gitlab/',
      '.gitlab-ci/',
      '.github/',
      '.git*',
      '.*rc',
      '.*rc.*',
      'tsconfig*.json',
      '{eslint,prettier,jest,vitest,babel,postcss,commitlint,stylelint,lint-staged,playwright,cypress,knip,renovate,lefthook}.config.*',
      'Dockerfile*',
      '*.dockerfile',
      'docker-compose*.{yml,yaml}',
      '.dockerignore',
      'Makefile',
      '.env*',
      'project.json',
      'nx.json',
    ],
    keepExpanded: [],
    collapsed: false,
  },
  {
    id: 'deps',
    label: 'Dependencies',
    description: 'Package manifests.',
    match: ['package.json', 'pnpm-workspace.yaml', 'Cargo.toml', 'go.mod', 'requirements*.txt', 'pyproject.toml'],
    keepExpanded: [],
    collapsed: false,
  },
  {
    id: 'generated',
    label: 'Generated',
    description: 'Lockfiles and build output. Collapsed by default.',
    match: ['*.generated.*', '*.gen.*', '*.lock', 'pnpm-lock.yaml', 'package-lock.json', 'bun.lockb', 'go.sum', 'dist/'],
    keepExpanded: [],
    collapsed: true,
    includeGitlabGenerated: true,
  },
  {
    id: 'other',
    label: 'Other',
    description: 'Binary files no other category claims.',
    match: [],
    keepExpanded: [],
    collapsed: false,
    builtin: 'other',
  },
]

export interface Classification {
  category: CategoryConfig
  rule: string | null
}

export interface Classifier {
  classify: (file: Pick<DiffFile, 'path' | 'isBinary' | 'generated'>) => Classification
  isCollapsedByDefault: (file: DiffFile) => boolean
  group: (files: DiffFile[]) => FileGroup[]
}

export function createClassifier(categories: CategoryConfig[]): Classifier {
  const compiled = categories.map(category => ({
    category,
    match: parseRules(category.match).rules,
    keepExpanded: parseRules(category.keepExpanded).rules,
  }))
  const fallback = (kind: 'code' | 'other') => categories.find(category => category.builtin === kind) ?? DEFAULT_CATEGORIES.find(category => category.builtin === kind)!
  const generatedCategory = categories.find(category => category.includeGitlabGenerated)

  function classify(file: Pick<DiffFile, 'path' | 'isBinary' | 'generated'>): Classification {
    if (file.generated && generatedCategory)
      return { category: generatedCategory, rule: 'GitLab marks this file as generated' }
    for (const entry of compiled) {
      if (entry.category.builtin)
        continue
      const rule = entry.match.find(candidate => candidate.test(file.path))
      if (rule)
        return { category: entry.category, rule: rule.source }
    }
    return { category: fallback(file.isBinary ? 'other' : 'code'), rule: null }
  }

  function isCollapsedByDefault(file: DiffFile) {
    const { category } = classify(file)
    if (!category.collapsed)
      return false
    const entry = compiled.find(item => item.category.id === category.id)
    return !entry?.keepExpanded.some(rule => rule.test(file.path))
  }

  function group(files: DiffFile[]): FileGroup[] {
    const buckets = new Map<string, DiffFile[]>()
    for (const file of files) {
      const { category } = classify(file)
      const bucket = buckets.get(category.id) ?? []
      bucket.push(file)
      buckets.set(category.id, bucket)
    }
    const ordered = [...categories]
    for (const builtin of ['code', 'other'] as const) {
      if (!ordered.some(category => category.builtin === builtin))
        ordered.push(fallback(builtin))
    }
    return ordered.flatMap((category) => {
      const bucket = buckets.get(category.id)
      if (!bucket)
        return []
      return [{
        key: category.id,
        label: category.label,
        description: category.description,
        collapsed: category.collapsed,
        keepsSomeExpanded: category.keepExpanded.some(line => line.trim() && !line.trim().startsWith('#')),
        files: bucket.sort((a, b) => compareCompanionPaths(a.path, b.path)),
      }]
    })
  }

  return { classify, isCollapsedByDefault, group }
}

const COMPANION_INFIX = /\.(test|spec|stories|story|e2e|cy)(?=\.[^.]+$)/
const COMPANION_RANK: Record<string, number> = { test: 1, spec: 1, e2e: 1, cy: 1, stories: 2, story: 2 }

export function companionSortKey(path: string): [string, number] {
  const normalized = path.replace(/(^|\/)__(?:tests|mocks)__\//, '$1')
  const match = COMPANION_INFIX.exec(normalized)
  if (!match)
    return [normalized.replace(/\.[^./]+$/, ''), 0]
  const base = normalized.slice(0, match.index).replace(/\.(?:node|browser|unit|integration)$/, '')
  return [base, COMPANION_RANK[match[1]!] ?? 1]
}

export function compareCompanionPaths(a: string, b: string): number {
  const [baseA, rankA] = companionSortKey(a)
  const [baseB, rankB] = companionSortKey(b)
  return baseA.localeCompare(baseB) || rankA - rankB || a.localeCompare(b)
}
