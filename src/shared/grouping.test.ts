import type { CategoryConfig } from './grouping'
import type { DiffFile } from './types'
import { describe, expect, it } from 'vitest'
import { compareCompanionPaths, createClassifier, DEFAULT_CATEGORIES, isRuleError, parseRule, parseRules } from './grouping'

function file(path: string, overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    id: path,
    path,
    previousPath: null,
    status: 'modified',
    diff: '',
    additions: 0,
    deletions: 0,
    isBinary: false,
    tooLarge: false,
    generated: false,
    aMode: '100644',
    bMode: '100644',
    ...overrides,
  }
}

function matcher(line: string) {
  const rule = parseRule(line)
  if (!rule || isRuleError(rule))
    throw new Error(`Expected a valid rule for ${line}`)
  return rule.test
}

const defaults = createClassifier(DEFAULT_CATEGORIES)

describe('parseRule', () => {
  it('matches a pattern without a slash against the file name in any folder', () => {
    expect(matcher('*.po')('apps/web/i18n/de.po')).toBe(true)
    expect(matcher('package.json')('apps/web/package.json')).toBe(true)
  })

  it('treats a trailing slash as a folder anywhere, or rooted when it has a slash', () => {
    expect(matcher('locales/')('apps/app/public/locales/en/a.json')).toBe(true)
    expect(matcher('locales/')('apps/app/public/locale/en/a.json')).toBe(false)
    expect(matcher('libs/frontend/')('libs/frontend/ds/a.ts')).toBe(true)
    expect(matcher('libs/frontend/')('apps/libs/frontend/a.ts')).toBe(false)
  })

  it('matches a pattern with a slash against the full path and supports regex', () => {
    expect(matcher('libs/**/tests/**')('libs/ds/tests/a.ts')).toBe(true)
    expect(matcher('/\\.e2e\\.ts$/i')('apps/a.E2E.ts')).toBe(true)
  })

  it('skips blanks and comments and reports invalid regex', () => {
    expect(parseRule('   ')).toBeNull()
    expect(parseRule('# note')).toBeNull()
    const { rules, errors } = parseRules(['*.ts', '/[unclosed/', ''])
    expect(rules).toHaveLength(1)
    expect(errors.map(error => error.source)).toEqual(['/[unclosed/'])
  })
})

describe('default categories', () => {
  it.each([
    ['apps/web/src/App.tsx', 'code'],
    ['apps/web/src/App.test.tsx', 'code'],
    ['libs/ds/src/Button.stories.tsx', 'code'],
    ['apps/frontend/app/next.config.ts', 'code'],
    ['apps/web/vite.config.ts', 'code'],
    ['eslint.config.js', 'config'],
    ['apps/web/vitest.config.ts', 'config'],
    ['apps/frontend/app/public/locales/hr/navigation.json', 'translations'],
    ['apps/frontend/app/src/app/[lang]/_navigation/experiments-links.tsx', 'code'],
    ['libs/frontend/ds/tests/screen-diff-snapshots/alert--basic-theme-dark.png', 'visual-snapshots'],
    ['libs/frontend/ds/tests/screen-diff.spec.ts-snapshots/avatar--basic-theme-light.png', 'visual-snapshots'],
    ['apps/test-automation-framework/api/bapi/tests/__snapshots__/report.spec.ts.snap', 'test-snapshots'],
    ['apps/frontend/experiments/docs/i18n.md', 'docs'],
    ['.changeset/mr-6039-admin.md', 'changesets'],
    ['.changeset/config.json', 'changesets'],
    ['README.md', 'docs'],
    ['.gitlab-ci.yml', 'config'],
    ['apps/frontend/admin/Dockerfile', 'config'],
    ['libs/frontend/ds/.eslintrc.cjs', 'config'],
    ['apps/web/package.json', 'deps'],
    ['pnpm-lock.yaml', 'generated'],
    ['yarn.lock', 'generated'],
  ])('%s is %s', (path, expected) => {
    expect(defaults.classify(file(path)).category.id).toBe(expected)
  })

  it('uses the GitLab generated flag and the binary fallback', () => {
    expect(defaults.classify(file('src/api.ts', { generated: true })).category.id).toBe('generated')
    expect(defaults.classify(file('assets/logo.png', { isBinary: true })).category.id).toBe('other')
    expect(defaults.classify(file('libs/ds/tests/screen-diff-snapshots/a.png', { isBinary: true })).category.id).toBe('visual-snapshots')
  })

  it('reports which rule matched', () => {
    expect(defaults.classify(file('.changeset/a.md'))).toMatchObject({ rule: '.changeset/' })
    expect(defaults.classify(file('src/a.ts')).rule).toBeNull()
  })

  it('collapses lockfiles, test snapshots and non-English locales only', () => {
    expect(defaults.isCollapsedByDefault(file('pnpm-lock.yaml'))).toBe(true)
    expect(defaults.isCollapsedByDefault(file('tests/__snapshots__/a.spec.ts.snap'))).toBe(true)
    expect(defaults.isCollapsedByDefault(file('apps/app/public/locales/de/common.json'))).toBe(true)
    expect(defaults.isCollapsedByDefault(file('apps/app/public/locales/en/common.json'))).toBe(false)
    expect(defaults.isCollapsedByDefault(file('apps/app/public/locales/en-US/common.json'))).toBe(false)
    expect(defaults.isCollapsedByDefault(file('src/app.ts'))).toBe(false)
  })
})

describe('custom categories', () => {
  const api: CategoryConfig = { id: 'api', label: 'API client', description: '', match: ['libs/frontend/data/bapi/'], keepExpanded: [], collapsed: true }

  it('lets a user category claim files before the defaults that follow it', () => {
    const classifier = createClassifier([DEFAULT_CATEGORIES[0]!, api, ...DEFAULT_CATEGORIES.slice(1)])
    expect(classifier.classify(file('libs/frontend/data/bapi/models/Account.ts')).category.id).toBe('api')
    expect(classifier.isCollapsedByDefault(file('libs/frontend/data/bapi/models/Account.ts'))).toBe(true)
  })

  it('keeps working without built in categories and orders groups as listed', () => {
    const classifier = createClassifier([api])
    const groups = classifier.group([file('src/b.ts'), file('libs/frontend/data/bapi/a.ts'), file('img.png', { isBinary: true })])
    expect(groups.map(group => group.key)).toEqual(['api', 'code', 'other'])
  })

  it('ignores invalid rules instead of failing', () => {
    const classifier = createClassifier([{ ...api, match: ['/[broken/', 'bapi/'] }])
    expect(classifier.classify(file('x/bapi/a.ts')).category.id).toBe('api')
  })
})

describe('group', () => {
  it('orders groups by category order and pairs companions', () => {
    const groups = defaults.group([file('b.ts'), file('README.md'), file('a.test.ts'), file('a.ts'), file('pnpm-lock.yaml')])
    expect(groups.map(group => group.key)).toEqual(['code', 'docs', 'generated'])
    expect(groups[0]!.files.map(f => f.path)).toEqual(['a.ts', 'a.test.ts', 'b.ts'])
  })
})

describe('compareCompanionPaths', () => {
  it('puts tests and stories right after their source file', () => {
    const paths = ['src/proxy.spec.ts', 'src/proxy.ts', 'src/middleware.node.spec.ts', 'src/middleware.ts', 'src/Button.stories.tsx', 'src/Button.tsx', 'src/Button.test.tsx']
    expect([...paths].sort(compareCompanionPaths)).toEqual([
      'src/Button.tsx',
      'src/Button.test.tsx',
      'src/Button.stories.tsx',
      'src/middleware.ts',
      'src/middleware.node.spec.ts',
      'src/proxy.ts',
      'src/proxy.spec.ts',
    ])
  })

  it('pairs files in __tests__ with the source in the parent folder', () => {
    expect(['src/__tests__/util.test.ts', 'src/util.ts', 'src/other.ts'].sort(compareCompanionPaths)).toEqual(['src/other.ts', 'src/util.ts', 'src/__tests__/util.test.ts'])
  })
})
