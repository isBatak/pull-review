import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '../../shared/grouping'
import { buildBackup, parseBackup } from './settings-backup'
import { DEFAULT_SETTINGS } from './settings'

const settings = {
  ...DEFAULT_SETTINGS,
  project: { host: 'gitlab.tradelocker.com', project: 'tradelocker/tradelocker' },
  teams: [{ id: 't1', name: 'Frontend', color: 'blue' as const, members: ['ivica.batinic'] }],
  groupLayout: 'tabs' as const,
}

describe('settings backup', () => {
  it('round trips settings and preferences', () => {
    const backup = buildBackup(settings, { diffLayout: 'unified', wrapLines: true, theme: 'dark', sidebarWidth: 340 }, new Date('2026-10-08T10:00:00Z'))
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.settings).toEqual(settings)
    expect(parsed.preferences).toEqual({ diffLayout: 'unified', wrapLines: true, theme: 'dark', sidebarWidth: 340 })
    expect(parsed.warnings).toEqual([])
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow('not valid JSON')
    expect(() => parseBackup('{"hello":1}')).toThrow('not a Pull Review settings file')
    expect(() => parseBackup('{"format":"pull-review-settings","version":99}')).toThrow('newer version')
  })

  it('skips broken teams and categories and falls back to defaults', () => {
    const parsed = parseBackup(JSON.stringify({
      format: 'pull-review-settings',
      version: 1,
      settings: {
        teams: [{ id: 'a', name: 'Ok', color: 'nope', members: ['x'] }, { name: 'missing id' }],
        categories: [{ id: 'bad' }],
        groupLayout: 'grid',
      },
      preferences: { diffLayout: 'diagonal', sidebarWidth: 5 },
    }))
    expect(parsed.settings.teams).toEqual([{ id: 'a', name: 'Ok', color: 'violet', members: ['x'] }])
    expect(parsed.settings.categories).toEqual(DEFAULT_CATEGORIES)
    expect(parsed.settings.groupLayout).toBe('sidebar')
    expect(parsed.preferences).toEqual({})
    expect(parsed.warnings).toHaveLength(2)
  })
})
