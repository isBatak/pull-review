import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { css, cx } from 'styled-system/css'
import { api } from '../../lib/api'
import { useRefreshSelfImprove, useSelfImproveState } from '../../lib/self-improve'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'

const fieldLabel = css({ display: 'block', fontSize: 'xs', fontWeight: 'semibold', mb: '1.5' })
const fieldHint = css({ fontSize: 'xs', color: 'fg.subtle', mt: '1.5' })

export function LocalChangesSetting() {
  const state = useSelfImproveState()
  const refresh = useRefreshSelfImprove()
  const [error, setError] = useState<string | null>(null)
  if (!state.data)
    return null
  const { active, overlayDir } = state.data

  async function toggle(on: boolean) {
    setError(null)
    try {
      await api.setLocalChangesActive(on)
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
    await refresh()
  }

  return (
    <div>
      <span className={fieldLabel}>Local changes</span>
      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3' })}>
        <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '2', fontSize: 'sm', opacity: overlayDir ? 1 : 0.5 })}>
          <Checkbox checked={active} onCheckedChange={on => void toggle(on)} label="Use local changes" />
          <span className={css({ cursor: overlayDir ? 'pointer' : 'default', userSelect: 'none' })} onClick={() => overlayDir && void toggle(!active)}>Use local changes</span>
        </span>
        <Button size="sm" onClick={() => void api.openOverlayFolder()}>
          <FolderOpen />
          Open folder
        </Button>
      </div>
      <p className={cx(fieldHint, error && css({ color: 'danger.fg' }))}>
        {error ?? (overlayDir
          ? 'Changes Claude made from your feedback. Turn them off to run the app as it shipped. Holding ⌥ while the app opens skips them once.'
          : 'Claude keeps the changes it makes from your feedback here. There are none for this version yet.')}
      </p>
    </div>
  )
}
