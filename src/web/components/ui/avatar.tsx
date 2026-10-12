import type { User } from '../../../shared/types'
import { Avatar as ArkAvatar } from '@ark-ui/react/avatar'
import { css } from 'styled-system/css'

const root = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: 'full',
  overflow: 'hidden',
  bg: 'bg.emphasized',
  color: 'fg.muted',
  fontWeight: 'semibold',
  userSelect: 'none',
})

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')
}

export function Avatar({ user, size = 20 }: { user: User, size?: number }) {
  return (
    <ArkAvatar.Root className={root} style={{ width: size, height: size, fontSize: size * 0.42 }} title={user.name}>
      <ArkAvatar.Fallback>{initials(user.name)}</ArkAvatar.Fallback>
      {user.avatarUrl && <ArkAvatar.Image src={user.avatarUrl} alt={user.name} className={css({ w: 'full', h: 'full', objectFit: 'cover' })} />}
    </ArkAvatar.Root>
  )
}
