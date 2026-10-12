import type { AppSettings, Team } from '../../lib/settings'
import { Dialog } from '@ark-ui/react/dialog'
import { Portal } from '@ark-ui/react/portal'
import { Tabs } from '@ark-ui/react/tabs'
import { Check, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { useProjectMembers } from '../../hooks/use-project'
import { api } from '../../lib/api'
import { teamStyle } from '../../lib/mr-display'
import { createTeamId, parseProjectInput, TEAM_COLORS } from '../../lib/settings'
import { Avatar } from '../ui/avatar'
import { Button, IconButton } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Segmented } from '../ui/segmented'
import { AiTab } from './ai-tab'
import { BackupTab } from './backup-tab'
import { BundleTab } from './bundle-tab'
import { CategoriesTab } from './categories-tab'
import { LocalRepos } from './local-repos'

const input = css({
  w: 'full',
  h: '9',
  px: '3',
  fontSize: 'sm',
  bg: 'bg.surface',
  color: 'fg.default',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  outline: 'none',
  _focus: { borderColor: 'accent.default', boxShadow: '0 0 0 3px color-mix(in srgb, var(--colors-accent-default) 18%, transparent)' },
  _placeholder: { color: 'fg.subtle' },
})

const fieldLabel = css({ display: 'block', fontSize: 'xs', fontWeight: 'semibold', mb: '1.5' })
const fieldHint = css({ fontSize: 'xs', color: 'fg.subtle', mt: '1.5' })

const tabTrigger = css({
  h: '9',
  px: '1',
  mr: '4',
  fontSize: 'sm',
  fontWeight: 'medium',
  color: 'fg.muted',
  borderBottomWidth: '2px',
  borderColor: 'transparent',
  cursor: 'pointer',
  _selected: { color: 'fg.default', borderColor: 'accent.default' },
})

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  initialTab?: 'general' | 'teams' | 'categories' | 'bundle' | 'ai' | 'backup'
}

function GeneralTab({ settings, onChange }: Pick<SettingsDialogProps, 'settings' | 'onChange'>) {
  const [projectInput, setProjectInput] = useState(settings.project ? `https://${settings.project.host}/${settings.project.project}` : '')
  const [jira, setJira] = useState(settings.jiraBaseUrl)
  const [status, setStatus] = useState<{ kind: 'idle' | 'checking' | 'ok' | 'error', message?: string }>({ kind: 'idle' })

  async function applyProject() {
    const ref = parseProjectInput(projectInput)
    if (!ref) {
      setStatus({ kind: 'error', message: 'Use a project link like https://gitlab.com/group/project' })
      return
    }
    setStatus({ kind: 'checking' })
    try {
      const info = await api.projectInfo(ref)
      onChange({ project: ref })
      setStatus({ kind: 'ok', message: `Connected to ${info.pathWithNamespace}. Default branch is ${info.defaultBranch}.` })
    }
    catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '6' })}>
      <div>
        <label className={fieldLabel} htmlFor="settings-project">GitLab project</label>
        <form
          className={css({ display: 'flex', gap: '2' })}
          onSubmit={(event) => {
            event.preventDefault()
            void applyProject()
          }}
        >
          <input id="settings-project" className={input} value={projectInput} onChange={event => setProjectInput(event.target.value)} placeholder="https://gitlab.tradelocker.com/tradelocker/tradelocker" />
          <Button type="submit" variant="solid" size="md" disabled={status.kind === 'checking'}>{status.kind === 'checking' ? 'Checking…' : 'Use project'}</Button>
        </form>
        <p className={cx(fieldHint, css({ color: status.kind === 'error' ? 'danger.fg' : status.kind === 'ok' ? 'success.fg' : 'fg.subtle' }))}>
          {status.message ?? 'The merge request list and team members come from this project.'}
        </p>
      </div>
      <div>
        <span className={fieldLabel}>File groups in a review</span>
        <Segmented
          label="File groups in a review"
          value={settings.groupLayout}
          onChange={groupLayout => onChange({ groupLayout })}
          items={[
            { value: 'sidebar', label: 'Sidebar' },
            { value: 'tabs', label: 'Tabs above the code' },
          ]}
        />
        <p className={fieldHint}>
          {settings.groupLayout === 'sidebar'
            ? 'Code, Tests, Docs and other groups appear as sections in the file sidebar.'
            : 'Groups appear as a row of tabs above the code. The sidebar shows only the files in the selected group.'}
        </p>
      </div>
      <LocalRepos settings={settings} onChange={onChange} />
      <div>
        <label className={fieldLabel} htmlFor="settings-jira">Jira site</label>
        <input
          id="settings-jira"
          className={input}
          value={jira}
          onChange={event => setJira(event.target.value)}
          onBlur={() => onChange({ jiraBaseUrl: jira.trim() || 'https://tradelocker.atlassian.net' })}
          placeholder="https://tradelocker.atlassian.net"
        />
        <p className={fieldHint}>Keys like [EN-5655] in titles link to this site.</p>
      </div>
    </div>
  )
}

function TeamEditor({ team, settings, onChange }: { team: Team } & Pick<SettingsDialogProps, 'settings' | 'onChange'>) {
  const members = useProjectMembers(settings.project)
  const [query, setQuery] = useState('')
  const selected = new Set(team.members)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = members.data ?? []
    const matches = needle ? list.filter(user => user.name.toLowerCase().includes(needle) || user.username.toLowerCase().includes(needle)) : list
    return [...matches].sort((a, b) => Number(selected.has(b.username)) - Number(selected.has(a.username)) || a.name.localeCompare(b.name))
  }, [members.data, query, team.members])

  function patchTeam(patch: Partial<Team>) {
    onChange({ teams: settings.teams.map(item => item.id === team.id ? { ...item, ...patch } : item) })
  }

  function toggleMember(username: string, include: boolean) {
    const next = new Set(team.members)
    if (include)
      next.add(username)
    else
      next.delete(username)
    patchTeam({ members: [...next] })
  }

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '4', minH: '0', h: 'full' })}>
      <div className={css({ display: 'flex', gap: '3', alignItems: 'flex-end' })}>
        <div className={css({ flex: '1' })}>
          <label className={fieldLabel} htmlFor="team-name">Team name</label>
          <input id="team-name" className={input} value={team.name} onChange={event => patchTeam({ name: event.target.value })} placeholder="Frontend" />
        </div>
        <IconButton label="Delete team" size="md" variant="outline" onClick={() => onChange({ teams: settings.teams.filter(item => item.id !== team.id) })}>
          <Trash2 />
        </IconButton>
      </div>
      <div>
        <span className={fieldLabel}>Color</span>
        <div className={css({ display: 'flex', gap: '2' })} role="radiogroup" aria-label="Team color">
          {TEAM_COLORS.map(color => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={team.color === color}
              aria-label={color}
              onClick={() => patchTeam({ color })}
              className={css({ w: '6', h: '6', borderRadius: 'full', bg: 'var(--hue-solid)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', outlineOffset: '2px', '&[aria-checked=true]': { outline: '2px solid var(--hue-solid)' }, '& svg': { w: '3.5', h: '3.5' } })}
              style={teamStyle(color)}
            >
              {team.color === color && <Check />}
            </button>
          ))}
        </div>
      </div>
      <div className={css({ display: 'flex', flexDir: 'column', minH: '0', flex: '1' })}>
        <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: '1.5' })}>
          <span className={fieldLabel}>Members</span>
          <span className={css({ fontSize: 'xs', color: 'fg.subtle' })}>
            {team.members.length}
            {' selected'}
          </span>
        </div>
        <label className={css({ display: 'flex', alignItems: 'center', gap: '2', h: '9', px: '3', mb: '2', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', _focusWithin: { borderColor: 'accent.default' }, '& svg': { w: '4', h: '4', color: 'fg.subtle' } })}>
          <Search />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search people" className={css({ flex: '1', bg: 'transparent', outline: 'none', fontSize: 'sm' })} />
        </label>
        <div className={css({ flex: '1', minH: '0', overflowY: 'auto', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md' })}>
          {members.isPending && <div className={css({ p: '4', fontSize: 'sm', color: 'fg.muted' })}>Loading people…</div>}
          {members.error && <div className={css({ p: '4', fontSize: 'sm', color: 'danger.fg' })}>{members.error.message}</div>}
          {filtered.map(user => (
            <div
              key={user.id}
              role="presentation"
              onClick={() => toggleMember(user.username, !selected.has(user.username))}
              className={css({ display: 'flex', alignItems: 'center', gap: '3', px: '3', h: '11', cursor: 'pointer', _hover: { bg: 'bg.subtle' }, '& + &': { borderTopWidth: '1px', borderColor: 'border.subtle' } })}
            >
              <Checkbox checked={selected.has(user.username)} onCheckedChange={checked => toggleMember(user.username, checked)} label={`Add ${user.name}`} />
              <Avatar user={user} size={24} />
              <span className={css({ display: 'flex', flexDir: 'column', minW: '0', lineHeight: '1.25' })}>
                <span className={css({ fontSize: 'sm', fontWeight: 'medium', truncate: true })}>{user.name}</span>
                <span className={css({ fontSize: 'xs', color: 'fg.subtle', truncate: true })}>
                  @
                  {user.username}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TeamsTab({ settings, onChange }: Pick<SettingsDialogProps, 'settings' | 'onChange'>) {
  const [activeId, setActiveId] = useState<string | null>(settings.teams[0]?.id ?? null)
  const active = settings.teams.find(team => team.id === activeId) ?? settings.teams[0]

  function addTeam() {
    const team: Team = { id: createTeamId(), name: 'New team', color: TEAM_COLORS[settings.teams.length % TEAM_COLORS.length]!, members: [] }
    onChange({ teams: [...settings.teams, team] })
    setActiveId(team.id)
  }

  if (!settings.project)
    return <p className={css({ fontSize: 'sm', color: 'fg.muted' })}>Choose a GitLab project in General first. Team members are loaded from it.</p>

  return (
    <div className={css({ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '5', h: '440px' })}>
      <div className={css({ display: 'flex', flexDir: 'column', gap: '1', minH: '0', overflowY: 'auto' })}>
        {settings.teams.map(team => (
          <button
            key={team.id}
            type="button"
            onClick={() => setActiveId(team.id)}
            data-active={active?.id === team.id || undefined}
            className={css({ display: 'flex', alignItems: 'center', gap: '2', px: '2.5', h: '9', borderRadius: 'md', fontSize: 'sm', textAlign: 'left', cursor: 'pointer', color: 'fg.muted', _hover: { bg: 'bg.muted' }, '&[data-active]': { bg: 'bg.muted', color: 'fg.default', fontWeight: 'medium' } })}
            style={teamStyle(team.color)}
          >
            <span className={css({ w: '2.5', h: '2.5', borderRadius: 'full', bg: 'var(--hue-solid)', flexShrink: 0 })} />
            <span className={css({ flex: '1', truncate: true })}>{team.name || 'Untitled'}</span>
            <span className={css({ fontSize: 'xs', color: 'fg.subtle' })}>{team.members.length}</span>
          </button>
        ))}
        <Button variant="ghost" size="md" onClick={addTeam} className={css({ justifyContent: 'flex-start', px: '2.5' })}>
          <Plus />
          New team
        </Button>
      </div>
      {active
        ? <TeamEditor key={active.id} team={active} settings={settings} onChange={onChange} />
        : (
            <div className={css({ display: 'flex', flexDir: 'column', alignItems: 'center', justifyContent: 'center', gap: '3', textAlign: 'center', color: 'fg.muted', fontSize: 'sm', borderWidth: '1px', borderStyle: 'dashed', borderColor: 'border.strong', borderRadius: 'lg', '& svg': { w: '6', h: '6', color: 'fg.subtle' } })}>
              <Users />
              <p>Group people into teams, like Frontend or Experiments, to filter merge requests by team.</p>
              <Button variant="solid" size="md" onClick={addTeam}>
                <Plus />
                Create a team
              </Button>
            </div>
          )}
    </div>
  )
}

export function SettingsDialog({ open, onOpenChange, settings, onChange, initialTab = 'general' }: SettingsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={details => onOpenChange(details.open)} lazyMount unmountOnExit>
      <Portal>
        <Dialog.Backdrop className={css({ position: 'fixed', inset: '0', zIndex: 'overlay', bg: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' })} />
        <Dialog.Positioner className={css({ position: 'fixed', inset: '0', zIndex: 'modal', display: 'flex', alignItems: 'center', justifyContent: 'center', p: '6' })}>
          <Dialog.Content className={css({ w: 'full', maxW: '920px', maxH: 'calc(100dvh - 48px)', overflowY: 'auto', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'xl', boxShadow: 'popover', p: '6', outline: 'none' })}>
            <div className={css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: '4' })}>
              <div>
                <Dialog.Title className={css({ fontSize: 'lg', fontWeight: 'semibold' })}>Settings</Dialog.Title>
                <Dialog.Description className={css({ fontSize: 'sm', color: 'fg.muted' })}>Saved on this device.</Dialog.Description>
              </div>
              <Dialog.CloseTrigger asChild>
                <IconButton label="Close settings"><X /></IconButton>
              </Dialog.CloseTrigger>
            </div>
            <Tabs.Root defaultValue={initialTab} lazyMount unmountOnExit>
              <Tabs.List className={css({ display: 'flex', borderBottomWidth: '1px', borderColor: 'border.default', mb: '5' })}>
                <Tabs.Trigger value="general" className={tabTrigger}>General</Tabs.Trigger>
                <Tabs.Trigger value="teams" className={tabTrigger}>Teams</Tabs.Trigger>
                <Tabs.Trigger value="categories" className={tabTrigger}>Categories</Tabs.Trigger>
                <Tabs.Trigger value="bundle" className={tabTrigger}>Bundle</Tabs.Trigger>
                <Tabs.Trigger value="ai" className={tabTrigger}>AI</Tabs.Trigger>
                <Tabs.Trigger value="backup" className={tabTrigger}>Backup</Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="general"><GeneralTab settings={settings} onChange={onChange} /></Tabs.Content>
              <Tabs.Content value="teams"><TeamsTab settings={settings} onChange={onChange} /></Tabs.Content>
              <Tabs.Content value="categories"><CategoriesTab settings={settings} onChange={onChange} /></Tabs.Content>
              <Tabs.Content value="bundle"><BundleTab settings={settings} onChange={onChange} /></Tabs.Content>
              <Tabs.Content value="ai"><AiTab settings={settings} onChange={onChange} /></Tabs.Content>
              <Tabs.Content value="backup"><BackupTab settings={settings} onReplace={onChange} /></Tabs.Content>
            </Tabs.Root>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
