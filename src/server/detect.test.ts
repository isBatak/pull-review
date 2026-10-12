import { describe, expect, it } from 'vitest'
import { parseGitRemote } from './detect'

describe('parseGitRemote', () => {
  it.each([
    ['git@gitlab.tradelocker.com:tradelocker/tradelocker.git', { host: 'gitlab.tradelocker.com', project: 'tradelocker/tradelocker' }],
    ['https://gitlab.com/group/sub/project.git', { host: 'gitlab.com', project: 'group/sub/project' }],
    ['ssh://git@gitlab.com:2222/group/project.git', { host: 'gitlab.com', project: 'group/project' }],
    ['https://oauth2:secret@gitlab.com/group/project', { host: 'gitlab.com', project: 'group/project' }],
  ])('parses %s', (url, expected) => {
    expect(parseGitRemote(url)).toEqual(expected)
  })

  it('rejects remotes without a project path', () => {
    expect(parseGitRemote('https://gitlab.com/onlygroup')).toBeNull()
    expect(parseGitRemote('not a url')).toBeNull()
  })
})
