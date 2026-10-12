import { describe, expect, it } from 'vitest'
import { jiraUrl, parseMrTitle } from './mr-title'

describe('parseMrTitle', () => {
  it('splits app tags, jira key and stacked level from the title', () => {
    expect(parseMrTitle('[WEB][APP][OFFICE][ADMIN][EXP][DS][DATA][AMPHORA][REPO] chore: update react query [EN-5655] [stacked-2]')).toEqual({
      text: 'chore: update react query',
      draft: false,
      apps: ['WEB', 'APP', 'OFFICE', 'ADMIN', 'EXP', 'DS', 'DATA', 'AMPHORA', 'REPO'].map(name => ({ name, qualifier: null })),
      jiraKeys: ['EN-5655'],
      stackedLevel: 2,
    })
  })

  it('keeps versions and bump types as qualifiers', () => {
    expect(parseMrTitle('[APP 0.192.7] chore: version packages').apps).toEqual([{ name: 'APP', qualifier: '0.192.7' }])
    expect(parseMrTitle('[OFFICE minor] feat: report [EN-5342]').apps).toEqual([{ name: 'OFFICE', qualifier: 'minor' }])
    expect(parseMrTitle('[BRAND 0.113.1][ACROPOLIS][COMMON] fix').apps.map(app => app.name)).toEqual(['BRAND', 'ACROPOLIS', 'COMMON'])
  })

  it('detects draft prefixes', () => {
    const parsed = parseMrTitle('Draft: [TAF] fix: teardown keeps accounts')
    expect(parsed.draft).toBe(true)
    expect(parsed.text).toBe('fix: teardown keeps accounts')
    expect(parsed.apps).toEqual([{ name: 'TAF', qualifier: null }])
  })

  it('handles titles without tags and drops placeholder jira keys', () => {
    expect(parseMrTitle('feat: alerts gating for pro')).toEqual({ text: 'feat: alerts gating for pro', draft: false, apps: [], jiraKeys: [], stackedLevel: null })
    expect(parseMrTitle('[CI][REPO] feat: label bot [EN-0000]').jiraKeys).toEqual([])
  })

  it('does not treat a leading jira key as an app tag', () => {
    const parsed = parseMrTitle('[EN-1234] fix crash')
    expect(parsed.apps).toEqual([])
    expect(parsed.jiraKeys).toEqual(['EN-1234'])
    expect(parsed.text).toBe('fix crash')
  })
})

describe('jiraUrl', () => {
  it('builds a browse link', () => {
    expect(jiraUrl('https://tradelocker.atlassian.net/', 'EN-5655')).toBe('https://tradelocker.atlassian.net/browse/EN-5655')
  })
})
