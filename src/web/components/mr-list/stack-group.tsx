import type { MrStack, StackInfo } from '../../../shared/stacks'
import { GitBranch, Layers, TriangleAlert } from 'lucide-react'
import { css } from 'styled-system/css'
import { isWarning } from '../../../shared/stacks'
import { MrRow } from './mr-row'

interface StackGroupProps {
  stack: MrStack
  stackInfo: Map<number, StackInfo>
  defaultBranch: string
  jiraBaseUrl: string
  activeTags: Set<string>
  onToggleTag: (tag: string) => void
}

export function StackGroup({ stack, stackInfo, defaultBranch, jiraBaseUrl, activeTags, onToggleTag }: StackGroupProps) {
  const rootInfo = stackInfo.get(stack.root.iid)
  const baseDepth = stack.members[0]?.depth ?? 0
  const warningCount = stack.members.filter(member => stackInfo.get(member.mr.iid)?.issues.some(isWarning)).length
  const base = stack.root.targetBranch

  return (
    <div className={css({ position: 'relative', m: '2', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', bg: 'bg.surface', overflow: 'hidden' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2', px: '4', h: '8', bg: 'bg.subtle', borderBottomWidth: '1px', borderColor: 'border.subtle', fontSize: 'xs', color: 'fg.muted', '& svg': { w: '3.5', h: '3.5' } })}>
        <Layers className={css({ color: 'accent.fg' })} />
        <span className={css({ fontWeight: 'semibold', color: 'fg.default' })}>Stack</span>
        <span>
          {stack.members.length}
          {' merge requests'}
        </span>
        <span className={css({ color: 'fg.subtle' })}>·</span>
        <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', minW: '0' })}>
          <GitBranch />
          <span className={css({ fontFamily: 'mono', truncate: true })}>{base}</span>
          {rootInfo && rootInfo.depth > 0 && base !== defaultBranch && (
            <span className={css({ color: 'fg.subtle' })}>(no open MR, base branch)</span>
          )}
        </span>
        {warningCount > 0 && (
          <span className={css({ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: '1', color: 'warning.fg', fontWeight: 'medium' })}>
            <TriangleAlert />
            {warningCount}
            {warningCount === 1 ? ' tag to check' : ' tags to check'}
          </span>
        )}
      </div>
      {stack.members.map((member, index) => {
        const next = stack.members[index + 1]
        const relativeDepth = member.depth - baseDepth
        return (
          <div key={member.mr.iid} className={css({ '& + &': { borderTopWidth: '1px', borderColor: 'border.subtle' } })}>
            <MrRow
              mr={member.mr}
              stack={stackInfo.get(member.mr.iid)}
              defaultBranch={defaultBranch}
              jiraBaseUrl={jiraBaseUrl}
              depth={relativeDepth}
              isLastInStack={!next || next.depth - baseDepth < relativeDepth}
              activeTags={activeTags}
              onToggleTag={onToggleTag}
            />
          </div>
        )
      })}
    </div>
  )
}
