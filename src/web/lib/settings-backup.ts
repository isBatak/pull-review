import type { CategoryConfig } from '../../shared/grouping'
import { isReviewMode, MAX_SIGNATURE_LENGTH } from '../../shared/claude-review'
import type { AppSettings, Team } from './settings'
import { CHAT_EFFORTS, CHAT_MODELS } from '../../shared/chat'
import { DEFAULT_BUNDLE_SETTINGS, DEFAULT_SETTINGS, TEAM_COLORS } from './settings'

export const BACKUP_FORMAT = 'pull-review-settings'
export const BACKUP_VERSION = 1

export const PREFERENCE_KEYS = {
  diffLayout: 'pull-review:layout',
  wrapLines: 'pull-review:wrap',
  theme: 'pull-review:theme',
  sidebarWidth: 'pull-review:sidebar-width',
} as const

export interface Preferences {
  diffLayout?: 'split' | 'unified'
  wrapLines?: boolean
  theme?: 'light' | 'dark' | null
  sidebarWidth?: number
}

export interface SettingsBackup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  settings: AppSettings
  preferences: Preferences
}

export interface ParsedBackup {
  settings: AppSettings
  preferences: Preferences
  warnings: string[]
}

export interface DetectedRepo {
  host: string
  project: string
  path: string
}

export function buildBackup(settings: AppSettings, preferences: Preferences, now = new Date(), detectedRepo: DetectedRepo | null = null): SettingsBackup {
  const detectedKey = detectedRepo && `${detectedRepo.host}/${detectedRepo.project}`
  const localRepos = detectedRepo && detectedKey && settings.localRepos[detectedKey] === undefined
    ? { ...settings.localRepos, [detectedKey]: detectedRepo.path }
    : settings.localRepos
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), settings: { ...settings, localRepos }, preferences }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null
}

function readTeam(value: unknown): Team | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string')
    return null
  const members = stringList(value.members)
  if (!members)
    return null
  const color = TEAM_COLORS.includes(value.color as Team['color']) ? value.color as Team['color'] : 'violet'
  return { id: value.id, name: value.name, color, members }
}

function readCategory(value: unknown): CategoryConfig | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string')
    return null
  const match = stringList(value.match)
  const keepExpanded = stringList(value.keepExpanded ?? [])
  if (!match || !keepExpanded)
    return null
  const builtin = value.builtin === 'code' || value.builtin === 'other' ? value.builtin : undefined
  return {
    id: value.id,
    label: value.label,
    description: typeof value.description === 'string' ? value.description : '',
    match,
    keepExpanded,
    collapsed: value.collapsed === true,
    ...(builtin ? { builtin } : {}),
    ...(value.includeGitlabGenerated === true ? { includeGitlabGenerated: true } : {}),
  }
}

export function parseBackup(text: string): ParsedBackup {
  let data: unknown
  try {
    data = JSON.parse(text)
  }
  catch {
    throw new Error('This file is not valid JSON.')
  }
  if (!isRecord(data) || data.format !== BACKUP_FORMAT)
    throw new Error('This is not a Pull Review settings file.')
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION)
    throw new Error('This settings file is from a newer version of Pull Review.')

  const warnings: string[] = []
  const raw = isRecord(data.settings) ? data.settings : {}
  const settings: AppSettings = { ...DEFAULT_SETTINGS }

  if (isRecord(raw.project) && typeof raw.project.host === 'string' && typeof raw.project.project === 'string')
    settings.project = { host: raw.project.host, project: raw.project.project }
  if (typeof raw.jiraBaseUrl === 'string' && raw.jiraBaseUrl.trim())
    settings.jiraBaseUrl = raw.jiraBaseUrl
  if (raw.groupLayout === 'sidebar' || raw.groupLayout === 'tabs')
    settings.groupLayout = raw.groupLayout

  if (typeof raw.editor === 'string' && raw.editor.trim())
    settings.editor = raw.editor

  if (raw.chatSelection === 'automatic' || raw.chatSelection === 'manual')
    settings.chatSelection = raw.chatSelection
  if (CHAT_MODELS.some(option => option.id === raw.chatModel))
    settings.chatModel = raw.chatModel as string
  if (CHAT_EFFORTS.some(option => option.id === raw.chatEffort))
    settings.chatEffort = raw.chatEffort as string
  if (CHAT_MODELS.some(option => option.id === raw.commitModel))
    settings.commitModel = raw.commitModel as string
  if (CHAT_EFFORTS.some(option => option.id === raw.commitEffort))
    settings.commitEffort = raw.commitEffort as string
  if (CHAT_MODELS.some(option => option.id === raw.reviewModel))
    settings.reviewModel = raw.reviewModel as string
  if (CHAT_EFFORTS.some(option => option.id === raw.reviewEffort))
    settings.reviewEffort = raw.reviewEffort as string
  if (typeof raw.reviewAutoPost === 'boolean')
    settings.reviewAutoPost = raw.reviewAutoPost
  if (isReviewMode(raw.reviewMode))
    settings.reviewMode = raw.reviewMode
  if (typeof raw.reviewSignature === 'boolean')
    settings.reviewSignature = raw.reviewSignature
  if (typeof raw.liveMergeStatus === 'boolean')
    settings.liveMergeStatus = raw.liveMergeStatus
  if (typeof raw.reviewSignatureText === 'string' && raw.reviewSignatureText.trim())
    settings.reviewSignatureText = raw.reviewSignatureText.slice(0, MAX_SIGNATURE_LENGTH)

  if (isRecord(raw.localRepos)) {
    settings.localRepos = Object.fromEntries(
      Object.entries(raw.localRepos).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  }

  if (Array.isArray(raw.teams)) {
    const teams = raw.teams.map(readTeam)
    settings.teams = teams.filter((team): team is Team => team !== null)
    if (settings.teams.length < teams.length)
      warnings.push(`${teams.length - settings.teams.length} team(s) were skipped because they were incomplete.`)
  }

  if (Array.isArray(raw.categories)) {
    const categories = raw.categories.map(readCategory)
    const valid = categories.filter((category): category is CategoryConfig => category !== null)
    if (valid.length)
      settings.categories = valid
    else
      warnings.push('No valid categories were found, so the default categories are kept.')
    if (valid.length && valid.length < categories.length)
      warnings.push(`${categories.length - valid.length} categories were skipped because they were incomplete.`)
  }

  if (isRecord(raw.bundle)) {
    const bundle = { ...DEFAULT_BUNDLE_SETTINGS }
    for (const key of ['jobName', 'analysisPath', 'modulesPath', 'baseBranch'] as const) {
      if (typeof raw.bundle[key] === 'string')
        bundle[key] = raw.bundle[key]
    }
    for (const key of ['budgetBytes', 'thresholdBytes'] as const) {
      const value = raw.bundle[key]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
        bundle[key] = Math.round(value)
    }
    settings.bundle = bundle
  }

  const rawPreferences = isRecord(data.preferences) ? data.preferences : {}
  const preferences: Preferences = {}
  if (rawPreferences.diffLayout === 'split' || rawPreferences.diffLayout === 'unified')
    preferences.diffLayout = rawPreferences.diffLayout
  if (typeof rawPreferences.wrapLines === 'boolean')
    preferences.wrapLines = rawPreferences.wrapLines
  if (rawPreferences.theme === 'light' || rawPreferences.theme === 'dark' || rawPreferences.theme === null)
    preferences.theme = rawPreferences.theme
  if (typeof rawPreferences.sidebarWidth === 'number' && rawPreferences.sidebarWidth >= 160 && rawPreferences.sidebarWidth <= 2000)
    preferences.sidebarWidth = Math.round(rawPreferences.sidebarWidth)

  return { settings, preferences, warnings }
}

export function backupFileName(now = new Date()) {
  return `pull-review-settings-${now.toISOString().slice(0, 10)}.json`
}
