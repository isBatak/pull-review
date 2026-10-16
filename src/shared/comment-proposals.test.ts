import { describe, expect, it } from 'vitest'
import { readCommentInput, resolveCommentTarget } from './comment-proposals'

const diff = '@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n'

describe('readCommentInput', () => {
  it('reads a comment on the new version by default', () => {
    expect(readCommentInput({ path: 'b/src/a.ts', line: 2, body: ' Rename this. ' })).toEqual({ path: 'src/a.ts', side: 'additions', line: 2, body: 'Rename this.' })
  })

  it('reads comments on removed lines', () => {
    expect(readCommentInput({ path: 'src/a.ts', line: 2, side: 'old', body: 'Why?' })?.side).toBe('deletions')
  })

  it('ignores calls without a path, a line or text', () => {
    expect(readCommentInput({ line: 2, body: 'x' })).toBeNull()
    expect(readCommentInput({ path: 'a.ts', line: 'two', body: 'x' })).toBeNull()
    expect(readCommentInput({ path: 'a.ts', line: 2, body: ' ' })).toBeNull()
  })
})

describe('resolveCommentTarget', () => {
  const files = [{ path: 'src/a.ts', previousPath: 'src/old-a.ts', diff }]

  it('opens a draft on a line shown in the diff', () => {
    expect(resolveCommentTarget(files, { path: 'src/a.ts', side: 'additions', line: 2, body: 'x' })).toEqual({ kind: 'ok', draft: { path: 'src/a.ts', side: 'additions', line: 2, body: 'x' } })
    expect(resolveCommentTarget(files, { path: 'src/old-a.ts', side: 'deletions', line: 2, body: 'x' })).toMatchObject({ kind: 'ok', draft: { path: 'src/a.ts', side: 'deletions' } })
  })

  it('explains files and lines GitLab cannot take comments on', () => {
    expect(resolveCommentTarget(files, { path: 'src/b.ts', side: 'additions', line: 2, body: 'x' }).kind).toBe('problem')
    expect(resolveCommentTarget(files, { path: 'src/a.ts', side: 'additions', line: 40, body: 'x' }).kind).toBe('problem')
  })
})
