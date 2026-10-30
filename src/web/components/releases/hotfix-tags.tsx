import type { ProjectRef, TagSummary } from '../../../shared/types'
import { GitBranchPlus, Search, Tag, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { css, cx } from 'styled-system/css'
import { useProjectTags } from '../../hooks/use-project'
import { timeAgo } from '../../lib/format'
import { Button } from '../ui/button'
import { HotfixDialog } from './hotfix-dialog'

const link = css({ color: 'fg.muted', _hover: { color: 'accent.fg', textDecoration: 'underline' } })

function TagRow({ tag, onCreateHotfix }: { tag: TagSummary, onCreateHotfix: () => void }) {
  return (
    <div className={css({ display: 'flex', alignItems: 'center', gap: '3', px: '4', py: '3', transition: 'background 120ms', _hover: { bg: 'bg.subtle' }, '& + &': { borderTopWidth: '1px', borderColor: 'border.subtle' } })}>
      <Tag aria-hidden className={css({ w: '4', h: '4', flexShrink: 0, color: 'fg.subtle' })} />
      <div className={css({ flex: '1', minW: '0', display: 'flex', flexDir: 'column', gap: '1' })}>
        <a href={tag.webUrl} target="_blank" rel="noreferrer" className={css({ alignSelf: 'flex-start', fontSize: 'sm', fontWeight: 'semibold', color: 'fg.default', _hover: { color: 'accent.fg', textDecoration: 'underline' } })}>
          {tag.name}
        </a>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', minW: '0', fontSize: 'xs', color: 'fg.muted' })}>
          <a href={tag.commit.webUrl} target="_blank" rel="noreferrer" className={cx(link, css({ flexShrink: 0, fontFamily: 'mono' }))}>
            {tag.commit.shortId}
          </a>
          <span aria-hidden>·</span>
          <a href={tag.commit.webUrl} target="_blank" rel="noreferrer" title={tag.commit.title} className={cx(link, css({ truncate: true }))}>
            {tag.commit.title}
          </a>
          <span aria-hidden>·</span>
          <time dateTime={tag.commit.committedAt} title={new Date(tag.commit.committedAt).toLocaleString()} className={css({ flexShrink: 0 })}>
            {timeAgo(tag.commit.committedAt)}
          </time>
        </div>
      </div>
      <Button variant="outline" size="sm" className={css({ flexShrink: 0 })} onClick={onCreateHotfix}>
        <GitBranchPlus />
        Create hotfix
      </Button>
    </div>
  )
}

function TagSearch({ value, onChange }: { value: string, onChange: (value: string) => void }) {
  return (
    <label className={css({ display: 'flex', alignItems: 'center', gap: '2', h: '8', px: '3', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'full', _focusWithin: { borderColor: 'accent.default' }, '& svg': { w: '3.5', h: '3.5', color: 'fg.subtle', flexShrink: 0 } })}>
      <Search />
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="Search tags, like rc-app-0.193"
        aria-label="Search tags"
        className={css({ flex: '1', minW: '0', bg: 'transparent', outline: 'none', fontSize: 'xs' })}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className={css({ display: 'inline-flex', cursor: 'pointer', color: 'fg.subtle', _hover: { color: 'fg.default' } })}>
          <X />
        </button>
      )}
    </label>
  )
}

function SkeletonRows() {
  return (
    <div aria-hidden>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className={css({ display: 'flex', gap: '3', px: '4', py: '3.5', '& + &': { borderTopWidth: '1px', borderColor: 'border.subtle' } })}>
          <span className={css({ w: '4', h: '4', borderRadius: 'full', bg: 'bg.muted' })} />
          <div className={css({ flex: '1', display: 'flex', flexDir: 'column', gap: '2' })}>
            <span className={css({ h: '3.5', w: '25%', borderRadius: 'sm', bg: 'bg.muted', animation: 'pulse' })} />
            <span className={css({ h: '2.5', borderRadius: 'sm', bg: 'bg.subtle', animation: 'pulse' })} style={{ width: `${40 + ((index * 17) % 30)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function HotfixTags({ project }: { project: ProjectRef }) {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [hotfixTag, setHotfixTag] = useState<string | null>(null)
  const tags = useProjectTags(project, params.get('q') ?? '')
  const items = tags.data?.pages.flatMap(page => page.items) ?? []

  useEffect(() => {
    const handle = setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current)
        if (search.trim())
          next.set('q', search.trim())
        else
          next.delete('q')
        return next
      }, { replace: true })
    }, 300)
    return () => clearTimeout(handle)
  }, [search])

  return (
    <>
      <TagSearch value={search} onChange={setSearch} />
      <section className={css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'xl', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' })}>
        {tags.error && <div className={css({ p: '6', color: 'danger.fg', fontSize: 'sm', whiteSpace: 'pre-wrap' })}>{tags.error.message}</div>}
        {!tags.error && tags.isPending && <SkeletonRows />}
        {!tags.error && !tags.isPending && items.length === 0 && (
          <p className={css({ py: '16', px: '6', textAlign: 'center', fontSize: 'sm', color: 'fg.muted' })}>
            {search ? 'No tags match this search.' : 'This project has no tags yet.'}
          </p>
        )}
        {items.map(tag => <TagRow key={tag.name} tag={tag} onCreateHotfix={() => setHotfixTag(tag.name)} />)}
        {tags.hasNextPage && (
          <div className={css({ display: 'flex', justifyContent: 'center', p: '3', borderTopWidth: '1px', borderColor: 'border.subtle' })}>
            <Button size="md" variant="ghost" disabled={tags.isFetchingNextPage} onClick={() => void tags.fetchNextPage()}>
              {tags.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </section>
      <HotfixDialog project={project} tag={hotfixTag} onClose={() => setHotfixTag(null)} />
    </>
  )
}
