import { describe, expect, it } from 'vitest'
import { worktreeWithBranch } from './repo-link'

const LIST = [
  'worktree /code/app',
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/main',
  '',
  'worktree /code/app-review',
  'HEAD 2222222222222222222222222222222222222222',
  'detached',
  '',
  'worktree /code/app-feature',
  'HEAD 3333333333333333333333333333333333333333',
  'branch refs/heads/feature/long-name',
  '',
].join('\n')

describe('worktreeWithBranch', () => {
  it('finds the other folder that has the branch checked out', () => {
    expect(worktreeWithBranch(LIST, 'feature/long-name', '/code/app-review')).toBe('/code/app-feature')
    expect(worktreeWithBranch(LIST, 'main', '/code/app-review')).toBe('/code/app')
  })

  it('ignores the folder itself and branches nobody has', () => {
    expect(worktreeWithBranch(LIST, 'feature/long-name', '/code/app-feature')).toBeNull()
    expect(worktreeWithBranch(LIST, 'nope', '/code/app-review')).toBeNull()
  })
})
