import type { User } from '../../../shared/types'
import { Menu } from '@ark-ui/react/menu'
import { Portal } from '@ark-ui/react/portal'
import { Check, ChevronDown } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { card } from 'styled-system/recipes'
import { Avatar } from '../ui/avatar'
import { WithTooltip } from '../ui/button'

const AVATAR_SIZE = 28
const ITEM_WIDTH = AVATAR_SIZE + 8
const MORE_WIDTH = 64
const CLEAR_WIDTH = 56

interface MemberFilterProps {
  members: User[]
  selected: Set<string>
  counts?: Map<string, number>
  onChange: (selected: Set<string>) => void
}

function useAvailableWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element)
      return
    const observer = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width ?? 0))
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export function MemberFilter({ members, selected, counts, onChange }: MemberFilterProps) {
  const [ref, width] = useAvailableWidth<HTMLDivElement>()

  const ordered = useMemo(() => [...members].sort((a, b) =>
    (counts ? (counts.get(b.username) ?? 0) - (counts.get(a.username) ?? 0) : 0) || a.name.localeCompare(b.name)), [members, counts])

  const reserved = (selected.size ? CLEAR_WIDTH : 0)
  const fitsAll = ordered.length * ITEM_WIDTH + reserved <= width
  const visibleCount = fitsAll ? ordered.length : Math.max(0, Math.floor((width - reserved - MORE_WIDTH) / ITEM_WIDTH))
  const visible = ordered.slice(0, visibleCount)
  const overflow = ordered.slice(visibleCount)
  const selectedInOverflow = overflow.filter(member => selected.has(member.username)).length

  function toggle(username: string, include: boolean) {
    const next = new Set(selected)
    if (include)
      next.add(username)
    else
      next.delete(username)
    onChange(next)
  }

  return (
    <div ref={ref} className={css({ display: 'flex', alignItems: 'center', gap: '2', w: 'full', minW: '0', minH: '9', px: '0.5' })} role="group" aria-label="Filter by team member">
      {width > 0 && visible.map((member) => {
        const active = selected.has(member.username)
        const count = counts?.get(member.username)
        return (
          <WithTooltip key={member.id} label={`${member.name}${count !== undefined ? `, ${count} open` : ''}`}>
            <button
              type="button"
              aria-pressed={active}
              aria-label={member.name}
              onClick={() => toggle(member.username, !active)}
              className={css({
                position: 'relative',
                flexShrink: 0,
                display: 'inline-flex',
                borderRadius: 'full',
                cursor: 'pointer',
                outline: '2px solid transparent',
                outlineOffset: '1px',
                transition: 'opacity 120ms, outline-color 120ms',
                _hover: { opacity: 1 },
                '&[aria-pressed=true]': { outlineColor: 'accent.default' },
                _focusVisible: { outlineColor: 'accent.default' },
              })}
              style={{ opacity: selected.size && !active ? 0.45 : count === 0 ? 0.6 : 1 }}
            >
              <Avatar user={member} size={AVATAR_SIZE} />
              {count !== undefined && count > 0 && (
                <span className={css({ position: 'absolute', right: '-1.5', bottom: '-1', minW: '4', h: '4', px: '1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'full', bg: 'fg.default', color: 'bg.surface', fontSize: '0.625rem', fontWeight: 'bold', lineHeight: '1', borderWidth: '1.5px', borderColor: 'bg.canvas' })}>
                  {count}
                </span>
              )}
            </button>
          </WithTooltip>
        )
      })}

      {width > 0 && overflow.length > 0 && (
        <Menu.Root closeOnSelect={false} positioning={{ placement: 'bottom-start' }}>
          <Menu.Trigger
            className={cx(css({
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '1',
              h: '7',
              px: '2',
              borderRadius: 'full',
              borderWidth: '1px',
              borderColor: 'border.default',
              bg: 'bg.surface',
              fontSize: 'xs',
              fontWeight: 'semibold',
              color: 'fg.muted',
              cursor: 'pointer',
              _hover: { color: 'fg.default', borderColor: 'border.strong' },
              '& svg': { w: '3.5', h: '3.5' },
            }))}
            style={selectedInOverflow ? { borderColor: 'var(--colors-accent-default)', color: 'var(--colors-accent-fg)' } : undefined}
          >
            +
            {overflow.length}
            {selectedInOverflow > 0 && ` · ${selectedInOverflow} on`}
            <ChevronDown />
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner className={css({ zIndex: 'popover' })}>
              <Menu.Content className={cx(card({ floating: true }), css({ minW: '60', maxH: '80', overflowY: 'auto', p: '1', outline: 'none' }))}>
                {overflow.map((member) => {
                  const count = counts?.get(member.username)
                  return (
                    <Menu.CheckboxItem
                      key={member.id}
                      value={member.username}
                      checked={selected.has(member.username)}
                      onCheckedChange={checked => toggle(member.username, checked)}
                      className={css({ display: 'flex', alignItems: 'center', gap: '2.5', h: '9', px: '2', borderRadius: 'md', fontSize: 'sm', cursor: 'pointer', outline: 'none', _highlighted: { bg: 'bg.muted' } })}
                    >
                      <span className={css({ w: '4', display: 'inline-flex', color: 'accent.fg', '& svg': { w: '4', h: '4' } })}>
                        <Menu.ItemIndicator><Check /></Menu.ItemIndicator>
                      </span>
                      <Avatar user={member} size={22} />
                      <Menu.ItemText className={css({ flex: '1', truncate: true })}>{member.name}</Menu.ItemText>
                      {count !== undefined && <span className={css({ fontSize: 'xs', color: 'fg.subtle', fontVariantNumeric: 'tabular-nums' })}>{count}</span>}
                    </Menu.CheckboxItem>
                  )
                })}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      )}

      {selected.size > 0 && (
        <button type="button" onClick={() => onChange(new Set())} className={css({ flexShrink: 0, fontSize: 'xs', color: 'fg.muted', cursor: 'pointer', px: '1', _hover: { color: 'fg.default', textDecoration: 'underline' } })}>
          Clear
        </button>
      )}
    </div>
  )
}
