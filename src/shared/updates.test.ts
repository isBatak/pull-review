import { describe, expect, it } from 'vitest'
import { changelogSection, changelogSections, compareVersions, githubAssetUrl, githubReleaseRepo, notesSince } from './updates'

const CHANGELOG = `# Changelog

## 0.2.10 (2026-10-16)

### Updates

- Check for updates.

## 0.2.1 (2026-10-01)

- Older.
`

describe('changelogSection', () => {
  it('returns the body of the matching version', () => {
    expect(changelogSection(CHANGELOG, '0.2.10')).toBe('### Updates\n\n- Check for updates.')
  })

  it('reads the last section to the end of the file', () => {
    expect(changelogSection(CHANGELOG, '0.2.1')).toBe('- Older.')
  })

  it('does not match a version that only shares a prefix', () => {
    expect(changelogSection(CHANGELOG, '0.2.1.0')).toBeNull()
    expect(changelogSection('## 0.2.10\n\n- x', '0.2.1')).toBeNull()
  })

  it('returns null for a missing or empty section', () => {
    expect(changelogSection(CHANGELOG, '9.9.9')).toBeNull()
    expect(changelogSection('## 1.0.0\n\n## 0.9.0\n- x', '1.0.0')).toBeNull()
  })
})

describe('changelogSections', () => {
  it('lists each version with its heading and body, newest first', () => {
    expect(changelogSections(CHANGELOG)).toEqual([
      { version: '0.2.10', heading: '0.2.10 (2026-10-16)', body: '### Updates\n\n- Check for updates.' },
      { version: '0.2.1', heading: '0.2.1 (2026-10-01)', body: '- Older.' },
    ])
  })

  it('skips sections that are not versions', () => {
    expect(changelogSections('## Unreleased\n\n- Soon.\n\n## 1.0.0\n\n- Done.')).toEqual([
      { version: '1.0.0', heading: '1.0.0', body: '- Done.' },
    ])
  })
})

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    expect(compareVersions('0.2.10', '0.2.9')).toBeGreaterThan(0)
    expect(compareVersions('0.2.9', '0.3.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })
})

describe('notesSince', () => {
  const notes = `## 0.2.12 (2026-10-20)

- Newest.

## 0.2.11 (2026-10-18)

### Fixes

- Middle.

## 0.2.10 (2026-10-16)

- Installed.`

  it('shows every version newer than the installed one, with headings', () => {
    expect(notesSince(notes, '0.2.10')).toBe('## 0.2.12 (2026-10-20)\n\n- Newest.\n\n## 0.2.11 (2026-10-18)\n\n### Fixes\n\n- Middle.')
  })

  it('drops the heading when only one version is new', () => {
    expect(notesSince(notes, '0.2.11')).toBe('- Newest.')
  })

  it('keeps notes without version headings as they are', () => {
    expect(notesSince('- Plain notes.', '0.2.10')).toBe('- Plain notes.')
  })
})

describe('githubReleaseRepo', () => {
  it('reads the repository from a latest-release manifest url', () => {
    expect(githubReleaseRepo('https://github.com/isBatak/pull-review/releases/latest/download/manifest.json')).toBe('isBatak/pull-review')
  })

  it('rejects other urls', () => {
    expect(githubReleaseRepo('https://example.com/manifest.json')).toBeNull()
    expect(githubReleaseRepo('https://github.com/a/b/releases/download/v1/manifest.json')).toBeNull()
  })
})

describe('githubAssetUrl', () => {
  it('points at the tagged release asset', () => {
    expect(githubAssetUrl('a/b', 'v1.0.0', 'app-1.0.0.zip')).toBe('https://github.com/a/b/releases/download/v1.0.0/app-1.0.0.zip')
  })
})
