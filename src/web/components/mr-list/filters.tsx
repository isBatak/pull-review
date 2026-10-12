import type { MrListState } from '../../../shared/types'
import type { QuickFilter } from '../../lib/mr-display'
import type { Team } from '../../lib/settings'
import { Eye, Plus, Search, User as UserIcon, Users, X } from 'lucide-react'
import { css, cx } from 'styled-system/css'
import { appTagStyle, teamStyle } from '../../lib/mr-display'
import { UnderlineTabs } from '../ui/underline-tabs'
import { hueChip } from './title-parts'

const STATES: { value: MrListState, label: string }[] = [
  { value: 'opened', label: 'Open' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

export function StateTabs({ value, onChange, counts }: { value: MrListState, onChange: (state: MrListState) => void, counts: Partial<Record<MrListState, number | null>> }) {
  return (
    <UnderlineTabs
      label="Merge request state"
      value={value}
      onChange={onChange}
      tabs={STATES.map(state => ({ ...state, count: counts[state.value] }))}
      className={css({ borderBottomWidth: '1px', borderColor: 'border.default' })}
    />
  )
}

const chip = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1.5',
  h: '8',
  px: '3',
  borderRadius: 'full',
  borderWidth: '1px',
  borderColor: 'border.default',
  bg: 'bg.surface',
  fontSize: 'xs',
  fontWeight: 'medium',
  color: 'fg.muted',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background 120ms, border-color 120ms, color 120ms',
  _hover: { color: 'fg.default', borderColor: 'border.strong' },
  '&[aria-pressed=true]': { color: 'fg.default', bg: 'bg.muted', borderColor: 'border.strong' },
  '& svg': { w: '3.5', h: '3.5' },
})

export type PeopleFilter = 'everyone' | 'mine' | 'review' | `team:${string}`

interface PeopleFiltersProps {
  value: PeopleFilter
  onChange: (value: PeopleFilter) => void
  teams: Team[]
  counts?: Partial<Record<PeopleFilter, number>>
  onManageTeams: () => void
}

export function PeopleFilters({ value, onChange, teams, counts, onManageTeams }: PeopleFiltersProps) {
  const options: { value: PeopleFilter, label: string, icon: React.ReactNode, style?: React.CSSProperties }[] = [
    { value: 'everyone', label: 'Everyone', icon: <Users /> },
    { value: 'mine', label: 'Mine', icon: <UserIcon /> },
    { value: 'review', label: 'Needs my review', icon: <Eye /> },
    ...teams.map(team => ({
      value: `team:${team.id}` as PeopleFilter,
      label: team.name || 'Untitled',
      icon: <span className={css({ w: '2', h: '2', borderRadius: 'full', bg: 'var(--hue-solid)' })} />,
      style: teamStyle(team.color),
    })),
  ]

  return (
    <div className={css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap' })}>
      {options.map(option => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={chip} style={option.style}>
          {option.icon}
          {option.label}
          {counts?.[option.value] !== undefined && <span className={css({ color: 'fg.subtle', fontVariantNumeric: 'tabular-nums' })}>{counts[option.value]}</span>}
        </button>
      ))}
      <button type="button" onClick={onManageTeams} className={cx(chip, css({ borderStyle: 'dashed', color: 'fg.subtle' }))}>
        <Plus />
        {teams.length ? 'Edit teams' : 'Add a team'}
      </button>
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string, onChange: (value: string) => void, placeholder: string }) {
  return (
    <label className={css({ display: 'flex', alignItems: 'center', gap: '2', h: '8', px: '3', w: { base: 'full', md: '72' }, bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'full', _focusWithin: { borderColor: 'accent.default' }, '& svg': { w: '3.5', h: '3.5', color: 'fg.subtle', flexShrink: 0 } })}>
      <Search />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={css({ flex: '1', minW: '0', bg: 'transparent', outline: 'none', fontSize: 'xs' })} />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className={css({ display: 'inline-flex', cursor: 'pointer', color: 'fg.subtle', _hover: { color: 'fg.default' } })}>
          <X />
        </button>
      )}
    </label>
  )
}

export function TagFilters({ tags, active, onToggle, onClear }: { tags: { name: string, count: number }[], active: Set<string>, onToggle: (tag: string) => void, onClear: () => void }) {
  if (!tags.length)
    return null
  return (
    <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', flexWrap: 'wrap' })}>
      <span className={css({ fontSize: 'xs', color: 'fg.subtle', mr: '1' })}>Apps</span>
      {tags.map(tag => (
        <button
          key={tag.name}
          type="button"
          aria-pressed={active.has(tag.name)}
          onClick={() => onToggle(tag.name)}
          className={cx(hueChip, css({
            h: '6',
            px: '2',
            cursor: 'pointer',
            opacity: active.size && !active.has(tag.name) ? 0.45 : 1,
            transition: 'opacity 120ms',
            _hover: { opacity: 1 },
            '&[aria-pressed=true]': { outline: '1.5px solid var(--hue-solid)', outlineOffset: '1px' },
          }))}
          style={appTagStyle(tag.name)}
        >
          {tag.name}
          <span className={css({ fontWeight: 'medium', opacity: 0.7, fontVariantNumeric: 'tabular-nums' })}>{tag.count}</span>
        </button>
      ))}
      {active.size > 0 && (
        <button type="button" onClick={onClear} className={css({ fontSize: 'xs', color: 'fg.muted', cursor: 'pointer', ml: '1', _hover: { color: 'fg.default', textDecoration: 'underline' } })}>
          Clear
        </button>
      )}
    </div>
  )
}

const QUICK_FILTERS: { value: QuickFilter, label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'In review' },
  { value: 'ready', label: 'Ready to merge' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'draft', label: 'Drafts' },
]

export function QuickFilters({ value, onChange, counts }: { value: QuickFilter, onChange: (value: QuickFilter) => void, counts: Record<QuickFilter, number> }) {
  return (
    <div className={css({ display: 'flex', alignItems: 'center', gap: '1', overflowX: 'auto' })}>
      {QUICK_FILTERS.map(filter => (
        <button
          key={filter.value}
          type="button"
          aria-pressed={value === filter.value}
          onClick={() => onChange(filter.value)}
          className={css({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '1.5',
            h: '7',
            px: '2.5',
            borderRadius: 'md',
            fontSize: 'xs',
            fontWeight: 'medium',
            color: 'fg.muted',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            _hover: { color: 'fg.default', bg: 'bg.muted' },
            '&[aria-pressed=true]': { color: 'fg.default', bg: 'bg.muted' },
          })}
        >
          {filter.label}
          <span className={css({ color: 'fg.subtle', fontVariantNumeric: 'tabular-nums' })}>{counts[filter.value]}</span>
        </button>
      ))}
    </div>
  )
}
