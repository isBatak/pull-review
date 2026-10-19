import type { Qualifier } from '../../lib/mr-query'
import type { Suggestion, SuggestionSource } from '../../lib/query-suggest'
import { Boxes, CircleCheck, CircleDot, CircleHelp, Eye, GitBranch, GitMerge, ListChecks, Search, Tag, User as UserIcon, X } from 'lucide-react'
import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { css } from 'styled-system/css'
import { applySuggestion, suggest } from '../../lib/query-suggest'
import { Avatar } from '../ui/avatar'
import { WithTooltip } from '../ui/button'

const SEARCH_HELP: [string, string][] = [
  ['author:ana', 'Written by ana'],
  ['reviewer:@me', 'You are a reviewer'],
  ['approved-by:@me', 'You approved it'],
  ['app:web', 'Has the [WEB] tag'],
  ['label:bug', 'Has the bug label'],
  ['branch:fix', 'Source branch has "fix"'],
  ['target:develop', 'Targets develop'],
  ['is:draft', 'Also approved, ready, attention, review'],
  ['has:conflicts', 'Also reviewer'],
]

const SEARCH_TIPS: [string, string][] = [
  ['@me', 'Means you'],
  ['-approved-by:@me', 'A leading - excludes'],
  ['author:ana,bo', 'Commas mean "or"'],
]

const helpStyle = css.raw({ maxW: 'none', px: '3', py: '2.5' })

const QUALIFIER_ICONS: Record<Qualifier, typeof UserIcon> = {
  'author': UserIcon,
  'reviewer': Eye,
  'approved-by': CircleCheck,
  'app': Boxes,
  'label': Tag,
  'branch': GitBranch,
  'target': GitMerge,
  'is': CircleDot,
  'has': ListChecks,
}

const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])

function HelpRows({ rows }: { rows: [string, string][] }) {
  return rows.map(([syntax, meaning]) => (
    <Fragment key={syntax}>
      <code className={css({ fontFamily: 'mono', fontWeight: 'medium', whiteSpace: 'nowrap' })}>{syntax}</code>
      <span className={css({ opacity: 0.7, whiteSpace: 'nowrap' })}>{meaning}</span>
    </Fragment>
  ))
}

function SearchHelp() {
  return (
    <div className={css({ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: '4', rowGap: '1.5', alignItems: 'baseline', textAlign: 'left' })}>
      <HelpRows rows={SEARCH_HELP} />
      <div className={css({ gridColumn: '1 / -1', my: '1', borderTopWidth: '1px', borderColor: 'tooltip.border' })} />
      <HelpRows rows={SEARCH_TIPS} />
    </div>
  )
}

function SuggestionIcon({ item }: { item: Suggestion }) {
  if (item.user)
    return <Avatar user={item.user} size={18} />
  const Icon = QUALIFIER_ICONS[item.qualifier]
  return <Icon />
}

interface SearchBoxProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  source: SuggestionSource
}

export function SearchBox({ value, onChange, placeholder, source }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCursor = useRef<number | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [highlight, setHighlight] = useState(0)
  const listId = useId()
  const list = useMemo(() => (cursor === null ? null : suggest(value, cursor, source)), [value, cursor, source])
  const active = list ? Math.min(highlight, list.items.length - 1) : -1

  useLayoutEffect(() => {
    if (pendingCursor.current === null)
      return
    inputRef.current?.setSelectionRange(pendingCursor.current, pendingCursor.current)
    pendingCursor.current = null
  }, [value])

  function moveCursor(next: number | null) {
    setCursor(next)
    setHighlight(0)
  }

  function accept(item: Suggestion) {
    if (!list)
      return
    const next = applySuggestion(value, list, item)
    pendingCursor.current = next.cursor
    onChange(next.value)
    moveCursor(item.kind === 'qualifier' ? next.cursor : null)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!list)
      return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setHighlight((active + step + list.items.length) % list.items.length)
    }
    else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      accept(list.items[active]!)
    }
    else if (event.key === 'Escape') {
      event.preventDefault()
      moveCursor(null)
    }
  }

  return (
    <div className={css({ position: 'relative', w: 'full' })}>
      <label className={css({ display: 'flex', alignItems: 'center', gap: '2', h: '8', px: '3', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'full', _focusWithin: { borderColor: 'accent.default' }, '& svg': { w: '3.5', h: '3.5', color: 'fg.subtle', flexShrink: 0 } })}>
        <Search />
        <input
          ref={inputRef}
          value={value}
          role="combobox"
          aria-label="Search merge requests"
          aria-expanded={Boolean(list)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={list ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            onChange(event.target.value)
            moveCursor(event.target.selectionStart ?? event.target.value.length)
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(event) => {
            if (cursor !== null && NAVIGATION_KEYS.has(event.key))
              moveCursor(event.currentTarget.selectionStart)
          }}
          onBlur={() => moveCursor(null)}
          placeholder={placeholder}
          className={css({ flex: '1', minW: '0', bg: 'transparent', outline: 'none', fontSize: 'xs' })}
        />
        <WithTooltip label={<SearchHelp />} contentStyle={helpStyle}>
          <span tabIndex={0} aria-label="Search filters help" className={css({ display: 'inline-flex', cursor: 'help', outline: 'none' })}>
            <CircleHelp />
          </span>
        </WithTooltip>
        {value && (
          <button type="button" aria-label="Clear search" onClick={() => onChange('')} className={css({ display: 'inline-flex', cursor: 'pointer', color: 'fg.subtle', _hover: { color: 'fg.default' } })}>
            <X />
          </button>
        )}
      </label>
      {list && (
        <div
          id={listId}
          role="listbox"
          className={css({ position: 'absolute', top: 'calc(100% + 4px)', left: '0', right: '0', zIndex: 'popover', p: '1', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg', boxShadow: 'popover' })}
        >
          {list.items.map((item, index) => (
            <div
              key={`${item.kind}-${item.label}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault()
                accept(item)
              }}
              onMouseEnter={() => setHighlight(index)}
              className={css({ display: 'flex', alignItems: 'center', gap: '2.5', h: '8', px: '2', borderRadius: 'md', fontSize: 'sm', cursor: 'pointer', '&[aria-selected=true]': { bg: 'bg.muted' }, '& > svg': { w: '4', h: '4', color: 'fg.subtle', flexShrink: 0 } })}
            >
              <SuggestionIcon item={item} />
              <span className={css({ fontFamily: item.kind === 'qualifier' ? 'mono' : undefined, fontSize: item.kind === 'qualifier' ? 'xs' : 'sm', whiteSpace: 'nowrap' })}>{item.label}</span>
              {item.detail && <span className={css({ minW: '0', fontSize: 'xs', color: 'fg.subtle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{item.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
