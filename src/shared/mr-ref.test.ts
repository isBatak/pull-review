import { describe, expect, it } from 'vitest'
import { mrAppPath, parseMrRef } from './mr-ref'

describe('parseMrRef', () => {
  it('parses a full GitLab MR url with a trailing tab', () => {
    expect(parseMrRef('https://gitlab.tradelocker.com/tradelocker/tradelocker/-/merge_requests/6039/diffs')).toEqual({
      host: 'gitlab.tradelocker.com',
      project: 'tradelocker/tradelocker',
      iid: 6039,
    })
  })

  it('keeps nested groups and ignores query and hash', () => {
    expect(parseMrRef('https://gitlab.com/a/b/c/-/merge_requests/12?tab=x#note_1')).toEqual({
      host: 'gitlab.com',
      project: 'a/b/c',
      iid: 12,
    })
  })

  it('parses an app path', () => {
    expect(parseMrRef('/gitlab.com/group/project/-/merge_requests/7')).toEqual({
      host: 'gitlab.com',
      project: 'group/project',
      iid: 7,
    })
  })

  it('parses a short reference with the default host', () => {
    expect(parseMrRef('group/project!42', 'gitlab.com')).toEqual({ host: 'gitlab.com', project: 'group/project', iid: 42 })
    expect(parseMrRef('group/project!42')).toBeNull()
    expect(parseMrRef('git.example.com:group/project!42')).toEqual({ host: 'git.example.com', project: 'group/project', iid: 42 })
  })

  it('rejects non MR urls', () => {
    expect(parseMrRef('https://gitlab.com/group/project/-/issues/3')).toBeNull()
    expect(parseMrRef('')).toBeNull()
  })

  it('round trips through the app path', () => {
    const ref = { host: 'gitlab.com', project: 'a/b', iid: 3 }
    expect(parseMrRef(mrAppPath(ref))).toEqual(ref)
  })
})
