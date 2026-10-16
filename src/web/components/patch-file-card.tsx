import type { FileDiffOptions } from '@pierre/diffs/react'
import type { ReactNode } from 'react'
import { FileDiff } from '@pierre/diffs/react'
import { useMemo } from 'react'
import { css } from 'styled-system/css'
import { countChanges } from '../../shared/line-map'
import { GITHUB_THEMES } from '../lib/code-tokens'
import { directoryName, fileName } from '../lib/format'
import { useDiffLayout, useTheme, useWrapLines } from '../lib/preferences'
import { parsePatch } from './chat/patch-view'
import { DiffStat } from './file-diff-card'
import { FileIcon } from './ui/file-icon'

const diffStyle = {
  '--diffs-font-family': 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  '--diffs-font-size': '12px',
  '--diffs-line-height': '20px',
} as React.CSSProperties

const card = css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', overflow: 'hidden' })

interface PatchFileCardProps {
  path: string
  previousPath?: string | null
  diff: string
  isBinary?: boolean
  label?: string
  actions?: ReactNode
}

export function PatchFileCard({ path, previousPath, diff, isBinary, label, actions }: PatchFileCardProps) {
  const [theme] = useTheme()
  const [layout] = useDiffLayout()
  const [wrap] = useWrapLines()
  const fileDiff = useMemo(() => parsePatch(diff)[0] ?? null, [diff])
  const counts = useMemo(() => countChanges(diff), [diff])
  const isOneSided = counts.additions === 0 || counts.deletions === 0
  const options = useMemo<FileDiffOptions<undefined, undefined>>(() => ({
    diffStyle: isOneSided ? 'unified' : layout,
    overflow: wrap ? 'wrap' : 'scroll',
    theme: GITHUB_THEMES,
    themeType: theme,
    disableFileHeader: true,
    lineDiffType: 'word-alt',
  }), [isOneSided, layout, wrap, theme])

  return (
    <section className={card}>
      <header className={css({ display: 'flex', alignItems: 'center', gap: '2', minH: '10', px: '2.5', bg: 'bg.subtle', borderBottomWidth: '1px', borderColor: 'border.default' })}>
        <FileIcon name={fileName(path)} />
        <div className={css({ minW: '0', display: 'flex', alignItems: 'center', fontFamily: 'mono', fontSize: 'xs' })} title={previousPath ? `${previousPath} → ${path}` : path}>
          <span className={css({ color: 'fg.subtle', truncate: true })}>{directoryName(path)}</span>
          <span className={css({ fontWeight: 'semibold', whiteSpace: 'nowrap' })}>{fileName(path)}</span>
        </div>
        <div className={css({ ml: 'auto', display: 'flex', alignItems: 'center', gap: '3', flexShrink: 0 })}>
          {!isBinary && <DiffStat additions={counts.additions} deletions={counts.deletions} />}
          {label && <span className={css({ fontSize: '2xs', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'wide', color: 'fg.subtle' })}>{label}</span>}
          {actions}
        </div>
      </header>
      {isBinary && <div className={css({ p: '4', fontSize: 'sm', color: 'fg.muted' })}>Binary file changed.</div>}
      {!isBinary && fileDiff && <FileDiff fileDiff={fileDiff} options={options} style={diffStyle} />}
      {!isBinary && !fileDiff && <div className={css({ p: '4', fontSize: 'sm', color: 'fg.muted' })}>No line changes to show.</div>}
    </section>
  )
}
