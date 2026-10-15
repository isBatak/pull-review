import type { FileDiffMetadata, FileDiffOptions } from '@pierre/diffs/react'
import { parsePatchFiles } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { useMemo } from 'react'
import { css } from 'styled-system/css'
import { hashDiff, useTheme } from '../../lib/preferences'
import { GITHUB_THEMES } from '../../lib/code-tokens'
import { directoryName, fileName } from '../../lib/format'
import { FileIcon } from '../ui/file-icon'

const diffStyle = {
  '--diffs-font-family': 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  '--diffs-font-size': '11px',
  '--diffs-line-height': '18px',
} as React.CSSProperties

export function parsePatch(patch: string): FileDiffMetadata[] {
  try {
    return parsePatchFiles(patch, `chat-${hashDiff(patch)}`).flatMap(parsed => parsed.files)
  }
  catch {
    return []
  }
}

export function PatchView({ files }: { files: FileDiffMetadata[] }) {
  const [theme] = useTheme()
  const options = useMemo<FileDiffOptions<undefined, undefined>>(() => ({
    diffStyle: 'unified',
    overflow: 'wrap',
    theme: GITHUB_THEMES,
    themeType: theme,
    disableFileHeader: true,
    lineDiffType: 'word-alt',
  }), [theme])

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
      {files.map(file => (
        <div key={file.name} className={css({ borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', overflow: 'hidden' })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', h: '8', px: '2', bg: 'bg.subtle', borderBottomWidth: '1px', borderColor: 'border.default', fontFamily: 'mono', fontSize: 'xs', minW: '0' })} title={file.name}>
            <FileIcon name={fileName(file.name)} />
            <span className={css({ color: 'fg.subtle', truncate: true, minW: '0' })}>{directoryName(file.name)}</span>
            <span className={css({ fontWeight: 'semibold', whiteSpace: 'nowrap' })}>{fileName(file.name)}</span>
          </div>
          <FileDiff fileDiff={file} options={options} style={diffStyle} />
        </div>
      ))}
    </div>
  )
}
