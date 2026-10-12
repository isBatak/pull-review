import type { getIconData as GetIconData } from '@iconify/utils'
import iconSet from '@iconify-json/vscode-icons/icons.json' with { type: 'json' }
import { getIconData, iconToHTML, iconToSVG } from '@iconify/utils'
import { getIconForFile, getIconForFolder, getIconForOpenFolder } from 'vscode-icons-js'

export type IconTheme = 'light' | 'dark'

const icons = iconSet as Parameters<typeof GetIconData>[0]

const FILE_OVERRIDES: [RegExp, string][] = [
  [/^(?:.+\.)?dockerfile(?:\..+)?$/i, 'file-type-docker'],
  [/^\.dockerignore$/i, 'file-type-docker'],
  [/^\.env(?:\..+)?$/i, 'file-type-dotenv'],
  [/\.snap$/i, 'file-type-jest-snapshot'],
]

function toIconName(fileName: string | undefined, fallback: string) {
  return (fileName ?? fallback).replace(/\.svg$/, '').replace(/_/g, '-')
}

function exists(name: string) {
  return Boolean(icons.icons[name] || icons.aliases?.[name])
}

function themed(name: string, theme: IconTheme) {
  const base = name.replace(/^(file-type|folder-type)-light-/, '$1-')
  if (theme === 'light') {
    const light = base.replace(/^(file-type|folder-type)-/, '$1-light-')
    if (light !== base && exists(light))
      return light
  }
  return exists(base) ? base : name
}

export function fileIconName(fileName: string, theme: IconTheme) {
  const override = FILE_OVERRIDES.find(([pattern]) => pattern.test(fileName))?.[1]
  const name = override && exists(override) ? override : toIconName(getIconForFile(fileName), 'default_file')
  return themed(exists(name) ? name : 'default-file', theme)
}

export function folderIconName(folderName: string, open: boolean, theme: IconTheme) {
  const raw = open ? getIconForOpenFolder(folderName) : getIconForFolder(folderName)
  const name = toIconName(raw, open ? 'default_folder_opened' : 'default_folder')
  return themed(exists(name) ? name : (open ? 'default-folder-opened' : 'default-folder'), theme)
}

const svgCache = new Map<string, string>()

export function renderIcon(name: string): string | null {
  const cached = svgCache.get(name)
  if (cached)
    return cached
  const data = getIconData(icons, name)
  if (!data)
    return null
  const { attributes, body } = iconToSVG(data, { height: '16', width: '16' })
  const svg = iconToHTML(body, attributes)
  svgCache.set(name, svg)
  return svg
}
