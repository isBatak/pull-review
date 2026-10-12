import type { FileGroup } from '../../shared/grouping'
import type { DiffFile } from '../../shared/types'
import type { ReviewStatus } from '../lib/preferences'
import { Collapsible } from '@ark-ui/react/collapsible'
import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { css } from 'styled-system/css'
import { FileTreeView } from './file-tree-view'
import { Checkbox } from './ui/checkbox'

interface SidebarProps {
  groups: FileGroup[]
  allFiles: DiffFile[]
  showGroups: boolean
  statusOf: (file: DiffFile) => ReviewStatus
  openThreadsByFile: Map<string, number>
  onSelectFile: (file: DiffFile) => void
  onReviewedChange: (files: DiffFile[], reviewed: boolean) => void
}

function GroupSection({ group, statusOf, openThreadsByFile, onSelectFile, onReviewedChange }: Omit<SidebarProps, 'groups' | 'allFiles' | 'showGroups'> & { group: FileGroup }) {
  const [open, setOpen] = useState(!group.collapsed || group.keepsSomeExpanded)
  const reviewed = group.files.filter(file => statusOf(file) === 'reviewed').length
  const allReviewed = reviewed === group.files.length
  const checked = allReviewed ? true : reviewed > 0 ? 'indeterminate' : false

  return (
    <Collapsible.Root open={open} onOpenChange={details => setOpen(details.open)}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2', pl: '2', pr: '3', h: '8', position: 'sticky', top: '0', bg: 'bg.surface', zIndex: 1 })}>
        <Collapsible.Trigger className={css({ flex: '1', display: 'flex', alignItems: 'center', gap: '1.5', cursor: 'pointer', fontSize: 'xs', fontWeight: 'semibold', color: 'fg.default', minW: '0' })}>
          <ChevronRight className={css({ w: '3.5', h: '3.5', color: 'fg.subtle', transition: 'transform 120ms', transform: open ? 'rotate(90deg)' : 'none' })} />
          {group.label}
          <span className={css({ color: 'fg.subtle', fontWeight: 'normal' })}>
            {reviewed}
            /
            {group.files.length}
          </span>
        </Collapsible.Trigger>
        <Checkbox checked={checked} onCheckedChange={value => onReviewedChange(group.files, value)} label={`Mark all ${group.label} files as reviewed`} />
      </div>
      <Collapsible.Content>
        <FileTreeView
          files={group.files}
          statusOf={statusOf}
          openThreadsByFile={openThreadsByFile}
          onSelectFile={onSelectFile}
          onReviewedChange={onReviewedChange}
        />
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

export function Sidebar(props: SidebarProps) {
  const [query, setQuery] = useState('')
  const allFiles = props.allFiles
  const reviewed = allFiles.filter(file => props.statusOf(file) === 'reviewed').length
  const progress = allFiles.length ? reviewed / allFiles.length : 0

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle)
      return props.groups
    return props.groups
      .map(group => ({ ...group, files: group.files.filter(file => file.path.toLowerCase().includes(needle)) }))
      .filter(group => group.files.length > 0)
  }, [props.groups, query])

  return (
    <aside className={css({ display: 'flex', flexDir: 'column', minH: '0', h: 'full', bg: 'bg.surface' })}>
      <div className={css({ p: '3', display: 'flex', flexDir: 'column', gap: '2.5', borderBottomWidth: '1px', borderColor: 'border.subtle' })}>
        <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'xs' })}>
          <span className={css({ fontWeight: 'semibold' })}>Review progress</span>
          <span className={css({ color: 'fg.muted', fontVariantNumeric: 'tabular-nums' })}>
            {reviewed}
            {' of '}
            {allFiles.length}
            {' files'}
          </span>
        </div>
        <div className={css({ h: '1', bg: 'bg.muted', borderRadius: 'full', overflow: 'hidden' })}>
          <div className={css({ h: 'full', bg: 'success.solid', transition: 'width 200ms' })} style={{ width: `${progress * 100}%` }} />
        </div>
        <label className={css({ display: 'flex', alignItems: 'center', gap: '2', h: '7', px: '2', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', _focusWithin: { borderColor: 'accent.default' }, '& svg': { w: '3.5', h: '3.5', color: 'fg.subtle' } })}>
          <Search />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter files"
            className={css({ flex: '1', bg: 'transparent', outline: 'none', fontSize: 'xs', color: 'fg.default', _placeholder: { color: 'fg.subtle' } })}
          />
        </label>
      </div>
      <nav className={css({ flex: '1', overflowY: 'auto', pb: '2' })}>
        {props.showGroups
          ? groups.map(group => (
              <GroupSection
                key={group.key}
                group={group}
                statusOf={props.statusOf}
                openThreadsByFile={props.openThreadsByFile}
                onSelectFile={props.onSelectFile}
                onReviewedChange={props.onReviewedChange}
              />
            ))
          : (
              <div className={css({ pt: '1' })}>
                <FileTreeView
                  files={groups.flatMap(group => group.files)}
                  statusOf={props.statusOf}
                  openThreadsByFile={props.openThreadsByFile}
                  onSelectFile={props.onSelectFile}
                  onReviewedChange={props.onReviewedChange}
                />
              </div>
            )}
        {groups.length === 0 && <p className={css({ px: '3', py: '4', fontSize: 'xs', color: 'fg.subtle' })}>No files match.</p>}
      </nav>
    </aside>
  )
}
