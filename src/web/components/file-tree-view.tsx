import type { FileTreeNode } from '../../shared/file-tree'
import type { DiffFile } from '../../shared/types'
import type { ReviewStatus } from '../lib/preferences'
import { createTreeCollection, TreeView } from '@ark-ui/react/tree-view'
import { MiddleTruncate } from '@pierre/truncate/react'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { useMemo } from 'react'
import { css } from 'styled-system/css'
import { buildFileTree, filesUnder, folderIds } from '../../shared/file-tree'
import { Checkbox } from './ui/checkbox'
import { FileIcon, FolderIcon } from './ui/file-icon'

const INDENT = 12
const ROW_START = 8
const ICON_SIZE_REM = 0.875

const STATUS_MARK: Record<DiffFile['status'], { letter: string, color: string, label: string }> = {
  added: { letter: 'A', color: 'var(--colors-success-fg)', label: 'Added' },
  removed: { letter: 'D', color: 'var(--colors-danger-fg)', label: 'Deleted' },
  modified: { letter: 'M', color: 'var(--colors-warning-fg)', label: 'Modified' },
  renamed: { letter: 'R', color: 'var(--colors-accent-fg)', label: 'Renamed' },
}

const row = css({
  '--row-bg': 'var(--colors-bg-surface)',
  '--truncate-marker-background-color': 'var(--row-bg)',
  'position': 'relative',
  'display': 'flex',
  'alignItems': 'center',
  'gap': '1.5',
  'h': '7',
  'pr': '3',
  'paddingInlineStart': `calc((var(--depth) - 1) * ${INDENT}px + ${ROW_START}px)`,
  'bg': 'var(--row-bg)',
  'fontSize': 'xs',
  'cursor': 'pointer',
  'userSelect': 'none',
  'outline': 'none',
  '_hover': { '--row-bg': 'var(--colors-bg-muted)' },
  '_focusVisible': { boxShadow: 'inset 0 0 0 1px token(colors.accent.default)' },
  '&[data-selected]': { '--row-bg': 'color-mix(in srgb, var(--colors-accent-default) 14%, var(--colors-bg-surface))' },
  '& svg': { w: `${ICON_SIZE_REM}rem`, h: `${ICON_SIZE_REM}rem`, flexShrink: 0 },
})

const guide = css({
  position: 'absolute',
  top: '0',
  bottom: '0',
  w: '1px',
  bg: 'border.default',
  zIndex: 1,
  pointerEvents: 'none',
  insetInlineStart: `calc((var(--depth) - 1) * ${INDENT}px + ${ROW_START}px + ${ICON_SIZE_REM / 2}rem - 0.5px)`,
})

const folderClosedIcon = css({ display: 'inline-flex', color: 'fg.subtle', '[data-state=open] > &': { display: 'none' } })
const folderOpenIcon = css({ display: 'none', color: 'fg.subtle', '[data-state=open] > &': { display: 'inline-flex' } })

interface FileTreeViewProps {
  files: DiffFile[]
  statusOf: (file: DiffFile) => ReviewStatus
  openThreadsByFile: Map<string, number>
  onSelectFile: (file: DiffFile) => void
  onReviewedChange: (files: DiffFile[], reviewed: boolean) => void
}

function CommentCount({ count }: { count: number }) {
  if (!count)
    return null
  return (
    <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '0.5', color: 'accent.fg', fontVariantNumeric: 'tabular-nums', '& svg': { w: '3!', h: '3!' } })}>
      <MessageSquare />
      {count}
    </span>
  )
}

function TreeNode({ node, indexPath, props }: { node: FileTreeNode, indexPath: number[], props: FileTreeViewProps }) {
  const { statusOf, openThreadsByFile, onSelectFile, onReviewedChange } = props

  if (node.file) {
    const file = node.file
    const status = statusOf(file)
    const mark = STATUS_MARK[file.status]
    return (
      <TreeView.NodeProvider node={node} indexPath={indexPath}>
        <TreeView.Item
          className={row}
          title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}
          onClick={() => onSelectFile(file)}
          onKeyDown={(event) => {
            if (event.key === 'Enter')
              onSelectFile(file)
          }}
        >
          <span className={css({ w: `${ICON_SIZE_REM}rem`, flexShrink: 0 })} />
          <FileIcon name={node.name} className={status === 'reviewed' ? css({ opacity: 0.5 }) : undefined} />
          <TreeView.ItemText
            className={css({
              flex: '1',
              minW: '0',
              opacity: status === 'reviewed' ? 0.55 : 1,
              textDecoration: file.status === 'removed' ? 'line-through' : 'none',
            })}
            style={{ color: file.status === 'modified' ? undefined : mark.color }}
          >
            <MiddleTruncate split="extension" minimumLength={8}>{node.name}</MiddleTruncate>
          </TreeView.ItemText>
          {status === 'changed' && <span className={css({ color: 'warning.fg', fontSize: '2xs' })}>changed</span>}
          <CommentCount count={openThreadsByFile.get(file.path) ?? 0} />
          <span title={mark.label} className={css({ w: '3', textAlign: 'center', fontSize: '2xs', fontWeight: 'bold', fontFamily: 'mono', flexShrink: 0 })} style={{ color: mark.color }}>{mark.letter}</span>
          <Checkbox
            checked={status === 'reviewed' ? true : status === 'changed' ? 'indeterminate' : false}
            onCheckedChange={value => onReviewedChange([file], value)}
            label={`Mark ${file.path} as reviewed`}
          />
        </TreeView.Item>
      </TreeView.NodeProvider>
    )
  }

  const files = filesUnder(node)
  const reviewed = files.filter(file => statusOf(file) === 'reviewed').length
  const threads = files.reduce((sum, file) => sum + (openThreadsByFile.get(file.path) ?? 0), 0)

  return (
    <TreeView.NodeProvider node={node} indexPath={indexPath}>
      <TreeView.Branch>
        <TreeView.BranchControl className={row} title={node.path}>
          <TreeView.BranchIndicator className={css({ display: 'inline-flex', color: 'fg.subtle', transition: 'transform 120ms', '&[data-state=open]': { transform: 'rotate(90deg)' } })}>
            <ChevronRight />
          </TreeView.BranchIndicator>
          <span className={folderClosedIcon}><FolderIcon name={node.name} open={false} /></span>
          <span className={folderOpenIcon}><FolderIcon name={node.name} open /></span>
          <TreeView.BranchText className={css({ flex: '1', minW: '0', color: 'fg.muted' })}>
            <MiddleTruncate split="leaf-path" minimumLength={10}>{node.name}</MiddleTruncate>
          </TreeView.BranchText>
          <CommentCount count={threads} />
          <Checkbox
            checked={reviewed === files.length ? true : reviewed > 0 ? 'indeterminate' : false}
            onCheckedChange={value => onReviewedChange(files, value)}
            label={`Mark all files in ${node.path} as reviewed`}
          />
        </TreeView.BranchControl>
        <TreeView.BranchContent className={css({ position: 'relative' })}>
          <TreeView.BranchIndentGuide className={guide} />
          {node.children?.map((child, index) => (
            <TreeNode key={child.id} node={child} indexPath={[...indexPath, index]} props={props} />
          ))}
        </TreeView.BranchContent>
      </TreeView.Branch>
    </TreeView.NodeProvider>
  )
}

export function FileTreeView(props: FileTreeViewProps) {
  const tree = useMemo(() => buildFileTree(props.files), [props.files])
  const collection = useMemo(() => createTreeCollection<FileTreeNode>({
    rootNode: tree,
    nodeToValue: node => node.id,
    nodeToString: node => node.name,
  }), [tree])
  const expanded = useMemo(() => folderIds(tree), [tree])

  return (
    <TreeView.Root key={expanded.join('\n')} collection={collection} defaultExpandedValue={expanded} selectionMode="single" className={css({ pb: '2' })}>
      <TreeView.Tree aria-label="Changed files">
        {tree.children?.map((node, index) => (
          <TreeNode key={node.id} node={node} indexPath={[index]} props={props} />
        ))}
      </TreeView.Tree>
    </TreeView.Root>
  )
}
