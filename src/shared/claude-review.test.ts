import type { ReviewFinding } from './claude-review'
import type { DiffFile } from './types'
import { describe, expect, it } from 'vitest'
import { buildFindingPatch, buildReviewSystemPrompt, DEFAULT_SIGNATURE, findingComment, findingCommentBody, findingDraftBody, findingPostBody, normalizeFindings, readReview, reviewSchema } from './claude-review'

const diff = [
  '@@ -10,6 +10,7 @@',
  ' function classify(fn) {',
  '   let result = false',
  '   fn.traverse({',
  '-    ReturnStatement(ret) { result = check(ret) },',
  '+    ReturnStatement(ret) {',
  '+      result = isNonNode(ctx, ret.node.argument)',
  '+    },',
  '   })',
  '   return result',
  '',
].join('\n')

function file(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    id: 'f1',
    path: 'src/transform.ts',
    previousPath: null,
    status: 'modified',
    diff,
    additions: 3,
    deletions: 1,
    isBinary: false,
    tooLarge: false,
    generated: false,
    aMode: '100644',
    bMode: '100644',
    ...overrides,
  }
}

function raw(overrides: Record<string, unknown> = {}) {
  return {
    path: 'src/transform.ts',
    side: 'new' as const,
    startLine: 14,
    endLine: 14,
    severity: 'medium' as const,
    title: 'Preserve earlier results',
    body: 'Each return overwrites `result`.',
    suggestion: '      result = result || isNonNode(ctx, ret.node.argument)',
    ...overrides,
  }
}

let counter = 0
const nextId = () => `id${++counter}`

describe('readReview', () => {
  it('reads structured output and falls back to JSON in the result text', () => {
    const review = { summary: 'Looks fine.', findings: [raw()] }
    expect(readReview({ structured_output: review })?.findings).toHaveLength(1)
    expect(readReview({ result: `Here:\n\`\`\`json\n${JSON.stringify(review)}\n\`\`\`` })?.summary).toBe('Looks fine.')
    expect(readReview({ result: 'no json' })).toBeNull()
  })

  it('drops malformed findings', () => {
    const review = readReview({ structured_output: { summary: '', findings: [raw(), raw({ severity: 'critical' }), { path: 1 }] } })
    expect(review?.findings).toHaveLength(1)
  })
})

describe('normalizeFindings', () => {
  it('keeps findings on diff lines and sorts by severity', () => {
    const { findings, dropped } = normalizeFindings([raw({ severity: 'low' }), raw({ severity: 'high', startLine: 13, endLine: 15, suggestion: null })], [file()], nextId)
    expect(dropped).toBe(0)
    expect(findings.map(finding => finding.severity)).toEqual(['high', 'low'])
    expect(findings[1]).toMatchObject({ side: 'additions', startLine: 14, endLine: 14, status: 'open' })
  })

  it('drops findings outside the diff or in unknown files', () => {
    const { findings, dropped } = normalizeFindings([raw({ startLine: 40, endLine: 41 }), raw({ path: 'other.ts' })], [file()], nextId)
    expect(findings).toEqual([])
    expect(dropped).toBe(2)
  })

  it('defaults to a blocking issue unless the severity is low', () => {
    const { findings } = normalizeFindings([raw({ severity: 'low' }), raw({ severity: 'high' }), raw({ label: 'question', blocking: false })], [file()], nextId)
    expect(findings.map(finding => [finding.severity, finding.label, finding.blocking])).toEqual([
      ['high', 'issue', true],
      ['medium', 'question', false],
      ['low', 'issue', false],
    ])
  })

  it('narrows a range to visible lines and then drops the suggestion', () => {
    const { findings } = normalizeFindings([raw({ startLine: 5, endLine: 14 })], [file()], nextId)
    expect(findings[0]).toMatchObject({ startLine: 10, endLine: 14, suggestion: null })
  })

  it('maps old side findings to removed lines without a suggestion', () => {
    const { findings } = normalizeFindings([raw({ side: 'old', startLine: 13, endLine: 13 })], [file()], nextId)
    expect(findings[0]).toMatchObject({ side: 'deletions', startLine: 13, suggestion: null })
  })
})

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'f',
    path: 'src/transform.ts',
    side: 'additions',
    startLine: 14,
    endLine: 15,
    severity: 'high',
    label: 'issue',
    blocking: true,
    title: 'Fix it',
    body: 'Because.',
    suggestion: 'a\nb',
    status: 'open',
    draft: null,
    ...overrides,
  }
}

describe('findingCommentBody', () => {
  it('anchors the GitLab suggestion on the last line of the range', () => {
    expect(findingCommentBody(finding())).toBe('**issue (blocking):** Fix it\n\nBecause.\n\n```suggestion:-1+0\na\nb\n```')
  })

  it('omits the suggestion when there is none', () => {
    expect(findingCommentBody(finding({ suggestion: null, label: 'question', blocking: false }))).toBe('**question (non-blocking):** Fix it\n\nBecause.')
  })
})

describe('findingPostBody', () => {
  it('posts the edited draft when there is one', () => {
    expect(findingPostBody(finding({ draft: 'My words' }), null)).toBe('My words')
    expect(findingPostBody(finding(), null)).toBe(findingCommentBody(finding()))
  })

  it('adds the signature only when posting', () => {
    expect(findingPostBody(finding({ draft: 'My words' }), 'Drafted with Claude.')).toBe('My words\n\n<sub>Drafted with Claude.</sub>')
    expect(findingDraftBody(finding({ draft: 'My words' }))).toBe('My words')
  })

  it('drops the old built-in footer from drafts edited before the setting existed', () => {
    const old = finding({ draft: `My words\n\n<sub>${DEFAULT_SIGNATURE}</sub>` })
    expect(findingDraftBody(old)).toBe('My words')
    expect(findingPostBody(old, null)).toBe('My words')
    expect(findingPostBody(old, DEFAULT_SIGNATURE)).toBe(`My words\n\n<sub>${DEFAULT_SIGNATURE}</sub>`)
  })
})

describe('findingComment', () => {
  it('posts on the last line with the whole range', () => {
    expect(findingComment(finding({ startLine: 13, endLine: 15 }), file())).toEqual({
      oldPath: 'src/transform.ts',
      newPath: 'src/transform.ts',
      oldLine: null,
      newLine: 15,
      range: { start: { oldLine: null, newLine: 13 }, end: { oldLine: null, newLine: 15 } },
    })
  })

  it('posts a single line without a range', () => {
    expect(findingComment(finding({ startLine: 14, endLine: 14 }), file())).toEqual({ oldPath: 'src/transform.ts', newPath: 'src/transform.ts', oldLine: null, newLine: 14 })
  })
})

describe('buildFindingPatch', () => {
  it('replaces the range with context lines around it', () => {
    const contents = ['1', '2', '3', '4', '5', '6', '7', '8'].join('\n')
    const patch = buildFindingPatch(finding({ startLine: 4, endLine: 5, suggestion: 'x' }), `${contents}\n`)
    expect(patch).toBe([
      '--- a/src/transform.ts',
      '+++ b/src/transform.ts',
      '@@ -1,8 +1,7 @@',
      ' 1',
      ' 2',
      ' 3',
      '-4',
      '-5',
      '+x',
      ' 6',
      ' 7',
      ' 8',
      '',
    ].join('\n'))
  })

  it('returns null when the file is shorter than the range', () => {
    expect(buildFindingPatch(finding({ startLine: 20, endLine: 21 }), 'a\nb\n')).toBeNull()
  })
})

describe('review modes', () => {
  const labelsOf = (mode: 'focused' | 'thorough') => reviewSchema(mode).properties.findings.items.properties.label.enum

  it('allows nitpicks and praise only in a thorough review', () => {
    expect(labelsOf('focused')).toEqual(['issue', 'todo', 'suggestion', 'question'])
    expect(labelsOf('thorough')).toEqual(expect.arrayContaining(['nitpick', 'praise', 'typo', 'thought']))
  })

  it('tells Claude to skip style only in a focused review', () => {
    const prompt = (mode: 'focused' | 'thorough') => buildReviewSystemPrompt({ contextDir: '/c', worktreeDir: null, mode })
    expect(prompt('focused')).toContain('Do not report style')
    expect(prompt('thorough')).toContain('nitpick for a small naming')
    expect(prompt('thorough')).not.toContain('Do not report style')
  })

  it('never blocks on nitpicks or praise and lists them after problems', () => {
    const { findings } = normalizeFindings([
      raw({ label: 'praise', blocking: true, severity: 'low' }),
      raw({ label: 'nitpick', blocking: true, severity: 'medium' }),
      raw({ label: 'issue', blocking: true, severity: 'medium' }),
    ], [file()], nextId)
    expect(findings.map(finding => [finding.label, finding.blocking])).toEqual([
      ['issue', true],
      ['nitpick', false],
      ['praise', false],
    ])
  })
})
