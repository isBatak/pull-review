import type { DiffLineAnnotation, FileDiffMetadata, FileDiffOptions, SelectedLineRange } from '@pierre/diffs/react'
import type { ChatCodeContext } from '../../shared/chat'
import type { DiffFile, DiffSide, Discussion } from '../../shared/types'
import type { ReviewStatus } from '../lib/preferences'
import { parseDiffFromFile, processFile } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { Fruncate } from '@pierre/truncate/react'
import { ChevronDown, ChevronRight, Copy, ExternalLink, FileWarning, MessageSquare, Sparkles } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { describeRange } from '../../shared/chat'
import { codeForRange, createLineMap } from '../../shared/line-map'
import { isSearchableSymbol } from '../../shared/symbols'
import { api } from '../lib/api'
import { useChatControls } from '../lib/chat'
import { GITHUB_THEMES } from '../lib/code-tokens'
import { useOpenSymbol } from '../lib/symbols'
import { directoryName, domIdForFile, fileName } from '../lib/format'
import { CommentComposer } from './comment-composer'
import { ImageDiff, isImagePath } from './image-diff'
import { useReview, useReviewActions } from './review-context'
import { ThreadCard } from './thread-card'
import { Button, IconButton, WithTooltip } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { FileIcon } from './ui/file-icon'

interface DraftTarget {
  side: DiffSide
  line: number
}

interface AnnotationData {
  discussions: Discussion[]
  hasDraft: boolean
}

export interface FileDiffCardProps {
  file: DiffFile
  discussions: Discussion[]
  status: ReviewStatus
  collapsed: boolean
  layout: 'split' | 'unified'
  wrap: boolean
  theme: 'light' | 'dark'
  onToggleCollapsed: (file: DiffFile, collapsed: boolean) => void
  onReviewedChange: (file: DiffFile, reviewed: boolean) => void
}


const STATUS_STYLES: Record<DiffFile['status'], { label: string, tone: string }> = {
  added: { label: 'Added', tone: 'success.fg' },
  removed: { label: 'Deleted', tone: 'danger.fg' },
  modified: { label: 'Modified', tone: 'fg.subtle' },
  renamed: { label: 'Renamed', tone: 'accent.fg' },
}

function buildGitDiff(file: DiffFile) {
  const oldPath = file.previousPath ?? file.path
  const lines = [`diff --git a/${oldPath} b/${file.path}`]
  if (file.status === 'added')
    lines.push(`new file mode ${file.bMode}`)
  else if (file.status === 'removed')
    lines.push(`deleted file mode ${file.aMode}`)
  else if (file.status === 'renamed')
    lines.push(`rename from ${oldPath}`, `rename to ${file.path}`)
  lines.push(`--- ${file.status === 'added' ? '/dev/null' : `a/${oldPath}`}`)
  lines.push(`+++ ${file.status === 'removed' ? '/dev/null' : `b/${file.path}`}`)
  lines.push(file.diff.replace(/\n$/, ''))
  return `${lines.join('\n')}\n`
}

function markSymbolToken(token: { tokenText: string, tokenElement: HTMLElement }) {
  if (!isSearchableSymbol(token.tokenText.trim()))
    return
  token.tokenElement.style.cursor = 'pointer'
  token.tokenElement.style.textDecoration = 'underline'
  token.tokenElement.style.textUnderlineOffset = '3px'
}

function unmarkSymbolToken(token: { tokenElement: HTMLElement }) {
  token.tokenElement.style.cursor = ''
  token.tokenElement.style.textDecoration = ''
  token.tokenElement.style.textUnderlineOffset = ''
}

export function DiffStat({ additions, deletions }: { additions: number, deletions: number }) {
  return (
    <span className={css({ display: 'inline-flex', gap: '1.5', fontFamily: 'mono', fontSize: 'xs', fontVariantNumeric: 'tabular-nums' })}>
      <span className={css({ color: 'success.fg' })}>+{additions}</span>
      <span className={css({ color: 'danger.fg' })}>-{deletions}</span>
    </span>
  )
}

function FileDiffCardImpl({
  file,
  discussions,
  status,
  collapsed,
  layout,
  wrap,
  theme,
  onToggleCollapsed,
  onReviewedChange,
}: FileDiffCardProps) {
  const { mergeRequest, projectUrl } = useReview()
  const { create } = useReviewActions()
  const [draft, setDraft] = useState<DraftTarget | null>(null)
  const [largeDiff, setLargeDiff] = useState<FileDiffMetadata | null>(null)
  const [loadingLarge, setLoadingLarge] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const chat = useChatControls()
  const openSymbol = useOpenSymbol()
  const [selection, setSelection] = useState<SelectedLineRange | null>(null)

  const lineMap = useMemo(() => createLineMap(file.diff), [file.diff])
  const oldPath = file.previousPath ?? file.path

  const fileDiff = useMemo(() => {
    if (largeDiff)
      return largeDiff
    if (!file.diff)
      return undefined
    return processFile(buildGitDiff(file), { cacheKey: `${file.id}:${file.diff.length}` })
  }, [file, largeDiff])

  const loadContents = useCallback(async () => {
    const contents = await api.fileContents(
      mergeRequest.ref,
      mergeRequest.diffRefs,
      file.status === 'added' ? null : oldPath,
      file.status === 'removed' ? null : file.path,
    )
    return {
      oldFile: contents.oldContents === null ? null : { name: oldPath, contents: contents.oldContents },
      newFile: { name: file.path, contents: contents.newContents ?? '' },
    }
  }, [mergeRequest.ref, mergeRequest.diffRefs, file.status, file.path, oldPath])

  async function loadLargeDiff() {
    setLoadingLarge(true)
    setLoadError(null)
    try {
      const { oldFile, newFile } = await loadContents()
      setLargeDiff(parseDiffFromFile(oldFile, file.status === 'removed' ? null : newFile))
    }
    catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
    }
    finally {
      setLoadingLarge(false)
    }
  }

  const annotations = useMemo(() => {
    const byLine = new Map<string, DiffLineAnnotation<AnnotationData>>()
    function entry(side: DiffSide, line: number) {
      const key = `${side}:${line}`
      let annotation = byLine.get(key)
      if (!annotation) {
        annotation = { side, lineNumber: line, metadata: { discussions: [], hasDraft: false } }
        byLine.set(key, annotation)
      }
      return annotation
    }
    for (const discussion of discussions) {
      if (discussion.position)
        entry(discussion.position.side, discussion.position.line).metadata.discussions.push(discussion)
    }
    if (draft)
      entry(draft.side, draft.line).metadata.hasDraft = true
    return [...byLine.values()]
  }, [discussions, draft])

  const openDraft = useCallback((range: SelectedLineRange) => {
    const side = range.endSide ?? range.side ?? 'additions'
    setDraft({ side, line: Math.max(range.start, range.end) })
  }, [])

  const isOneSided = file.additions === 0 || file.deletions === 0
  const options = useMemo<FileDiffOptions<AnnotationData, undefined>>(() => ({
    diffStyle: isOneSided && !largeDiff ? 'unified' : layout,
    overflow: wrap ? 'wrap' : 'scroll',
    theme: GITHUB_THEMES,
    themeType: theme,
    disableFileHeader: true,
    lineDiffType: 'word-alt',
    enableGutterUtility: true,
    enableLineSelection: true,
    onGutterUtilityClick: openDraft,
    onLineSelected: chat ? setSelection : undefined,
    onTokenEnter: openSymbol ? markSymbolToken : undefined,
    onTokenLeave: openSymbol ? unmarkSymbolToken : undefined,
    onTokenClick: openSymbol
      ? (token) => {
          const name = token.tokenText.trim()
          if (isSearchableSymbol(name))
            openSymbol({ name, path: file.path, anchor: token.tokenElement.getBoundingClientRect() })
        }
      : undefined,
    loadDiffFiles: file.isBinary ? undefined : loadContents,
  }), [isOneSided, largeDiff, layout, wrap, theme, openDraft, loadContents, file.isBinary, file.path, chat, openSymbol])

  const renderAnnotation = useCallback((annotation: DiffLineAnnotation<AnnotationData>) => {
    const { discussions: threads, hasDraft } = annotation.metadata
    return (
      <div className={css({ display: 'flex', flexDir: 'column', gap: '2', p: '2', maxW: '3xl', fontSize: 'sm' })}>
        {threads.map(discussion => <ThreadCard key={discussion.id} discussion={discussion} />)}
        {hasDraft && (
          <div className={css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'accent.default', borderRadius: 'lg', p: '3' })}>
            <CommentComposer
              submitLabel="Comment"
              autoFocus
              baseUrl={projectUrl}
              busy={create.isPending}
              error={create.error?.message}
              onCancel={() => setDraft(null)}
              onSubmit={async (body) => {
                const position = lineMap.resolve(annotation.side, annotation.lineNumber)
                await create.mutateAsync({
                  body,
                  comment: { oldPath, newPath: file.path, ...position },
                })
                setDraft(null)
              }}
            />
          </div>
        )}
      </div>
    )
  }, [create, file.path, lineMap, oldPath, projectUrl])

  const selectedRange = useMemo(() => {
    if (!selection)
      return null
    const side = selection.endSide ?? selection.side ?? 'additions'
    return { side, startLine: Math.min(selection.start, selection.end), endLine: Math.max(selection.start, selection.end) }
  }, [selection])

  const selectionContext = useMemo<ChatCodeContext | null>(() => selectedRange && {
    ...selectedRange,
    path: selectedRange.side === 'deletions' ? oldPath : file.path,
    code: codeForRange(file.diff, selectedRange.side, selectedRange.startLine, selectedRange.endLine),
  }, [selectedRange, oldPath, file.path, file.diff])

  const chatOpen = chat?.open ?? false
  const autoSelection = chatOpen && (chat?.autoSelection ?? false)
  const setChatSelection = chat?.setSelection
  useEffect(() => {
    if (autoSelection)
      setChatSelection?.(file.id, selectionContext)
  }, [autoSelection, setChatSelection, file.id, selectionContext])

  function askClaude() {
    chat?.addContext(selectionContext ?? { path: file.path, side: 'additions', startLine: null, endLine: null, code: null })
  }

  const resolvedCount = discussions.filter(discussion => discussion.resolved).length
  const openCount = discussions.length - resolvedCount
  const statusStyle = STATUS_STYLES[file.status]

  return (
    <section id={domIdForFile(file.id)} className={css({ scrollMarginTop: '2' })}>
      <header
        onClick={() => onToggleCollapsed(file, !collapsed)}
        className={css({
          position: 'sticky',
          top: '0',
          zIndex: 'sticky',
          display: 'flex',
          alignItems: 'center',
          gap: '2',
          h: '10',
          px: '2.5',
          bg: 'bg.subtle',
          borderWidth: '1px',
          borderColor: 'border.default',
          borderTopRadius: 'lg',
          borderBottomRadius: collapsed ? 'lg' : '0',
          cursor: 'pointer',
          userSelect: 'none',
        })}
      >
        <span className={css({ color: 'fg.subtle', display: 'inline-flex', '& svg': { w: '4', h: '4' } })}>
          {collapsed ? <ChevronRight /> : <ChevronDown />}
        </span>
        <Checkbox
          checked={status === 'reviewed' ? true : status === 'changed' ? 'indeterminate' : false}
          onCheckedChange={checked => onReviewedChange(file, checked)}
          label={`Mark ${file.path} as reviewed`}
        />
        <FileIcon name={fileName(file.path)} />
        <div className={css({ minW: '0', display: 'flex', alignItems: 'center', fontFamily: 'mono', fontSize: 'xs', lineHeight: '1', '--truncate-marker-background-color': 'var(--colors-bg-subtle)' })} title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}>
          {file.previousPath && (
            <span className={css({ color: 'fg.subtle', minW: '0', flexShrink: 1, mr: '1', display: 'flex' })}>
              <Fruncate>{file.previousPath}</Fruncate>
              <span className={css({ px: '1', flexShrink: 0 })}>→</span>
            </span>
          )}
          <span className={css({ color: 'fg.subtle', minW: '0', flexShrink: 1 })}>
            <Fruncate>{directoryName(file.path)}</Fruncate>
          </span>
          <span className={css({ fontWeight: 'semibold', whiteSpace: 'nowrap' })}>{fileName(file.path)}</span>
        </div>
        <span onClick={event => event.stopPropagation()}>
          <IconButton size="xs" label="Copy path" onClick={() => void navigator.clipboard.writeText(file.path)}>
            <Copy />
          </IconButton>
        </span>
        {chat && (
          <span onClick={event => event.stopPropagation()} className={css({ display: 'inline-flex', flexShrink: 0 })}>
            {selectedRange && !collapsed && !autoSelection
              ? (
                  <Button size="xs" onClick={askClaude}>
                    <Sparkles />
                    Ask Claude about {describeRange(selectedRange)}
                  </Button>
                )
              : (
                  <IconButton size="xs" label={selectedRange && !collapsed ? `Keep ${describeRange(selectedRange)} in the question` : 'Ask Claude about this file'} onClick={askClaude}>
                    <Sparkles />
                  </IconButton>
                )}
          </span>
        )}
        <div className={css({ ml: 'auto', display: 'flex', alignItems: 'center', gap: '3', flexShrink: 0 })}>
          {discussions.length > 0 && (
            <WithTooltip label={`${openCount} open, ${resolvedCount} resolved`}>
              <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', fontSize: 'xs', color: openCount ? 'accent.fg' : 'fg.subtle', '& svg': { w: '3.5', h: '3.5' } })}>
                <MessageSquare />
                {discussions.length}
              </span>
            </WithTooltip>
          )}
          {file.isBinary ? <span className={css({ fontSize: 'xs', color: 'fg.subtle' })}>{isImagePath(file.path) ? 'Image' : 'Binary'}</span> : <DiffStat additions={file.additions} deletions={file.deletions} />}
          <span className={cx(css({ fontSize: '2xs', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'wide' }), css({ color: statusStyle.tone }))}>
            {statusStyle.label}
          </span>
          <a
            href={`${mergeRequest.webUrl}/diffs#${file.path}`}
            target="_blank"
            rel="noreferrer"
            onClick={event => event.stopPropagation()}
            aria-label="Open in GitLab"
            className={css({ color: 'fg.subtle', display: 'inline-flex', _hover: { color: 'fg.default' }, '& svg': { w: '3.5', h: '3.5' } })}
          >
            <ExternalLink />
          </a>
        </div>
      </header>

      {!collapsed && (
        <div className={css({ borderWidth: '1px', borderTopWidth: '0', borderColor: 'border.default', borderBottomRadius: 'lg', overflow: 'hidden', bg: 'bg.surface' })}>
          {status === 'changed' && (
            <div className={css({ display: 'flex', alignItems: 'center', gap: '2', px: '3', py: '1.5', fontSize: 'xs', bg: 'warning.subtle', color: 'warning.fg', '& svg': { w: '3.5', h: '3.5' } })}>
              <FileWarning />
              This file changed since you marked it as reviewed.
              <Button size="xs" className={css({ ml: 'auto' })} onClick={() => onReviewedChange(file, true)}>Mark reviewed</Button>
            </div>
          )}
          {file.isBinary && isImagePath(file.path) && <ImageDiff file={file} mergeRequest={mergeRequest} />}
          {file.isBinary && !isImagePath(file.path) && <div className={css({ p: '4', color: 'fg.muted', fontSize: 'sm' })}>Binary file not shown.</div>}
          {!file.isBinary && !fileDiff && (
            <div className={css({ p: '4', display: 'flex', alignItems: 'center', gap: '3', color: 'fg.muted', fontSize: 'sm' })}>
              {file.tooLarge ? 'GitLab collapsed this diff because it is large.' : 'No content changes. The file was renamed or its mode changed.'}
              {file.tooLarge && <Button onClick={() => void loadLargeDiff()} disabled={loadingLarge}>{loadingLarge ? 'Loading…' : 'Load diff'}</Button>}
              {loadError && <span className={css({ color: 'danger.fg' })}>{loadError}</span>}
            </div>
          )}
          {fileDiff && (
            <FileDiff
              fileDiff={fileDiff}
              options={options}
              lineAnnotations={annotations}
              renderAnnotation={renderAnnotation}
              style={{
                '--diffs-font-family': 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
                '--diffs-font-size': '12px',
                '--diffs-line-height': '20px',
              } as React.CSSProperties}
            />
          )}
        </div>
      )}
    </section>
  )
}

export const FileDiffCard = memo(FileDiffCardImpl)
