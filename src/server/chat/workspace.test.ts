import { describe, expect, it } from 'vitest'
import { expandHome, findMatchingRemote } from '../local/git'
import { slugFor } from './workspace'

describe('findMatchingRemote', () => {
  const output = [
    'remote.fork.url git@gitlab.com:me/project.git',
    'remote.origin.url git@gitlab.example.com:Group/Project.git',
  ].join('\n')

  it('finds the remote for the project, ignoring case', () => {
    expect(findMatchingRemote(output, 'group/project')).toBe('origin')
  })

  it('returns null when no remote matches', () => {
    expect(findMatchingRemote(output, 'other/project')).toBeNull()
  })
})

describe('expandHome', () => {
  it('expands a leading tilde and drops trailing slashes', () => {
    expect(expandHome('~/code/app/', '/Users/me')).toBe('/Users/me/code/app')
    expect(expandHome('~', '/Users/me')).toBe('/Users/me')
    expect(expandHome('/opt/app', '/Users/me')).toBe('/opt/app')
  })
})

describe('slugFor', () => {
  it('makes a folder-safe name', () => {
    expect(slugFor({ host: 'gitlab.com', project: 'group/sub/app', iid: 42 })).toBe('gitlab.com-group-sub-app-42')
  })
})
