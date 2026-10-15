import { describe, expect, it } from 'vitest'
import { isLfsPointerDiff } from './gitlab'

describe('isLfsPointerDiff', () => {
  it('spots LFS pointers whether the version line changed or not', () => {
    const unchanged = '@@ -1,3 +1,3 @@\n version https://git-lfs.github.com/spec/v1\n-oid sha256:aaa\n-size 1\n+oid sha256:bbb\n+size 2\n'
    expect(isLfsPointerDiff(unchanged)).toBe(true)
    expect(isLfsPointerDiff('@@ -0,0 +1,3 @@\n+version https://git-lfs.github.com/spec/v1\n+oid sha256:a\n+size 1\n')).toBe(true)
    expect(isLfsPointerDiff('@@ -1 +1 @@\n-const version = 1\n+const version = 2\n')).toBe(false)
  })
})
