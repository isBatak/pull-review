import type { SupportedLanguages } from '@pierre/diffs'
import { getFiletypeFromFileName, getSharedHighlighter, preloadHighlighter } from '@pierre/diffs'
import type { ThemeName } from './preferences'
import { useEffect, useState } from 'react'
import { useThemeName } from './preferences'
import { readStoredValue } from './stored-state'

export const CODE_THEMES = {
  classic: { light: 'github-light-default', dark: 'github-dark-default' },
  tavern: { light: 'gruvbox-light-medium', dark: 'gruvbox-dark-medium' },
} as const satisfies Record<ThemeName, { light: string, dark: string }>

export function useCodeThemes() {
  const [name] = useThemeName()
  return CODE_THEMES[name] ?? CODE_THEMES.classic
}

export function preloadDiffHighlighter() {
  const themes = CODE_THEMES[readStoredValue<ThemeName>('pull-review:theme-name') ?? 'classic'] ?? CODE_THEMES.classic
  // A diff viewer outside the virtualized Code tab draws nothing if it mounts before the shared highlighter exists.
  return preloadHighlighter({ themes: [themes.light, themes.dark], langs: [] })
}

export interface CodeToken {
  content: string
  color: string | undefined
}

export interface CodeLine {
  key: string
  path: string
  text: string
}

const PLAIN_LANGUAGES = new Set<SupportedLanguages>(['text', 'ansi'])

export function useCodeTokens(lines: CodeLine[], theme: 'light' | 'dark') {
  const [tokens, setTokens] = useState<Map<string, CodeToken[]>>(() => new Map())
  const themeName = useCodeThemes()[theme]
  const signature = `${themeName}|${lines.map(line => line.key).join('|')}`

  useEffect(() => {
    let cancelled = false
    const byLanguage = new Map<SupportedLanguages, CodeLine[]>()
    for (const line of lines) {
      const language = getFiletypeFromFileName(line.path)
      if (PLAIN_LANGUAGES.has(language))
        continue
      byLanguage.set(language, [...byLanguage.get(language) ?? [], line])
    }
    if (!byLanguage.size)
      return
    void getSharedHighlighter({ themes: [themeName], langs: [...byLanguage.keys()] })
      .then((highlighter) => {
        if (cancelled)
          return
        const next = new Map<string, CodeToken[]>()
        for (const [language, group] of byLanguage) {
          for (const line of group) {
            const [lineTokens] = highlighter.codeToTokensBase(line.text, { lang: language, theme: themeName })
            next.set(line.key, (lineTokens ?? []).map(token => ({ content: token.content, color: token.color })))
          }
        }
        setTokens(next)
      })
      .catch(() => null)
    return () => {
      cancelled = true
    }
  }, [signature])

  return tokens
}
