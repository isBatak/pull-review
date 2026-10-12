import type { MrRef } from '../../shared/types'
import { CircleAlert, FolderGit2, Loader2 } from 'lucide-react'
import { css, cx } from 'styled-system/css'
import { ApiError } from '../lib/api'
import { useLocalCheckout, useLocalRepo } from '../lib/local-repos'
import { WithTooltip } from './ui/button'

const chip = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  maxW: '72',
  h: '5',
  px: '1.5',
  fontSize: '2xs',
  fontFamily: 'mono',
  borderRadius: 'sm',
  cursor: 'pointer',
  '& svg': { w: '3', h: '3', flexShrink: 0 },
})

const okTone = css({ color: 'fg.muted', bg: 'bg.muted' })
const warnTone = css({ color: 'warning.fg', bg: 'warning.subtle' })

function folderName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function LocalCheckoutChip({ mrRef, headSha, onSetUp }: { mrRef: MrRef, headSha: string, onSetUp: () => void }) {
  const localRepo = useLocalRepo(mrRef)
  const checkout = useLocalCheckout(mrRef, localRepo.path, headSha)
  if (!localRepo.path)
    return null
  if (checkout.error instanceof ApiError && checkout.error.status === 404)
    return null

  const name = folderName(localRepo.path)
  if (checkout.isFetching) {
    return (
      <span className={cx(chip, okTone, css({ cursor: 'default' }))}>
        <Loader2 className={css({ animation: 'spin' })} />
        <span className={css({ truncate: true, color: 'fg.subtle' })}>Switching {name}…</span>
      </span>
    )
  }

  const data = checkout.data
  const failed = checkout.error ?? null
  const ok = data?.status === 'ready'
  const label = failed
    ? `${name}: could not switch`
    : data?.status === 'ready'
      ? `${name} on ${data.branch}`
      : data?.status === 'detached'
        ? `${name} at ${data.sha.slice(0, 8)}`
        : data?.status === 'dirty'
          ? `${name} not switched`
          : 'Set up a worktree'
  const tooltip = failed
    ? `${failed.message} Click to try again.`
    : data?.status === 'main-checkout'
      ? `${data.message} Click to open Settings.`
      : data?.status === 'dirty'
        ? `${data.message} Click to try again.`
        : data?.message ?? `${data?.path} is on the merge request's branch. Opening files in your editor uses it.`

  return (
    <WithTooltip label={tooltip}>
      <button
        type="button"
        onClick={() => (data?.status === 'main-checkout' ? onSetUp() : void checkout.refetch())}
        className={cx(chip, ok ? okTone : warnTone)}
      >
        {ok ? <FolderGit2 /> : <CircleAlert />}
        <span className={css({ truncate: true })}>{label}</span>
      </button>
    </WithTooltip>
  )
}
