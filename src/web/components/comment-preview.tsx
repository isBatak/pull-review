import type { DiffSide, User } from '../../shared/types'
import { Eye } from 'lucide-react'
import { css } from 'styled-system/css'
import { Avatar } from './ui/avatar'
import { Markdown } from './ui/markdown'

interface CommentPreviewProps {
  body: string
  author: User
  side: DiffSide
  startLine: number
  endLine: number
  projectUrl: string
}

function LineNumber({ side, line }: { side: DiffSide, line: number }) {
  return <span className={css({ color: side === 'additions' ? 'success.fg' : 'danger.fg', fontVariantNumeric: 'tabular-nums' })}>{side === 'additions' ? '+' : '-'}{line}</span>
}

export function CommentPreview({ body, author, side, startLine, endLine, projectUrl }: CommentPreviewProps) {
  return (
    <section aria-label="Preview of the GitLab comment" className={css({ borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', overflow: 'hidden', bg: 'bg.canvas' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', h: '7', px: '3', fontSize: 'xs', color: 'fg.subtle', bg: 'bg.subtle', borderBottomWidth: '1px', borderColor: 'border.default', '& svg': { w: '3.5', h: '3.5' } })}>
        <Eye />
        How it will look in GitLab
        <span className={css({ ml: 'auto' })}>Not posted yet</span>
      </div>
      <div className={css({ px: '3', pt: '2', fontSize: 'xs', color: 'fg.muted' })}>
        {startLine === endLine
          ? <>Comment on line <LineNumber side={side} line={endLine} /></>
          : <>Comment on lines <LineNumber side={side} line={startLine} /> to <LineNumber side={side} line={endLine} /></>}
      </div>
      <div className={css({ display: 'flex', gap: '2.5', px: '3', py: '2.5' })}>
        <Avatar user={author} size={24} />
        <div className={css({ flex: '1', minW: '0' })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', minH: '6', fontSize: 'xs' })}>
            <span className={css({ fontWeight: 'semibold' })}>{author.name}</span>
            <span className={css({ color: 'fg.subtle' })}>@{author.username} · just now</span>
          </div>
          <Markdown baseUrl={projectUrl}>{body}</Markdown>
        </div>
      </div>
    </section>
  )
}
