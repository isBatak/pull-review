export const CHECK_FOR_UPDATES_MENU_ID = 'check-for-updates'

export interface UpdateInfo {
  current: string
  latest: string
  notes: string | null
}

export interface ChangelogSection {
  version: string
  heading: string
  body: string
}

const SECTION_HEADING = /^## v?(\d+\.\d+\.\d+)(?:\s|$)/

export function changelogSections(changelog: string): ChangelogSection[] {
  const sections: ChangelogSection[] = []
  let current: { version: string, heading: string, lines: string[] } | null = null
  const finish = () => {
    if (current)
      sections.push({ version: current.version, heading: current.heading, body: current.lines.join('\n').trim() })
  }
  for (const line of changelog.split('\n')) {
    if (line.startsWith('## ')) {
      finish()
      const version = SECTION_HEADING.exec(line)?.[1]
      current = version ? { version, heading: line.slice(3).trim(), lines: [] } : null
    }
    else {
      current?.lines.push(line)
    }
  }
  finish()
  return sections
}

export function changelogSection(changelog: string, version: string): string | null {
  return changelogSections(changelog).find(section => section.version === version)?.body || null
}

export function compareVersions(a: string, b: string) {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0)
      return difference
  }
  return 0
}

export function notesSince(notes: string, current: string): string {
  const sections = changelogSections(notes)
  if (sections.length === 0)
    return notes
  const newer = sections.filter(section => compareVersions(section.version, current) > 0 && section.body)
  if (newer.length <= 1)
    return newer[0]?.body ?? ''
  return newer.map(section => `## ${section.heading}\n\n${section.body}`).join('\n\n')
}

export function githubReleaseRepo(manifestUrl: string): string | null {
  return /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/latest\/download\/manifest\.json$/.exec(manifestUrl)?.[1] ?? null
}

export function githubAssetUrl(repo: string, tag: string, file: string) {
  return `https://github.com/${repo}/releases/download/${tag}/${file}`
}
