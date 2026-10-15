import { describe, expect, it } from 'vitest'
import { withGitHeaders } from './patch'

describe('withGitHeaders', () => {
  it('adds a diff --git line before each file that has none', () => {
    const patch = '--- a/one.js\n+++ b/one.js\n@@ -1 +1 @@\n-x\n+y\n--- a/two.js\n+++ b/two.js\n@@ -1 +1 @@\n-a\n+b\n'
    expect(withGitHeaders(patch)).toBe(`diff --git a/one.js b/one.js\n${patch.replace('--- a/two.js', 'diff --git a/two.js b/two.js\n--- a/two.js')}`)
  })

  it('keeps existing headers and handles new and deleted files', () => {
    const existing = 'diff --git a/one.js b/one.js\nindex 1..2 100644\n--- a/one.js\n+++ b/one.js\n'
    expect(withGitHeaders(existing)).toBe(existing)
    expect(withGitHeaders('--- /dev/null\n+++ b/new.js\n')).toBe('diff --git a/new.js b/new.js\n--- /dev/null\n+++ b/new.js\n')
    expect(withGitHeaders('--- a/old.js\n+++ /dev/null\n')).toBe('diff --git a/old.js b/old.js\n--- a/old.js\n+++ /dev/null\n')
  })
})
