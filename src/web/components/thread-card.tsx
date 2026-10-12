import type { Discussion, Note } from '../../shared/types'
import type { ReviewContextValue } from './review-context'
import { Collapsible } from '@ark-ui/react/collapsible'
import { CheckCircle2, ChevronRight, CircleDot, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { css, cx } from 'styled-system/css'
import { timeAgo } from '../lib/format'
import { CommentComposer } from './comment-composer'
import { useReview, useReviewActions } from './review-context'
import { Avatar } from './ui/avatar'
import { Button, IconButton } from './ui/button'
import { Markdown } from './ui/markdown'

const card = css({
  bg: 'bg.surface',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'lg',
  overflow: 'hidden',
  fontFamily: 'body',
  whiteSpace: 'normal',
  textAlign: 'left',
})

function NoteItem({ note, discussion, review }: { note: Note, discussion: Discussion, review: ReviewContextValue }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isOwn = note.author.id === review.viewer.id
  const { edit, remove } = useReviewActions()

  return (
    <div className={cx('group', css({ display: 'flex', gap: '2.5', px: '3', py: '2.5' }))}>
      <Avatar user={note.author} size={24} />
      <div className={css({ flex: '1', minW: '0' })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', fontSize: 'xs', minH: '6' })}>
          <a href={note.author.webUrl} target="_blank" rel="noreferrer" className={css({ fontWeight: 'semibold', _hover: { textDecoration: 'underline' } })}>
            {note.author.name}
          </a>
          <span className={css({ color: 'fg.subtle' })} title={new Date(note.createdAt).toLocaleString()}>
            {timeAgo(note.createdAt)}
            {note.updatedAt !== note.createdAt && ' · edited'}
          </span>
          {isOwn && !editing && (
            <div className={css({ ml: 'auto', display: 'flex', gap: '0.5', opacity: 0, _groupHover: { opacity: 1 }, _focusWithin: { opacity: 1 } })}>
              <IconButton size="xs" label="Edit comment" onClick={() => setEditing(true)}><Pencil /></IconButton>
              <IconButton size="xs" label="Delete comment" onClick={() => setConfirmDelete(true)}><Trash2 /></IconButton>
            </div>
          )}
        </div>
        {editing
          ? (
              <CommentComposer
                initialValue={note.body}
                submitLabel="Save"
                autoFocus
                baseUrl={review.projectUrl}
                busy={edit.isPending}
                error={edit.error?.message}
                onCancel={() => setEditing(false)}
                onSubmit={async (body) => {
                  await edit.mutateAsync({ discussionId: discussion.id, noteId: note.id, body })
                  setEditing(false)
                }}
              />
            )
          : <Markdown baseUrl={review.projectUrl}>{note.body}</Markdown>}
        {confirmDelete && (
          <div className={css({ mt: '2', display: 'flex', alignItems: 'center', gap: '2', fontSize: 'xs', color: 'danger.fg' })}>
            Delete this comment?
            <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
            <Button
              size="xs"
              className={css({ color: 'danger.fg', borderColor: 'danger.fg' })}
              disabled={remove.isPending}
              onClick={() => remove.mutate({ discussionId: discussion.id, noteId: note.id }, { onSuccess: () => setConfirmDelete(false) })}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function ThreadCard({ discussion, header }: { discussion: Discussion, header?: React.ReactNode }) {
  const review = useReview()
  const [replying, setReplying] = useState(false)
  const [open, setOpen] = useState(!discussion.resolved)
  const { reply, resolve } = useReviewActions()
  const notes = discussion.notes.filter(note => !note.system)
  const first = notes[0]
  if (!first)
    return null

  const resolveButton = discussion.resolvable && (
    <Button
      size="xs"
      variant={discussion.resolved ? 'ghost' : 'outline'}
      disabled={resolve.isPending}
      onClick={() => resolve.mutate({ discussionId: discussion.id, resolved: !discussion.resolved })}
    >
      {discussion.resolved ? <CircleDot /> : <CheckCircle2 />}
      {discussion.resolved ? 'Unresolve' : 'Resolve thread'}
    </Button>
  )

  return (
    <Collapsible.Root open={open} onOpenChange={details => setOpen(details.open)} className={card}>
      {(discussion.resolved || header) && (
        <Collapsible.Trigger
          className={css({
            display: 'flex',
            alignItems: 'center',
            gap: '2',
            w: 'full',
            px: '3',
            h: '8',
            fontSize: 'xs',
            color: 'fg.muted',
            bg: 'bg.subtle',
            borderBottomWidth: open ? '1px' : '0',
            borderColor: 'border.subtle',
            cursor: 'pointer',
            '& svg': { w: '3.5', h: '3.5' },
          })}
        >
          <ChevronRight className={css({ transition: 'transform 120ms', transform: open ? 'rotate(90deg)' : 'none' })} />
          {header}
          {discussion.resolved && (
            <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', color: 'success.fg', ml: header ? 'auto' : '0' })}>
              <CheckCircle2 />
              Resolved
              {(() => {
                const resolvedBy = notes.find(note => note.resolvedBy)?.resolvedBy
                return resolvedBy ? ` by ${resolvedBy.name}` : ''
              })()}
            </span>
          )}
          {!open && (
            <span className={css({ ml: 'auto', truncate: true, maxW: '60%', color: 'fg.subtle' })}>
              {first.author.name}: {first.body.slice(0, 80)}
            </span>
          )}
        </Collapsible.Trigger>
      )}
      <Collapsible.Content>
        <div className={css({ '& > * + *': { borderTopWidth: '1px', borderColor: 'border.subtle' } })}>
          {notes.map(note => <NoteItem key={note.id} note={note} discussion={discussion} review={review} />)}
        </div>
        <div className={css({ px: '3', py: '2', borderTopWidth: '1px', borderColor: 'border.subtle', bg: 'bg.subtle' })}>
          {replying
            ? (
                <CommentComposer
                  submitLabel="Reply"
                  autoFocus
                  baseUrl={review.projectUrl}
                  busy={reply.isPending}
                  error={reply.error?.message}
                  onCancel={() => setReplying(false)}
                  onSubmit={async (body) => {
                    await reply.mutateAsync({ discussionId: discussion.id, body })
                    setReplying(false)
                  }}
                />
              )
            : (
                <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
                  <button
                    type="button"
                    onClick={() => setReplying(true)}
                    className={css({
                      flex: '1',
                      textAlign: 'left',
                      h: '7',
                      px: '2.5',
                      fontSize: 'xs',
                      color: 'fg.subtle',
                      bg: 'bg.surface',
                      borderWidth: '1px',
                      borderColor: 'border.default',
                      borderRadius: 'md',
                      cursor: 'text',
                      _hover: { borderColor: 'border.strong' },
                    })}
                  >
                    Reply…
                  </button>
                  {resolveButton}
                </div>
              )}
          {resolve.error && <div className={css({ mt: '1', color: 'danger.fg', fontSize: 'xs' })}>{resolve.error.message}</div>}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
