import type { CSSProperties } from 'react'
import type { User } from '../../../shared/types'
import { Avatar as ArkAvatar } from '@ark-ui/react/avatar'
import { avatar } from 'styled-system/recipes'

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')
}

export function Avatar({ user, size = 20 }: { user: User, size?: number }) {
  const classes = avatar()
  return (
    <ArkAvatar.Root className={classes.root} style={{ width: size, height: size, fontSize: size * 0.42, '--avatar-size': `${size}px` } as CSSProperties} title={user.name}>
      <ArkAvatar.Fallback>{initials(user.name)}</ArkAvatar.Fallback>
      {user.avatarUrl && <ArkAvatar.Image src={user.avatarUrl} alt={user.name} className={classes.image} />}
    </ArkAvatar.Root>
  )
}
