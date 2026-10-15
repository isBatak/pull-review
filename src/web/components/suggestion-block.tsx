import type { FileDiffOptions } from '@pierre/diffs/react'
import { parseDiffFromFile } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { FileDiff as FileDiffIcon } from 'lucide-react'
import { useMemo } from 'react'
import { css } from 'styled-system/css'
import { GITHUB_THEMES } from '../lib/code-tokens'
import { useTheme } from '../lib/preferences'

const diffStyle = {
  '--diffs-font-family': 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  '--diffs-font-size': '12px',
  '--diffs-line-height': '20px',
} as React.CSSProperties

function asFileContents(text: string) {
  return text ? `${text}\n` : ''
}

export function SuggestionBlock({ path, original, suggested }: { path: string, original: string, suggested: string }) {
  const [theme] = useTheme()
  const fileDiff = useMemo(
    () => parseDiffFromFile({ name: path, contents: asFileContents(original) }, { name: path, contents: asFileContents(suggested.replace(/\n$/, '')) }),
    [path, original, suggested],
  )
  const options = useMemo<FileDiffOptions<undefined, undefined>>(() => ({
    diffStyle: 'unified',
    overflow: 'wrap',
    theme: GITHUB_THEMES,
    themeType: theme,
    disableFileHeader: true,
    disableLineNumbers: true,
    lineDiffType: 'word-alt',
  }), [theme])

  return (
    <div className={css({ borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', overflow: 'hidden', fontFamily: 'body' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', h: '8', px: '3', fontSize: 'xs', fontWeight: 'semibold', bg: 'bg.subtle', borderBottomWidth: '1px', borderColor: 'border.default', '& svg': { w: '3.5', h: '3.5', color: 'fg.subtle' } })}>
        <FileDiffIcon />
        Suggested change
      </div>
      <FileDiff fileDiff={fileDiff} options={options} style={diffStyle} />
    </div>
  )
}
