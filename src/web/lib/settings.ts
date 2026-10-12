import type { CategoryConfig } from '../../shared/grouping'
import type { BundleSettings, ProjectRef } from '../../shared/types'
import { useCallback, useMemo } from 'react'
import { createClassifier, DEFAULT_CATEGORIES } from '../../shared/grouping'
import { useStoredState } from './stored-state'

export const TEAM_COLORS = ['violet', 'blue', 'teal', 'green', 'amber', 'orange', 'rose', 'slate'] as const
export type TeamColor = typeof TEAM_COLORS[number]

export interface Team {
  id: string
  name: string
  color: TeamColor
  members: string[]
}

export type GroupLayout = 'sidebar' | 'tabs'

export type ChatSelectionMode = 'automatic' | 'manual'

export interface AppSettings {
  project: ProjectRef | null
  jiraBaseUrl: string
  teams: Team[]
  groupLayout: GroupLayout
  categories: CategoryConfig[]
  bundle: BundleSettings
  localRepos: Record<string, string>
  chatSelection: ChatSelectionMode
  editor: string
}

export const DEFAULT_BUNDLE_SETTINGS: BundleSettings = {
  jobName: 'fe:build-arm64:app',
  analysisPath: 'apps/frontend/app/.next/analyze/__bundle_analysis.json',
  modulesPath: 'apps/frontend/app/.next/analyze/client.json',
  baseBranch: 'develop',
  budgetBytes: 614400,
  thresholdBytes: 1024,
}

export const DEFAULT_SETTINGS: AppSettings = {
  project: null,
  jiraBaseUrl: 'https://tradelocker.atlassian.net',
  teams: [],
  groupLayout: 'sidebar',
  categories: DEFAULT_CATEGORIES,
  bundle: DEFAULT_BUNDLE_SETTINGS,
  localRepos: {},
  chatSelection: 'automatic',
  editor: 'auto',
}

export function useSettings() {
  const [stored, setStored] = useStoredState<AppSettings>('pull-review:settings', DEFAULT_SETTINGS)
  const settings = { ...DEFAULT_SETTINGS, ...stored, bundle: { ...DEFAULT_BUNDLE_SETTINGS, ...stored.bundle } }
  const update = useCallback((patch: Partial<AppSettings>) => setStored({ ...settings, ...patch }), [settings, setStored])
  return [settings, update] as const
}

export function useClassifier() {
  const [settings] = useSettings()
  return useMemo(() => createClassifier(settings.categories), [settings.categories])
}

export function createTeamId() {
  return Math.random().toString(36).slice(2, 10)
}

export function parseProjectInput(input: string): ProjectRef | null {
  const value = input.trim().replace(/\/+$/, '')
  if (!value)
    return null
  try {
    const url = new URL(/^https?:\/\//.test(value) ? value : `https://${value}`)
    const project = url.pathname.replace(/^\/+/, '').split('/-/')[0]!.replace(/\/+$/, '')
    if (!project.includes('/'))
      return null
    return { host: url.host, project }
  }
  catch {
    return null
  }
}
