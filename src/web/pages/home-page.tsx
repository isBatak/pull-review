import type { MrListEntry, StackInfo } from '../../shared/stacks'
import type { MrListState, MrSummary, ProjectInfo, User } from '../../shared/types'
import type { PeopleFilter } from '../components/mr-list/filters'
import type { QuickFilter } from '../lib/mr-display'
import type { Team } from '../lib/settings'
import { FolderGit2, GitPullRequest, Layers, RefreshCw } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { css, cx } from 'styled-system/css'
import { card, hero, skeleton } from 'styled-system/recipes'
import { parseMrTitle } from '../../shared/mr-title'
import { analyzeStacks, groupIntoStacks, isWarning } from '../../shared/stacks'
import { AppHeader } from '../components/app-header'
import { PeopleFilters, QuickFilters, SearchBox, StateTabs, TagFilters } from '../components/mr-list/filters'
import { MemberFilter } from '../components/mr-list/member-filter'
import { MrRow } from '../components/mr-list/mr-row'
import { OpenInGitlab } from '../components/mr-list/open-in-gitlab'
import { StackGroup } from '../components/mr-list/stack-group'
import { SettingsDialog } from '../components/settings/settings-dialog'
import { Button, IconButton } from '../components/ui/button'
import { useMergeRequestCounts, useMergeRequestList, useProjectInfo, useProjectMembers, useProjectViewer } from '../hooks/use-project'
import { matchesQuickFilter } from '../lib/mr-display'
import { rememberHomeSearch } from '../lib/last-home'
import { parseProjectInput, useSettings } from '../lib/settings'

const OPEN_LIMIT = 500
const PAGE_STEP = 30
const STATES = new Set<MrListState>(['opened', 'merged', 'closed', 'all'])
const QUICK = new Set<QuickFilter>(['all', 'ready', 'attention', 'draft', 'review'])

function usernamesToIds(usernames: string[], members: User[] | undefined) {
  if (!members)
    return []
  const byUsername = new Map(members.map(member => [member.username, member.id]))
  return usernames.flatMap(username => byUsername.get(username) ?? [])
}

function matchesPeople(mr: MrSummary, people: PeopleFilter, viewer: User | undefined, teams: Team[]) {
  if (people === 'everyone')
    return true
  if (people === 'mine')
    return mr.author.id === viewer?.id
  if (people === 'review')
    return mr.reviewers.some(reviewer => reviewer.id === viewer?.id)
  const team = teams.find(item => `team:${item.id}` === people)
  return team ? team.members.includes(mr.author.username) : true
}

function matchesSearch(mr: MrSummary, needle: string) {
  if (!needle)
    return true
  const text = `${mr.title} !${mr.iid} ${mr.author.name} ${mr.author.username} ${mr.sourceBranch} ${mr.targetBranch}`.toLowerCase()
  return needle.split(/\s+/).every(part => text.includes(part))
}

function matchesTags(mr: MrSummary, tags: Set<string>) {
  if (!tags.size)
    return true
  return parseMrTitle(mr.title).apps.some(app => tags.has(app.name))
}

function countTags(mrs: MrSummary[]) {
  const counts = new Map<string, number>()
  for (const mr of mrs) {
    for (const name of new Set(parseMrTitle(mr.title).apps.map(app => app.name)))
      counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function SkeletonRows() {
  return (
    <div aria-hidden>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className={css({ display: 'flex', gap: '3', px: '4', py: '3.5', '& + &': { borderTopWidth: '1px', borderColor: 'border.subtle' } })}>
          <span className={cx(skeleton({ shape: 'circle' }), css({ w: '4', h: '4' }))} />
          <div className={css({ flex: '1', display: 'flex', flexDir: 'column', gap: '2' })}>
            <span className={cx(skeleton(), css({ h: '3.5' }))} style={{ width: `${45 + ((index * 17) % 40)}%` }} />
            <span className={cx(skeleton({ tone: 'soft' }), css({ h: '2.5', w: '40%' }))} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ title, body }: { title: string, body: string }) {
  return (
    <div className={css({ display: 'flex', flexDir: 'column', alignItems: 'center', gap: '2', py: '16', px: '6', textAlign: 'center', '& svg': { w: '7', h: '7', color: 'fg.subtle' } })}>
      <GitPullRequest />
      <p className={css({ fontWeight: 'semibold' })}>{title}</p>
      <p className={css({ fontSize: 'sm', color: 'fg.muted', maxW: 'md' })}>{body}</p>
    </div>
  )
}

function ProjectOnboarding({ onPick }: { onPick: (value: string) => boolean }) {
  const [value, setValue] = useState('https://gitlab.tradelocker.com/tradelocker/tradelocker')
  const [error, setError] = useState(false)
  return (
    <div className={cx(card({ ornate: true }), css({ maxW: 'xl', mx: 'auto', mt: '20', p: '8', textAlign: 'center', '& > svg': { w: '8', h: '8', color: 'accent.fg', mx: 'auto', mb: '3' }, _tavern: { '& > svg': { display: 'none' } } }))}>
      <span className={hero()} aria-hidden />
      <FolderGit2 />
      <h1 className={css({ fontSize: 'xl', fontWeight: 'semibold' })}>Pick a GitLab project</h1>
      <p className={css({ color: 'fg.muted', fontSize: 'sm', mt: '1.5', mb: '5' })}>Its merge requests show up here. You can always paste any merge request link in the bar above.</p>
      <form
        className={css({ display: 'flex', gap: '2' })}
        onSubmit={(event) => {
          event.preventDefault()
          setError(!onPick(value))
        }}
      >
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(false)
          }}
          className={css({ flex: '1', h: '10', px: '3', fontSize: 'sm', bg: 'bg.canvas', borderWidth: '1px', borderColor: error ? 'danger.fg' : 'border.default', borderRadius: 'md', outline: 'none', _focus: { borderColor: 'accent.default' } })}
        />
        <Button type="submit" variant="solid" size="md" className={css({ h: '10' })}>Continue</Button>
      </form>
    </div>
  )
}

interface ListBodyProps {
  entries: MrListEntry[]
  stackInfo: Map<number, StackInfo>
  project: ProjectInfo
  jiraBaseUrl: string
  activeTags: Set<string>
  onToggleTag: (tag: string) => void
}

function ListBody({ entries, stackInfo, project, jiraBaseUrl, activeTags, onToggleTag }: ListBodyProps) {
  return (
    <div>
      {entries.map(entry => (
        <div key={entry.kind === 'single' ? entry.mr.iid : `stack-${entry.stack.root.iid}`} className={css({ '& + &': { borderTopWidth: '1px', borderColor: 'border.subtle' } })}>
          {entry.kind === 'single'
            ? <MrRow mr={entry.mr} stack={stackInfo.get(entry.mr.iid)} defaultBranch={project.defaultBranch} jiraBaseUrl={jiraBaseUrl} activeTags={activeTags} onToggleTag={onToggleTag} />
            : <StackGroup stack={entry.stack} stackInfo={stackInfo} defaultBranch={project.defaultBranch} jiraBaseUrl={jiraBaseUrl} activeTags={activeTags} onToggleTag={onToggleTag} />}
        </div>
      ))}
    </div>
  )
}

export function HomePage() {
  const [settings, updateSettings] = useSettings()
  const [settingsOpen, setSettingsOpen] = useState<false | 'general' | 'teams'>(false)
  const [params, setParams] = useSearchParams()
  const project = settings.project

  const state = STATES.has(params.get('state') as MrListState) ? params.get('state') as MrListState : 'opened'
  const people = (params.get('people') ?? 'everyone') as PeopleFilter
  const quick = QUICK.has(params.get('quick') as QuickFilter) ? params.get('quick') as QuickFilter : 'all'
  const activeTags = useMemo(() => new Set((params.get('apps') ?? '').split(',').filter(Boolean)), [params])
  const selectedMembers = useMemo(() => new Set((params.get('members') ?? '').split(',').filter(Boolean)), [params])
  const [search, setSearch] = useState(params.get('q') ?? '')
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())
  const [limit, setLimit] = useState(PAGE_STEP)

  function setParam(key: string, value: string | null) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value === null || value === '')
        next.delete(key)
      else
        next.set(key, value)
      return next
    }, { replace: true })
  }

  useEffect(() => {
    const handle = setTimeout(() => setParam('q', search.trim() || null), 300)
    return () => clearTimeout(handle)
  }, [search])

  useEffect(() => setLimit(PAGE_STEP), [state, people, deferredSearch, params.get('members')])

  useEffect(() => rememberHomeSearch(params.toString() ? `?${params}` : ''), [params])

  const projectInfo = useProjectInfo(project)
  const viewer = useProjectViewer(project)
  const members = useProjectMembers(project)

  const team = settings.teams.find(item => `team:${item.id}` === people)
  const teamMembers = useMemo(() => {
    if (!team || !members.data)
      return []
    const usernames = new Set(team.members)
    return members.data.filter(member => usernames.has(member.username))
  }, [team, members.data])
  const activeMembers = useMemo(
    () => (team ? team.members.filter(username => selectedMembers.has(username)) : []),
    [team, selectedMembers],
  )
  const authorIds = useMemo(() => {
    if (people === 'mine')
      return viewer.data ? [viewer.data.id] : undefined
    if (team)
      return usernamesToIds(activeMembers.length ? activeMembers : team.members, members.data)
    return undefined
  }, [people, team, activeMembers, viewer.data, members.data])

  const isOpen = state === 'opened'
  const openQuery = useMergeRequestList(project, { state: 'opened', limit: OPEN_LIMIT })
  const pagedQuery = useMergeRequestList(project, {
    state,
    limit,
    authorIds,
    reviewerId: people === 'review' ? viewer.data?.id : undefined,
    search: deferredSearch || undefined,
  }, !isOpen && (people === 'everyone' || Boolean(authorIds?.length) || (people === 'review' && Boolean(viewer.data))))
  const counts = useMergeRequestCounts(project, authorIds, people !== 'review')

  const openPeopleFiltered = useMemo(
    () => (openQuery.data?.items ?? []).filter(mr =>
      matchesPeople(mr, people, viewer.data, settings.teams)
      && (!activeMembers.length || activeMembers.includes(mr.author.username))),
    [openQuery.data, people, viewer.data, settings.teams, activeMembers],
  )

  const memberCounts = useMemo(() => {
    if (!isOpen || !team || !openQuery.data)
      return undefined
    const counts = new Map(team.members.map(username => [username, 0]))
    for (const mr of openQuery.data.items) {
      if (counts.has(mr.author.username))
        counts.set(mr.author.username, counts.get(mr.author.username)! + 1)
    }
    return counts
  }, [isOpen, team, openQuery.data])

  const peopleCounts = useMemo(() => {
    if (!isOpen || !openQuery.data)
      return undefined
    const all = openQuery.data.items
    const result: Partial<Record<PeopleFilter, number>> = {
      everyone: all.length,
      mine: all.filter(mr => matchesPeople(mr, 'mine', viewer.data, settings.teams)).length,
      review: all.filter(mr => matchesPeople(mr, 'review', viewer.data, settings.teams)).length,
    }
    for (const item of settings.teams)
      result[`team:${item.id}`] = all.filter(mr => matchesPeople(mr, `team:${item.id}`, viewer.data, settings.teams)).length
    return result
  }, [isOpen, openQuery.data, viewer.data, settings.teams])

  const baseList = isOpen ? openPeopleFiltered : (pagedQuery.data?.items ?? [])
  const searched = useMemo(() => (isOpen ? baseList.filter(mr => matchesSearch(mr, deferredSearch)) : baseList), [isOpen, baseList, deferredSearch])
  const tags = useMemo(() => countTags(searched), [searched])
  const tagged = useMemo(() => searched.filter(mr => matchesTags(mr, activeTags)), [searched, activeTags])

  const quickCounts = useMemo(() => ({
    all: tagged.length,
    review: tagged.filter(mr => matchesQuickFilter(mr, 'review')).length,
    ready: tagged.filter(mr => matchesQuickFilter(mr, 'ready')).length,
    attention: tagged.filter(mr => matchesQuickFilter(mr, 'attention')).length,
    draft: tagged.filter(mr => matchesQuickFilter(mr, 'draft')).length,
  }), [tagged])
  const visible = useMemo(() => (isOpen ? tagged.filter(mr => matchesQuickFilter(mr, quick)) : tagged), [isOpen, tagged, quick])

  const defaultBranch = projectInfo.data?.defaultBranch ?? 'develop'
  const stackInfo = useMemo(() => analyzeStacks(openQuery.data?.items ?? [], defaultBranch), [openQuery.data, defaultBranch])
  const entries = useMemo<MrListEntry[]>(
    () => (isOpen ? groupIntoStacks(visible, stackInfo) : visible.map(mr => ({ kind: 'single', mr }))),
    [isOpen, visible, stackInfo],
  )
  const stackCount = entries.filter(entry => entry.kind === 'stack').length
  const tagWarnings = isOpen ? visible.filter(mr => stackInfo.get(mr.iid)?.issues.some(isWarning)).length : 0

  const tabCounts = {
    opened: openQuery.data ? openPeopleFiltered.length : undefined,
    merged: people === 'review' ? undefined : counts.data?.merged,
    closed: people === 'review' ? undefined : counts.data?.closed,
    all: people === 'review' ? undefined : counts.data?.all,
  }

  const activeQuery = isOpen ? openQuery : pagedQuery
  const loading = activeQuery.isPending || (people === 'mine' && !viewer.data) || (Boolean(team) && !members.data && !isOpen)

  function toggleTag(tag: string) {
    const next = new Set(activeTags)
    if (next.has(tag))
      next.delete(tag)
    else
      next.add(tag)
    setParam('apps', [...next].join(','))
  }

  return (
    <div className={css({ minH: '100dvh', bg: 'bg.canvas' })}>
      <AppHeader project={project} projectInfo={projectInfo.data} onOpenSettings={() => setSettingsOpen('general')} />

      {!project && (
        <ProjectOnboarding
          onPick={(value) => {
            const ref = parseProjectInput(value)
            if (ref)
              updateSettings({ project: ref })
            return Boolean(ref)
          }}
        />
      )}

      {project && (
        <main className={css({ maxW: '1200px', mx: 'auto', px: { base: '4', md: '8' }, py: '8', display: 'flex', flexDir: 'column', gap: '5' })}>
          <div className={css({ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '4' })}>
            <div>
              <h1 className={css({ fontSize: '2xl', fontWeight: 'semibold', letterSpacing: '-0.01em' })}>Merge requests</h1>
              <p className={css({ fontSize: 'sm', color: 'fg.muted', mt: '1' })}>
                {openQuery.data
                  ? `${openQuery.data.items.length} open${stackCount && isOpen ? `, ${stackCount} stack${stackCount === 1 ? '' : 's'}` : ''}${tagWarnings ? `, ${tagWarnings} stacked tag${tagWarnings === 1 ? '' : 's'} to check` : ''}`
                  : 'Loading…'}
              </p>
            </div>
            <div className={css({ display: 'flex', gap: '2' })}>
              <IconButton
                label="Refresh"
                variant="outline"
                size="md"
                onClick={() => {
                  void openQuery.refetch()
                  void pagedQuery.refetch()
                  void counts.refetch()
                }}
              >
                <RefreshCw className={activeQuery.isFetching ? css({ animation: 'spin' }) : undefined} />
              </IconButton>
              {projectInfo.data && (
                <OpenInGitlab
                  people={teamMembers}
                  filters={{
                    projectWebUrl: projectInfo.data.webUrl,
                    state,
                    authors: people === 'mine'
                      ? (viewer.data ? [viewer.data.username] : [])
                      : team ? (activeMembers.length ? activeMembers : team.members) : [],
                    reviewer: people === 'review' ? viewer.data?.username : undefined,
                    quick,
                    apps: [...activeTags],
                    search: search.trim(),
                  }}
                />
              )}
            </div>
          </div>

          <StateTabs value={state} onChange={value => setParam('state', value === 'opened' ? null : value)} counts={tabCounts} />

          <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', flexWrap: 'wrap' })}>
            <PeopleFilters
              value={people}
              onChange={(value) => {
                setParams((current) => {
                  const next = new URLSearchParams(current)
                  if (value === 'everyone')
                    next.delete('people')
                  else
                    next.set('people', value)
                  next.delete('members')
                  return next
                }, { replace: true })
              }}
              teams={settings.teams}
              counts={peopleCounts}
              onManageTeams={() => setSettingsOpen('teams')}
            />
            <SearchBox value={search} onChange={setSearch} placeholder={isOpen ? 'Filter by title, !iid, author or branch' : 'Search titles'} />
          </div>

          {team && (
            teamMembers.length > 0
              ? (
                  <MemberFilter
                    members={teamMembers}
                    selected={selectedMembers}
                    counts={memberCounts}
                    onChange={next => setParam('members', [...next].join(','))}
                  />
                )
              : members.isPending
                ? null
                : <p className={css({ fontSize: 'xs', color: 'fg.subtle' })}>This team has no members yet.</p>
          )}

          <TagFilters tags={tags} active={activeTags} onToggle={toggleTag} onClear={() => setParam('apps', null)} />

          <section className={cx(card(), css({ borderRadius: 'xl', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }))}>
            {isOpen && (
              <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', px: '2', py: '1.5', borderBottomWidth: '1px', borderColor: 'border.default', bg: 'bg.subtle' })}>
                <QuickFilters value={quick} onChange={value => setParam('quick', value === 'all' ? null : value)} counts={quickCounts} />
                {stackCount > 0 && (
                  <span className={css({ display: { base: 'none', md: 'inline-flex' }, alignItems: 'center', gap: '1.5', pr: '2', fontSize: 'xs', color: 'fg.subtle', '& svg': { w: '3.5', h: '3.5' } })}>
                    <Layers />
                    Stacked merge requests are grouped
                  </span>
                )}
              </div>
            )}
            {activeQuery.error && <div className={css({ p: '6', color: 'danger.fg', fontSize: 'sm', whiteSpace: 'pre-wrap' })}>{activeQuery.error.message}</div>}
            {!activeQuery.error && loading && <SkeletonRows />}
            {!activeQuery.error && !loading && entries.length === 0 && (
              <EmptyState
                title={people === 'review' ? 'Nothing waiting on you' : 'No merge requests match'}
                body={team && !team.members.length ? 'This team has no members yet. Add people in Settings, Teams.' : 'Try another state, team, app or search.'}
              />
            )}
            {!activeQuery.error && !loading && entries.length > 0 && projectInfo.data && (
              <ListBody entries={entries} stackInfo={stackInfo} project={projectInfo.data} jiraBaseUrl={settings.jiraBaseUrl} activeTags={activeTags} onToggleTag={toggleTag} />
            )}
            {!isOpen && pagedQuery.data?.hasMore && (
              <div className={css({ display: 'flex', justifyContent: 'center', p: '3', borderTopWidth: '1px', borderColor: 'border.subtle' })}>
                <Button size="md" variant="ghost" disabled={pagedQuery.isFetching} onClick={() => setLimit(value => value + PAGE_STEP)}>
                  {pagedQuery.isFetching ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </section>
        </main>
      )}

      <SettingsDialog
        open={Boolean(settingsOpen)}
        onOpenChange={open => setSettingsOpen(open ? 'general' : false)}
        initialTab={settingsOpen || 'general'}
        settings={settings}
        onChange={updateSettings}
      />
    </div>
  )
}
