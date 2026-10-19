import type { DiffLineAnnotation, FileDiffMetadata, FileDiffOptions, SelectedLineRange } from '@pierre/diffs/react'
import type { ChatCodeContext, ChatThread } from '../../shared/chat'
import type { ReviewFinding } from '../../shared/claude-review'
import type { DiffFile, DiffSide, Discussion } from '../../shared/types'
import type { OpenSuggestion } from '../lib/chat'
import type { DiffTextSelection } from '../lib/diff-selection'
import type { ReviewStatus } from '../lib/preferences'
import { DEFAULT_VIRTUAL_FILE_METRICS, parseDiffFromFile, processFile } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { Fruncate } from '@pierre/truncate/react'
import { ChevronDown, ChevronRight, Code2, Copy, ExternalLink, FileWarning, MessageSquare, Sparkles } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { describeRange, toChatThread } from '../../shared/chat'
import { codeForRange, createLineMap } from '../../shared/line-map'
import { parseSuggestionRange } from '../../shared/suggestions'
import { isSearchableSymbol } from '../../shared/symbols'
import { api } from '../lib/api'
import { useChatControls } from '../lib/chat'
import { useClaudeReviewControls } from '../lib/claude-review'
import { readDiffTextSelection, sameTextSelection } from '../lib/diff-selection'
import { GITHUB_THEMES } from '../lib/code-tokens'
import { useOpenSymbol } from '../lib/symbols'
import { directoryName, domIdForFile, fileName } from '../lib/format'
import { useLocalRepo } from '../lib/local-repos'
import { useSettings } from '../lib/settings'
import { codeMetrics, useCodeStyle, useZoom } from '../lib/zoom'
import { CommentComposer } from './comment-composer'
import { FindingCard } from './finding-card'
import { ImageDiff, isImagePath } from './image-diff'
import { useReview, useReviewActions } from './review-context'
import { SuggestionBlock } from './suggestion-block'
import { ThreadCard } from './thread-card'
import { CodeBlockRendererContext } from './ui/markdown'
import { Button, IconButton, WithTooltip } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { FileIcon } from './ui/file-icon'

const NO_FINDINGS: ReviewFinding[] = []

interface DraftTarget {
  side: DiffSide
  line: number
}

interface AnnotationData {
  discussions: Discussion[]
  hasDraft: boolean
  suggestions: OpenSuggestion[]
  findings: ReviewFinding[]
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
  const claudeReview = useClaudeReviewControls()
  const findings = claudeReview?.findingsFor(file.path) ?? NO_FINDINGS
  const reviewFinishedAt = claudeReview?.state.finishedAt ?? null
  const openSymbol = useOpenSymbol()
  const [lineSelection, setLineSelection] = useState<SelectedLineRange | null>(null)
  const [textSelection, setTextSelection] = useState<DiffTextSelection | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const localRepo = useLocalRepo(mergeRequest.ref)
  const [settings] = useSettings()
  const [editorError, setEditorError] = useState<string | null>(null)

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

  const allSuggestions = chat?.suggestionDrafts
  const suggestions = useMemo(() => allSuggestions?.filter(suggestion => suggestion.path === file.path) ?? [], [allSuggestions, file.path])
  const closeSuggestion = chat?.closeSuggestion
  const sectionRef = useRef<HTMLElement>(null)
  const firstSuggestionId = suggestions.find(suggestion => suggestion.first)?.id

  useEffect(() => {
    if (suggestions.length && collapsed)
      onToggleCollapsed(file, false)
  }, [suggestions.length, collapsed, onToggleCollapsed, file])

  useEffect(() => {
    if (firstSuggestionId)
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [firstSuggestionId])

  const annotations = useMemo(() => {
    const byLine = new Map<string, DiffLineAnnotation<AnnotationData>>()
    function entry(side: DiffSide, line: number) {
      const key = `${side}:${line}`
      let annotation = byLine.get(key)
      if (!annotation) {
        annotation = { side, lineNumber: line, metadata: { discussions: [], hasDraft: false, suggestions: [], findings: [] } }
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
    for (const suggestion of suggestions)
      entry(suggestion.side ?? 'additions', suggestion.line).metadata.suggestions.push(suggestion)
    for (const finding of findings)
      entry(finding.side, finding.endLine).metadata.findings.push(finding)
    return [...byLine.values()]
  }, [discussions, draft, suggestions, findings])

  const openDraft = useCallback((range: SelectedLineRange) => {
    const side = range.endSide ?? range.side ?? 'additions'
    setDraft({ side, line: Math.max(range.start, range.end) })
  }, [])

  const selectLines = useCallback((range: SelectedLineRange | null) => {
    setLineSelection(range)
    setTextSelection(null)
  }, [])

  const isOneSided = file.additions === 0 || file.deletions === 0
  const codeStyle = useCodeStyle()
  const [zoom] = useZoom()
  const metrics = useMemo(() => ({ ...DEFAULT_VIRTUAL_FILE_METRICS, lineHeight: codeMetrics(zoom, 12, 20).lineHeight }), [zoom])
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
    onLineSelected: chat ? selectLines : undefined,
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
  }), [isOneSided, largeDiff, layout, wrap, theme, openDraft, loadContents, file.isBinary, file.path, chat, selectLines, openSymbol])

  const renderAnnotation = useCallback((annotation: DiffLineAnnotation<AnnotationData>) => {
    const { discussions: threads, hasDraft, suggestions: lineSuggestions, findings: lineFindings } = annotation.metadata
    function renderSuggestion(language: string | null, code: string) {
      const range = parseSuggestionRange(language)
      if (!range || annotation.side !== 'additions')
        return null
      const original = codeForRange(file.diff, 'additions', annotation.lineNumber - range.above, annotation.lineNumber + range.below)
      return original === null ? null : <SuggestionBlock path={file.path} original={original} suggested={code} />
    }
    async function submitComment(body: string) {
      const position = lineMap.resolve(annotation.side, annotation.lineNumber)
      await create.mutateAsync({ body, comment: { oldPath, newPath: file.path, ...position } })
    }
    return (
      <CodeBlockRendererContext value={renderSuggestion}>
        <div className={css({ display: 'flex', flexDir: 'column', gap: '2', p: '2', maxW: '3xl', fontSize: 'sm' })}>
          {threads.map(discussion => (
            <div key={discussion.id} data-discussion-id={discussion.id}>
              <ThreadCard discussion={discussion} />
            </div>
          ))}
          {lineFindings.map(finding => <FindingCard key={finding.id} finding={finding} file={file} finishedAt={reviewFinishedAt} />)}
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
                  await submitComment(body)
                  setDraft(null)
                }}
              />
            </div>
          )}
          {lineSuggestions.map(suggestion => (
            <div key={suggestion.id} className={css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'accent.default', borderRadius: 'lg', p: '3' })}>
              <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', mb: '2', fontSize: 'xs', color: 'accent.fg', '& svg': { w: '3.5', h: '3.5' } })}>
                <Sparkles />
                Draft from Claude. Edit it if needed, then click Comment to post it.
              </div>
              <CommentComposer
                initialValue={suggestion.body}
                submitLabel="Comment"
                baseUrl={projectUrl}
                busy={create.isPending}
                error={create.error?.message}
                onCancel={() => closeSuggestion?.(suggestion.id)}
                onSubmit={async (body) => {
                  await submitComment(body)
                  closeSuggestion?.(suggestion.id)
                }}
              />
            </div>
          ))}
        </div>
      </CodeBlockRendererContext>
    )
  }, [create, file, lineMap, oldPath, projectUrl, closeSuggestion, reviewFinishedAt])

  useEffect(() => {
    if (!chat || collapsed)
      return
    let frame = 0
    function update() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const container = bodyRef.current
        if (!container)
          return
        const result = readDiffTextSelection(container)
        if (result === 'outside')
          return
        const next = result === 'cleared' ? null : result
        setTextSelection(current => sameTextSelection(current, next) ? current : next)
      })
    }
    document.addEventListener('selectionchange', update)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', update)
    }
  }, [chat, collapsed])

  const selectedRange = useMemo(() => {
    if (textSelection) {
      if (textSelection.startLine !== null && textSelection.endLine !== null)
        return { side: textSelection.side, startLine: textSelection.startLine, endLine: textSelection.endLine }
      const positions = discussions.filter(discussion => textSelection.discussionIds.includes(discussion.id)).flatMap(discussion => discussion.position ? [discussion.position] : [])
      const first = positions[0]
      if (!first)
        return null
      const lines = positions.filter(position => position.side === first.side).map(position => position.line)
      return { side: first.side, startLine: Math.min(...lines), endLine: Math.max(...lines) }
    }
    if (!lineSelection)
      return null
    const side = lineSelection.endSide ?? lineSelection.side ?? 'additions'
    return { side, startLine: Math.min(lineSelection.start, lineSelection.end), endLine: Math.max(lineSelection.start, lineSelection.end) }
  }, [textSelection, lineSelection, discussions])

  const selectedThreads = useMemo<ChatThread[]>(() => {
    if (!selectedRange)
      return []
    const pickedIds = new Set(textSelection?.discussionIds)
    return discussions
      .filter(discussion => pickedIds.has(discussion.id) || (
        discussion.position?.side === selectedRange.side
        && discussion.position.line >= selectedRange.startLine
        && discussion.position.line <= selectedRange.endLine
      ))
      .flatMap(discussion => toChatThread(discussion) ?? [])
  }, [selectedRange, textSelection, discussions])

  const selectionContext = useMemo<ChatCodeContext | null>(() => selectedRange && {
    ...selectedRange,
    path: selectedRange.side === 'deletions' ? oldPath : file.path,
    code: codeForRange(file.diff, selectedRange.side, selectedRange.startLine, selectedRange.endLine),
    threads: selectedThreads,
  }, [selectedRange, selectedThreads, oldPath, file.path, file.diff])

  const chatOpen = chat?.open ?? false
  const autoSelection = chatOpen && (chat?.autoSelection ?? false)
  const setChatSelection = chat?.setSelection
  useEffect(() => {
    if (autoSelection)
      setChatSelection?.(file.id, selectionContext)
  }, [autoSelection, setChatSelection, file.id, selectionContext])

  function askClaude() {
    chat?.addContext(selectionContext ?? {
      path: file.path,
      side: 'additions',
      startLine: null,
      endLine: null,
      code: null,
      threads: discussions.flatMap(discussion => toChatThread(discussion) ?? []),
    })
  }

  const editorLine = selectedRange?.side === 'additions' ? selectedRange.startLine : 1
  async function openInEditor() {
    if (!localRepo.path)
      return
    setEditorError(null)
    try {
      await api.openInEditor({ repoPath: localRepo.path, path: file.path, line: editorLine, column: 1, editor: settings.editor })
    }
    catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error))
    }
  }

  const resolvedCount = discussions.filter(discussion => discussion.resolved).length
  const openCount = discussions.length - resolvedCount
  const statusStyle = STATUS_STYLES[file.status]

  return (
    <section ref={sectionRef} id={domIdForFile(file.id)} className={css({ scrollMarginTop: '2' })}>
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
          {findings.length > 0 && (
            <WithTooltip label={`${findings.length} open ${findings.length === 1 ? 'finding' : 'findings'} from Claude`}>
              <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', fontSize: 'xs', color: 'accent.fg', '& svg': { w: '3.5', h: '3.5' } })}>
                <Sparkles />
                {findings.length}
              </span>
            </WithTooltip>
          )}
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
          {localRepo.path && file.status !== 'removed' && (
            <span onClick={event => event.stopPropagation()} className={css({ display: 'inline-flex' })}>
              <IconButton size="xs" label={`Open in editor at line ${editorLine}`} onClick={() => void openInEditor()}>
                <Code2 />
              </IconButton>
            </span>
          )}
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
          {editorError && (
            <div className={css({ display: 'flex', alignItems: 'center', gap: '2', px: '3', py: '1.5', fontSize: 'xs', bg: 'danger.subtle', color: 'danger.fg' })}>
              {editorError}
              <Button size="xs" variant="ghost" className={css({ ml: 'auto' })} onClick={() => setEditorError(null)}>Dismiss</Button>
            </div>
          )}
          {fileDiff && (
            <div ref={bodyRef}>
              <FileDiff
                fileDiff={fileDiff}
                options={options}
                lineAnnotations={annotations}
                renderAnnotation={renderAnnotation}
                metrics={metrics}
                style={codeStyle}
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export const FileDiffCard = memo(FileDiffCardImpl)
