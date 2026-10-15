import type { ReactNode } from 'react'
import type { SymbolHit } from '../../shared/symbols'
import type { DiffFile, MrRef } from '../../shared/types'
import type { CodeToken } from '../lib/code-tokens'
import type { SymbolRequest } from '../lib/symbols'
import { ChevronDown, ChevronRight, ChevronUp, Code2, ExternalLink, Search, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { card } from 'styled-system/recipes'
import { codeForRange } from '../../shared/line-map'
import { definitionKind } from '../../shared/symbols'
import { useProjectInfo } from '../hooks/use-project'
import { api } from '../lib/api'
import { useCodeTokens } from '../lib/code-tokens'
import { openExternal } from '../lib/platform'
import { useTheme } from '../lib/preferences'
import { useSettings } from '../lib/settings'
import { useSymbolSearch } from '../lib/symbols'
import { IconButton, WithTooltip } from './ui/button'
import { Spinner } from './ui/spinner'

const WIDTH = 440
const GAP = 6
const EDGE = 16
const EXPAND_ALL_LIMIT = 8

interface SymbolPopoverProps {
  request: SymbolRequest
  mrRef: MrRef
  sha: string
  projectUrl: string
  files: DiffFile[]
  repoPath: string | null
  onReveal: (file: DiffFile, line: number) => void
  onClose: () => void
}

function placement(anchor: DOMRect) {
  const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - WIDTH - EDGE))
  const below = window.innerHeight - anchor.bottom - GAP - EDGE
  const above = anchor.top - GAP - EDGE
  if (below >= 320 || below >= above)
    return { left, top: anchor.bottom + GAP, maxHeight: below }
  return { left, bottom: window.innerHeight - anchor.top + GAP, maxHeight: above }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const nameMark = css({ bg: 'bg.emphasized', color: 'inherit', borderRadius: 'xs', px: '0.5', mx: '-0.5' })

function HighlightedText({ text, name, tokens }: { text: string, name: string, tokens: CodeToken[] | undefined }) {
  const pattern = new RegExp(`(?<![\\w$])(${escapeRegExp(name)})(?![\\w$])`)
  const pieces = tokens ?? [{ content: text, color: undefined }]
  return (
    <>
      {pieces.map((token, tokenIndex) => (
        <span key={tokenIndex} style={{ color: token.color }}>
          {token.content.split(pattern).map((part, index) => index % 2 === 1
            ? <mark key={index} className={nameMark}>{part}</mark>
            : part)}
        </span>
      ))}
    </>
  )
}

function groupByPath(hits: SymbolHit[]) {
  const groups = new Map<string, SymbolHit[]>()
  for (const hit of hits) {
    const list = groups.get(hit.path) ?? []
    list.push(hit)
    groups.set(hit.path, list)
  }
  return [...groups.entries()]
}

function hitKey(hit: SymbolHit) {
  return `${hit.path}:${hit.line}:${hit.column}`
}

const sectionHeader = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  minH: '10',
  px: '4',
  fontSize: 'sm',
  bg: 'bg.subtle',
  borderTopWidth: '1px',
  borderBottomWidth: '1px',
  borderColor: 'border.default',
})

const groupRow = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  w: 'full',
  minH: '9',
  px: '4',
  fontSize: 'sm',
  color: 'fg.muted',
  textAlign: 'left',
  cursor: 'pointer',
  borderBottomWidth: '1px',
  borderColor: 'border.subtle',
  _hover: { bg: 'bg.subtle', color: 'fg.default' },
  '& > svg': { w: '4', h: '4', flexShrink: 0 },
})

const countBadge = css({
  ml: 'auto',
  flexShrink: 0,
  minW: '5',
  px: '1.5',
  fontSize: 'xs',
  fontWeight: 'semibold',
  textAlign: 'center',
  color: 'fg.muted',
  bg: 'bg.muted',
  borderRadius: 'full',
})

function PathLabel({ path }: { path: string }) {
  return <span title={path} className={css({ minW: '0', truncate: true, direction: 'rtl', textAlign: 'left' })}>{`‎${path}`}</span>
}

function SectionHeader({ title, note, children }: { title: string, note: string, children?: ReactNode }) {
  return (
    <div className={sectionHeader}>
      <span className={css({ fontWeight: 'semibold', color: 'fg.default' })}>{title}</span>
      <span className={css({ color: 'fg.subtle' })}>{note}</span>
      {children && <span className={css({ ml: 'auto', display: 'flex', gap: '0.5' })}>{children}</span>}
    </div>
  )
}

export function SymbolPopover({ request, mrRef, sha, projectUrl, files, repoPath, onReveal, onClose }: SymbolPopoverProps) {
  const [settings] = useSettings()
  const projectInfo = useProjectInfo(mrRef)
  const search = useSymbolSearch({ mrRef, name: request.name, sha, files, repoPath })
  const [editorError, setEditorError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string> | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(() => placement(request.anchor))

  useLayoutEffect(() => setPosition(placement(request.anchor)), [request.anchor])

  useEffect(() => {
    setExpanded(null)
    setCurrent(null)
  }, [request])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node))
        onClose()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape')
        onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const filesByPath = useMemo(() => new Map(files.map(file => [file.path, file])), [files])
  const result = search.data?.result
  const definitions = result?.definitions ?? []
  const references = result?.references ?? []
  const referenceGroups = useMemo(() => groupByPath(references), [references])
  const kind = definitions[0] ? definitionKind(definitions[0].text, request.name) : 'symbol'
  const [theme] = useTheme()
  const codeLines = useMemo(() => [...definitions, ...references].map(hit => ({ key: hitKey(hit), path: hit.path, text: hit.text })), [definitions, references])
  const tokens = useCodeTokens(codeLines, theme)

  const isExpanded = (path: string) => expanded
    ? expanded.has(path)
    : references.length <= EXPAND_ALL_LIMIT || path === request.path

  function toggle(path: string) {
    const next = new Set(referenceGroups.map(([groupPath]) => groupPath).filter(isExpanded))
    if (next.has(path))
      next.delete(path)
    else
      next.add(path)
    setExpanded(next)
  }

  function revealTarget(hit: SymbolHit) {
    const file = filesByPath.get(hit.path)
    return file && codeForRange(file.diff, 'additions', hit.line, hit.line) !== null ? file : null
  }

  const steppable = references.filter(hit => revealTarget(hit))

  function step(direction: 1 | -1) {
    if (!steppable.length)
      return
    const index = steppable.findIndex(hit => hitKey(hit) === current)
    const next = steppable[(index + direction + steppable.length) % steppable.length]!
    setCurrent(hitKey(next))
    setExpanded(new Set([...referenceGroups.map(([groupPath]) => groupPath).filter(isExpanded), next.path]))
    onReveal(revealTarget(next)!, next.line)
  }

  function gitlabUrl(hit: SymbolHit) {
    return `${projectUrl}/-/blob/${sha}/${hit.path.split('/').map(encodeURIComponent).join('/')}#L${hit.line}`
  }

  const searchUrl = projectInfo.data
    ? `https://${mrRef.host}/search?search=${encodeURIComponent(request.name)}&project_id=${projectInfo.data.id}&scope=blobs`
    : null

  async function openInEditor(hit: SymbolHit) {
    if (!repoPath)
      return
    setEditorError(null)
    try {
      await api.openInEditor({ repoPath, path: hit.path, line: hit.line, column: hit.column, editor: settings.editor })
    }
    catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error))
    }
  }

  function openHit(hit: SymbolHit) {
    const file = revealTarget(hit)
    setCurrent(hitKey(hit))
    if (file)
      onReveal(file, hit.line)
    else
      openExternal(gitlabUrl(hit))
  }

  function renderHit(hit: SymbolHit) {
    const inReview = Boolean(revealTarget(hit))
    const selected = current === hitKey(hit)
    return (
      <li key={hitKey(hit)} className={cx(css({ position: 'relative', display: 'flex', alignItems: 'center', _hover: { bg: 'bg.subtle', '& [data-actions]': { opacity: 1 } } }), selected && css({ bg: 'accent.subtle' }))}>
        <button
          type="button"
          onClick={() => openHit(hit)}
          title={inReview ? 'Show in this review' : 'Open in GitLab'}
          className={css({ flex: '1', minW: '0', display: 'flex', alignItems: 'baseline', gap: '3', pl: '4', pr: '16', py: '1.5', textAlign: 'left', fontFamily: 'mono', fontSize: 'xs', cursor: 'pointer' })}
        >
          <span className={css({ flexShrink: 0, minW: '6', textAlign: 'right', color: 'fg.subtle' })}>{hit.line}</span>
          <span className={css({ truncate: true, color: 'fg.default' })}><HighlightedText text={hit.text} name={request.name} tokens={tokens.get(hitKey(hit))} /></span>
        </button>
        <span data-actions="" className={css({ position: 'absolute', right: '2', display: 'flex', gap: '0.5', opacity: 0, transition: 'opacity 100ms' })}>
          <IconButton size="xs" label="Open in GitLab" onClick={() => openExternal(gitlabUrl(hit))}>
            <ExternalLink />
          </IconButton>
          {repoPath && (
            <IconButton size="xs" label="Open in editor" onClick={() => void openInEditor(hit)}>
              <Code2 />
            </IconButton>
          )}
        </span>
      </li>
    )
  }

  const searchNote = result?.source === 'diff' ? 'Changed lines' : 'Search'
  const searchHint = result?.source === 'diff'
    ? 'Only the changed lines were searched. Add a local repository in Settings, General to search the whole repository.'
    : `Search-based results from the whole repository at ${sha.slice(0, 8)}. Different symbols with the same name are not told apart.`

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Definition and references of ${request.name}`}
      style={{ left: position.left, top: position.top, bottom: position.bottom, width: WIDTH, maxHeight: position.maxHeight }}
      className={cx(card({ floating: true, ornate: true }), css({ position: 'fixed', zIndex: 'popover', display: 'flex', flexDir: 'column', overflow: 'hidden' }))}
    >
      <div className={css({ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: '2', pl: '4', pr: '2', pt: '3', pb: '3' })}>
        <div className={css({ flex: '1', minW: '0', pt: '1' })}>
          <div className={css({ fontFamily: 'mono', fontSize: 'xs', fontWeight: 'bold', color: 'fg.muted' })}>{search.isPending ? '…' : kind}</div>
          <div className={css({ mt: '1', fontFamily: 'mono', fontSize: 'lg', color: 'fg.default', truncate: true })}>{request.name}</div>
        </div>
        <IconButton size="sm" label="Close" onClick={onClose}><X /></IconButton>
      </div>

      <div className={css({ flex: '1', minH: '0', overflowY: 'auto' })}>
        {search.isPending && (
          <div className={cx(sectionHeader, css({ color: 'fg.muted', '& svg': { w: '4', h: '4' } }))}>
            <Spinner />
            {repoPath ? 'Searching the repository…' : 'Searching the changed lines…'}
          </div>
        )}

        {result && (
          <>
            <WithTooltip label={searchHint}>
              <div><SectionHeader title="Definition" note={searchNote} /></div>
            </WithTooltip>
            {definitions.length === 0 && <p className={css({ px: '4', py: '2.5', fontSize: 'sm', color: 'fg.subtle' })}>No definition found.</p>}
            {groupByPath(definitions).map(([path, hits]) => (
              <div key={path} className={css({ py: '1.5' })}>
                <div className={css({ display: 'flex', px: '4', pb: '1', fontSize: 'sm', color: 'fg.muted' })}>
                  {path === request.path ? 'In this file' : <PathLabel path={path} />}
                </div>
                <ul>{hits.map(renderHit)}</ul>
              </div>
            ))}

            <SectionHeader title={`${references.length}${result.truncated ? '+' : ''} ${references.length === 1 ? 'Reference' : 'References'}`} note={searchNote}>
              <IconButton size="xs" label="Previous reference in this review" disabled={!steppable.length} onClick={() => step(-1)}><ChevronUp /></IconButton>
              <IconButton size="xs" label="Next reference in this review" disabled={!steppable.length} onClick={() => step(1)}><ChevronDown /></IconButton>
            </SectionHeader>
            {references.length === 0 && <p className={css({ px: '4', py: '2.5', fontSize: 'sm', color: 'fg.subtle' })}>No references found.</p>}
            {referenceGroups.map(([path, hits]) => {
              const open = isExpanded(path)
              return (
                <div key={path}>
                  <button type="button" className={groupRow} aria-expanded={open} onClick={() => toggle(path)}>
                    {open ? <ChevronDown /> : <ChevronRight />}
                    {path === request.path ? <span>In this file</span> : <PathLabel path={path} />}
                    <span className={countBadge}>{hits.length}</span>
                  </button>
                  {open && <ul className={css({ py: '1', borderBottomWidth: '1px', borderColor: 'border.subtle' })}>{hits.map(renderHit)}</ul>}
                </div>
              )
            })}
          </>
        )}
      </div>

      {(editorError || search.data?.repositoryError) && (
        <div className={css({ flexShrink: 0, px: '4', py: '2', fontSize: 'xs', color: 'danger.fg', borderTopWidth: '1px', borderColor: 'border.default' })}>
          {editorError ?? `Could not search the local repository: ${search.data?.repositoryError}`}
        </div>
      )}
      {searchUrl && (
        <button
          type="button"
          onClick={() => openExternal(searchUrl)}
          className={css({ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '2', h: '11', px: '4', fontSize: 'sm', fontWeight: 'semibold', color: 'fg.default', textAlign: 'left', cursor: 'pointer', borderTopWidth: '1px', borderColor: 'border.default', _hover: { bg: 'bg.subtle' }, '& svg': { w: '4', h: '4' } })}
        >
          <Search />
          Search for this symbol
        </button>
      )}
    </div>
  )
}
