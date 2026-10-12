import type { DiffFile, Discussion, MrPayload, MrRef } from '../../shared/types'
import { Virtualizer } from '@pierre/diffs/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { css } from 'styled-system/css'
import { BUNDLE_COMMENT_MARKER } from '../../shared/bundle'
import { mrKey } from '../../shared/mr-ref'
import { BundlePanel } from '../components/bundle/bundle-panel'
import { ChatPanel } from '../components/chat/chat-panel'
import { FileDiffCard } from '../components/file-diff-card'
import { MrHeader } from '../components/mr-header'
import { OverviewPanel } from '../components/overview-panel'
import { ResizableLayout } from '../components/resizable-layout'
import { ReviewContext } from '../components/review-context'
import { SettingsDialog } from '../components/settings/settings-dialog'
import { Sidebar } from '../components/sidebar'
import { UnderlineTabs } from '../components/ui/underline-tabs'
import { useDiscussions, useMergeRequest } from '../hooks/use-merge-request'
import { ApiError } from '../lib/api'
import { ChatContext, ChatDraftContext, useChatAvailable, useChatState } from '../lib/chat'
import { domIdForFile } from '../lib/format'
import { useDiffLayout, useReviewedFiles, useTheme, useWrapLines } from '../lib/preferences'
import { useClassifier, useSettings } from '../lib/settings'
import { useStoredState } from '../lib/stored-state'
import { ErrorState, LoadingState } from './states'

const EMPTY: Discussion[] = []

type ReviewTab = 'code' | 'overview' | 'bundle'

interface SortedDiscussions {
  general: Discussion[]
  detached: Discussion[]
  byFile: Map<string, Discussion[]>
}

function sortDiscussions(discussions: Discussion[], payload: MrPayload): SortedDiscussions {
  const pathToFile = new Map<string, DiffFile>()
  for (const file of payload.files) {
    pathToFile.set(file.path, file)
    if (file.previousPath)
      pathToFile.set(file.previousPath, file)
  }
  const result: SortedDiscussions = { general: [], detached: [], byFile: new Map() }
  for (const discussion of discussions) {
    if (discussion.notes.some(note => note.body.includes(BUNDLE_COMMENT_MARKER)))
      continue
    const position = discussion.position
    if (!position) {
      result.general.push(discussion)
      continue
    }
    const file = pathToFile.get(position.newPath) ?? pathToFile.get(position.oldPath)
    if (!file || position.headSha !== payload.mergeRequest.diffRefs.headSha) {
      result.detached.push(discussion)
      continue
    }
    const list = result.byFile.get(file.path) ?? []
    list.push(discussion)
    result.byFile.set(file.path, list)
  }
  return result
}

const SCROLL_SETTLE_ATTEMPTS = 12

let activeScrollId = 0

function scrollUntilSettled(id: string) {
  const scrollId = ++activeScrollId
  const step = (attempt: number, lastTop: number | null) => {
    if (scrollId !== activeScrollId)
      return
    const element = document.getElementById(id)
    if (!element) {
      if (attempt < SCROLL_SETTLE_ATTEMPTS)
        setTimeout(() => step(attempt + 1, null), 60)
      return
    }
    element.scrollIntoView({ block: 'start' })
    setTimeout(() => {
      const top = element.getBoundingClientRect().top
      if (attempt < SCROLL_SETTLE_ATTEMPTS && (lastTop === null || Math.abs(top - lastTop) > 1))
        step(attempt + 1, top)
    }, 60)
  }
  step(0, null)
}

function ReviewView({ payload, mrRef }: { payload: MrPayload, mrRef: MrRef }) {
  const discussionsQuery = useDiscussions(mrRef)
  const mrQuery = useMergeRequest(mrRef)
  const [layout, setLayout] = useDiffLayout()
  const [wrap, setWrap] = useWrapLines()
  const [theme, setTheme] = useTheme()
  const { statusOf, setReviewed } = useReviewedFiles(mrRef)
  const [collapseOverrides, setCollapseOverrides] = useState<Map<string, boolean>>(() => new Map())

  const classifier = useClassifier()
  const groups = useMemo(() => classifier.group(payload.files), [classifier, payload.files])
  const orderedFiles = useMemo(() => groups.flatMap(group => group.files), [groups])
  const sorted = useMemo(() => sortDiscussions(discussionsQuery.data ?? EMPTY, payload), [discussionsQuery.data, payload])

  const overviewThreads = [...sorted.general, ...sorted.detached]
  const overviewThreadCount = overviewThreads.length
  const unresolvedOverviewCount = overviewThreads.filter(discussion => discussion.resolvable && !discussion.resolved).length

  const openThreadsByFile = useMemo(() => {
    const counts = new Map<string, number>()
    for (const [path, list] of sorted.byFile)
      counts.set(path, list.filter(discussion => !discussion.resolved).length)
    return counts
  }, [sorted.byFile])

  const isCollapsed = useCallback((file: DiffFile) => {
    return collapseOverrides.get(file.id) ?? (statusOf(file) === 'reviewed' || classifier.isCollapsedByDefault(file))
  }, [collapseOverrides, statusOf, classifier])

  const setCollapsed = useCallback((files: DiffFile[], collapsed: boolean) => {
    setCollapseOverrides((current) => {
      const next = new Map(current)
      for (const file of files)
        next.set(file.id, collapsed)
      return next
    })
  }, [])

  const toggleCollapsed = useCallback((file: DiffFile, collapsed: boolean) => setCollapsed([file], collapsed), [setCollapsed])

  const markReviewed = useCallback((files: DiffFile[], reviewed: boolean) => {
    setReviewed(files, reviewed)
    setCollapsed(files, reviewed)
  }, [setReviewed, setCollapsed])

  const markOneReviewed = useCallback((file: DiffFile, reviewed: boolean) => markReviewed([file], reviewed), [markReviewed])

  const [params, setParams] = useSearchParams()
  const [settings, updateSettings] = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const chatAvailable = useChatAvailable()
  const [chatOpen, setChatOpen] = useStoredState('pull-review:chat-open', false)
  const { controls: chatControls, draft: chatDraft } = useChatState(chatAvailable && chatOpen, setChatOpen, settings.chatSelection === 'automatic')
  const closeChat = useCallback(() => setChatOpen(false), [setChatOpen])
  const tabParam = params.get('tab')
  const tab: ReviewTab = tabParam === 'overview' || tabParam === 'bundle' ? tabParam : 'code'
  const useGroupTabs = settings.groupLayout === 'tabs'
  const activeGroupKey = useGroupTabs && groups.some(group => group.key === params.get('group')) ? params.get('group')! : 'all'
  const visibleGroups = activeGroupKey === 'all' ? groups : groups.filter(group => group.key === activeGroupKey)

  const setParam = useCallback((key: string, value: string | null) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value === null)
        next.delete(key)
      else
        next.set(key, value)
      return next
    }, { replace: true })
  }, [setParams])

  const selectFile = useCallback((file: DiffFile) => {
    setCollapsed([file], false)
    setParam('tab', null)
    scrollUntilSettled(domIdForFile(file.id))
  }, [setCollapsed, setParam])

  const context = useMemo(() => ({
    mergeRequest: payload.mergeRequest,
    viewer: payload.viewer,
    projectUrl: `https://${mrRef.host}/${mrRef.project}`,
  }), [payload, mrRef])

  useEffect(() => {
    document.title = `!${mrRef.iid} ${payload.mergeRequest.title}`
  }, [mrRef.iid, payload.mergeRequest.title])

  useEffect(() => {
    if (!settings.project)
      updateSettings({ project: { host: mrRef.host, project: mrRef.project } })
  }, [settings.project, mrRef.host, mrRef.project])

  return (
    <ReviewContext value={context}>
      <ChatContext value={chatAvailable ? chatControls : null}>
        <div className={css({ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gridTemplateColumns: 'minmax(0, 1fr)', h: '100dvh' })}>
          <MrHeader
            files={payload.files}
            layout={layout}
            onLayoutChange={setLayout}
            wrap={wrap}
            onWrapChange={setWrap}
            theme={theme}
            onThemeChange={setTheme}
            refreshing={mrQuery.isFetching || discussionsQuery.isFetching}
            onRefresh={() => {
              void mrQuery.refetch()
              void discussionsQuery.refetch()
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            chatOpen={chatAvailable ? chatControls.open : null}
            onChatOpenChange={setChatOpen}
          />
          <ResizableLayout
            aside={chatControls.open ? <ChatDraftContext value={chatDraft}><ChatPanel mrRef={mrRef} baseUrl={context.projectUrl} /></ChatDraftContext> : null}
            onAsideClose={closeChat}
            sidebar={(
              <Sidebar
                groups={visibleGroups}
                allFiles={orderedFiles}
                showGroups={!useGroupTabs}
                statusOf={statusOf}
                openThreadsByFile={openThreadsByFile}
                onSelectFile={selectFile}
                onReviewedChange={markReviewed}
              />
            )}
          >
            <div className={css({ display: 'flex', flexDir: 'column', minH: '0', minW: '0' })}>
              <div className={css({ flexShrink: 0, px: '4', borderBottomWidth: '1px', borderColor: 'border.default', bg: 'bg.surface' })}>
                <UnderlineTabs
                  label="Review sections"
                  value={tab}
                  onChange={value => setParam('tab', value === 'code' ? null : value)}
                  tabs={[
                    { value: 'code', label: 'Code', count: payload.files.length },
                    {
                      value: 'overview',
                      label: 'Overview',
                      count: overviewThreadCount || null,
                      badge: unresolvedOverviewCount > 0 && <span aria-label={`${unresolvedOverviewCount} unresolved`} className={css({ w: '1.5', h: '1.5', borderRadius: 'full', bg: 'accent.default' })} />,
                    },
                    { value: 'bundle', label: 'Bundle' },
                  ]}
                />
                {useGroupTabs && tab === 'code' && groups.length > 1 && (
                  <UnderlineTabs
                    label="File groups"
                    size="sm"
                    value={activeGroupKey}
                    onChange={value => setParam('group', value === 'all' ? null : value)}
                    tabs={[
                      { value: 'all', label: 'All files', count: payload.files.length },
                      ...groups.map(group => ({ value: group.key, label: group.label, count: group.files.length })),
                    ]}
                    className={css({ borderTopWidth: '1px', borderColor: 'border.subtle' })}
                  />
                )}
              </div>
              {tab === 'bundle' && (
                <div className={css({ flex: '1', minH: '0', overflowY: 'auto', bg: 'bg.canvas' })}>
                  <div className={css({ maxW: '1200px', mx: 'auto', p: '6' })}>
                    <BundlePanel mrRef={mrRef} />
                  </div>
                </div>
              )}
              {tab === 'overview'
                ? (
                    <div className={css({ flex: '1', minH: '0', overflowY: 'auto', bg: 'bg.canvas' })}>
                      <div className={css({ maxW: '960px', mx: 'auto', p: '6' })}>
                        {discussionsQuery.error && (
                          <div className={css({ color: 'danger.fg', fontSize: 'sm', mb: '4' })}>
                            Could not load comments:
                            {' '}
                            {discussionsQuery.error.message}
                          </div>
                        )}
                        <OverviewPanel general={sorted.general} detached={sorted.detached} />
                      </div>
                    </div>
                  )
                : tab === 'code' && (
                    <Virtualizer
                      className={css({ flex: '1', minH: '0', overflowY: 'auto', bg: 'bg.canvas' })}
                      contentClassName={css({ display: 'flex', flexDir: 'column', gap: '3', p: '4', maxW: '1600px', mx: 'auto' })}
                    >
                      {visibleGroups.map((group, index) => (
                        <div key={group.key} className={css({ display: 'flex', flexDir: 'column', gap: '3' })}>
                          {(!useGroupTabs || activeGroupKey === 'all') && (
                            <div className={css({ display: 'flex', alignItems: 'baseline', gap: '2' })} style={{ marginTop: index === 0 ? 0 : 16 }}>
                              <h2 className={css({ fontSize: 'sm', fontWeight: 'semibold' })}>{group.label}</h2>
                              <span className={css({ fontSize: 'xs', color: 'fg.subtle' })}>{group.description}</span>
                            </div>
                          )}
                          {group.files.map(file => (
                            <FileDiffCard
                              key={file.id}
                              file={file}
                              discussions={sorted.byFile.get(file.path) ?? EMPTY}
                              status={statusOf(file)}
                              collapsed={isCollapsed(file)}
                              layout={layout}
                              wrap={wrap}
                              theme={theme}
                              onToggleCollapsed={toggleCollapsed}
                              onReviewedChange={markOneReviewed}
                            />
                          ))}
                        </div>
                      ))}
                      {orderedFiles.length === 0 && <div className={css({ color: 'fg.muted', p: '8', textAlign: 'center' })}>This merge request has no changes.</div>}
                    </Virtualizer>
                  )}
            </div>
          </ResizableLayout>
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={updateSettings} />
        </div>
      </ChatContext>
    </ReviewContext>
  )
}

export function ReviewPage({ mrRef }: { mrRef: MrRef }) {
  const query = useMergeRequest(mrRef)
  if (query.isPending)
    return <LoadingState label={`Loading ${mrKey(mrRef)}`} />
  if (query.error) {
    const missingToken = query.error instanceof ApiError && query.error.code === 'missing-token'
    return <ErrorState title={missingToken ? 'GitLab token needed' : 'Could not load the merge request'} message={query.error.message} onRetry={() => void query.refetch()} />
  }
  return <ReviewView payload={query.data} mrRef={mrRef} />
}
