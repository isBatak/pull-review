import type { User } from '../../../shared/types'
import type { ListFilters } from '../../lib/gitlab-list-link'
import { Menu } from '@ark-ui/react/menu'
import { Portal } from '@ark-ui/react/portal'
import { ChevronDown, ExternalLink, Users } from 'lucide-react'
import { css, cx } from 'styled-system/css'
import { card } from 'styled-system/recipes'
import { gitlabListLink } from '../../lib/gitlab-list-link'
import { openExternal } from '../../lib/platform'
import { Avatar } from '../ui/avatar'
import { Button, WithTooltip } from '../ui/button'

function describe(applied: string[], missing: string[]) {
  const parts = [`Opens GitLab with ${applied.join(', ')}.`]
  if (missing.length)
    parts.push(`GitLab can't filter by ${missing.join(', ')}.`)
  return parts.join(' ')
}

const item = css({ display: 'flex', alignItems: 'center', gap: '2.5', h: '9', px: '2', borderRadius: 'md', fontSize: 'sm', cursor: 'pointer', outline: 'none', _highlighted: { bg: 'bg.muted' }, '& > svg': { w: '4', h: '4', color: 'fg.subtle' } })

export function OpenInGitlab({ filters, people }: { filters: ListFilters, people: User[] }) {
  if (filters.authors.length <= 1) {
    const link = gitlabListLink(filters)
    return (
      <WithTooltip label={describe(link.applied, link.missing)}>
        <Button size="md" onClick={() => openExternal(link.url)}>
          <ExternalLink />
          Open in GitLab
        </Button>
      </WithTooltip>
    )
  }

  const everyone = gitlabListLink(filters, null)
  const byUsername = new Map(people.map(person => [person.username, person]))
  const otherMissing = gitlabListLink(filters).missing.filter(entry => !entry.endsWith('authors at once'))

  return (
    <Menu.Root positioning={{ placement: 'bottom-end' }} onSelect={details => openExternal(details.value)}>
      <Menu.Trigger asChild>
        <Button size="md">
          <ExternalLink />
          Open in GitLab
          <ChevronDown />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner className={css({ zIndex: 'popover' })}>
          <Menu.Content className={cx(card({ floating: true }), css({ minW: '64', maxH: '96', overflowY: 'auto', p: '1', outline: 'none' }))}>
            <p className={css({ px: '2', pt: '1.5', pb: '2', fontSize: 'xs', color: 'fg.muted', maxW: '72', lineHeight: '1.5' })}>
              GitLab can filter by one author at a time.
              {otherMissing.length > 0 && ` It also can't filter by ${otherMissing.join(', ')}.`}
            </p>
            <Menu.Item value={everyone.url} className={item}>
              <Users />
              <span>All authors</span>
            </Menu.Item>
            <Menu.Separator className={css({ my: '1', borderTopWidth: '1px', borderColor: 'border.subtle' })} />
            {filters.authors.map((username) => {
              const person = byUsername.get(username)
              return (
                <Menu.Item key={username} value={gitlabListLink(filters, username).url} className={item}>
                  {person ? <Avatar user={person} size={20} /> : <Users />}
                  <span className={css({ flex: '1', truncate: true })}>{person?.name ?? username}</span>
                </Menu.Item>
              )
            })}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
