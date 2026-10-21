import type { MrRef } from '../../shared/types'
import { CircleAlert, FolderGit2, Loader2 } from 'lucide-react'
import { css, cx } from 'styled-system/css'
import { ApiError } from '../lib/api'
import { useLocalCheckout, useLocalRepo } from '../lib/local-repos'
import { WithTooltip } from './ui/button'

const chip = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  w: '5',
  h: '5',
  borderRadius: 'sm',
  cursor: 'pointer',
  '& svg': { w: '3.5', h: '3.5' },
})

const okTone = css({ color: 'fg.muted', bg: 'bg.muted' })
const warnTone = css({ color: 'warning.fg', bg: 'warning.subtle' })

function folderName(path: string) {
  const [parent = '', name = ''] = path.split('/').slice(-2)
  return parent.endsWith('-mrs') ? `${parent}/${name}` : name
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
      <WithTooltip label={`Switching ${name}…`}>
        <span role="status" aria-label={`Switching ${name}`} className={cx(chip, okTone, css({ cursor: 'default' }))}>
          <Loader2 className={css({ animation: 'spin' })} />
        </span>
      </WithTooltip>
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
  const message = failed
    ? failed.message
    : data?.message ?? `${data?.path} is on the merge request's branch. Opening files in your editor uses it.`
  const hint = data?.status === 'main-checkout' ? 'Click to open Settings.' : ok ? null : 'Click to try again.'
  const otherPath = data?.otherPath ?? null

  return (
    <WithTooltip
      contentStyle={{ maxW: '80' }}
      label={(
        <span className={css({ display: 'flex', flexDir: 'column', gap: '1.5', py: '0.5' })}>
          <strong className={css({ fontFamily: 'mono', wordBreak: 'break-all' })}>{label}</strong>
          <span>{message}</span>
          {otherPath && (
            <span className={css({ display: 'flex', flexDir: 'column', gap: '0.5' })}>
              <span className={css({ opacity: 0.7 })}>Checked out in</span>
              <code className={css({ fontFamily: 'mono', wordBreak: 'break-all' })}>{otherPath}</code>
            </span>
          )}
          {hint && <span className={css({ opacity: 0.7 })}>{hint}</span>}
        </span>
      )}
    >
      <button
        type="button"
        aria-label={[label, message, otherPath && `Checked out in ${otherPath}`, hint].filter(Boolean).join('. ')}
        onClick={() => (data?.status === 'main-checkout' ? onSetUp() : void checkout.refetch())}
        className={cx(chip, ok ? okTone : warnTone)}
      >
        {ok ? <FolderGit2 /> : <CircleAlert />}
      </button>
    </WithTooltip>
  )
}
