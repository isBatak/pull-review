import type { SupportedLanguages } from '@pierre/diffs'
import { getFiletypeFromFileName, getSharedHighlighter, preloadHighlighter } from '@pierre/diffs'
import { useEffect, useState } from 'react'

export const GITHUB_THEMES = { light: 'github-light-default', dark: 'github-dark-default' } as const

export function preloadDiffHighlighter() {
  // A diff viewer outside the virtualized Code tab draws nothing if it mounts before the shared highlighter exists.
  return preloadHighlighter({ themes: [GITHUB_THEMES.light, GITHUB_THEMES.dark], langs: [] })
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
  const signature = `${theme}|${lines.map(line => line.key).join('|')}`

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
    const themeName = GITHUB_THEMES[theme]
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
