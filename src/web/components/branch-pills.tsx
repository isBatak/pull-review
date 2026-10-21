import { MiddleTruncate } from '@pierre/truncate/react'
import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { css } from 'styled-system/css'
import { copyText } from '../lib/platform'
import { WithTooltip } from './ui/button'

const COPIED_RESET_MS = 1500

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    if (!copied)
      return
    const timer = setTimeout(() => setCopied(null), COPIED_RESET_MS)
    return () => clearTimeout(timer)
  }, [copied])
  return {
    copied,
    copy: (text: string) => void copyText(text).then(() => setCopied(text)).catch(() => setCopied(null)),
  }
}

const pill = css({
  display: 'inline-flex',
  alignItems: 'center',
  minW: '0',
  maxW: '20rem',
  h: '5',
  px: '1.5',
  borderRadius: 'md',
  fontFamily: 'mono',
  fontSize: 'xs',
  color: 'accent.fg',
  '--branch-pill-bg': 'color-mix(in srgb, token(colors.accent.default) 14%, token(colors.bg.surface))',
  '--truncate-marker-background-color': 'var(--branch-pill-bg)',
  bg: 'var(--branch-pill-bg)',
  cursor: 'copy',
  transition: 'filter 120ms',
  _hover: { filter: 'brightness(0.96)' },
  _dark: { _hover: { filter: 'brightness(1.15)' } },
})

function BranchPill({ name, copied, onCopy }: { name: string, copied: boolean, onCopy: (name: string) => void }) {
  return (
    <WithTooltip label={copied ? 'Copied' : `Copy ${name}`}>
      <button type="button" className={pill} onClick={() => onCopy(name)} aria-label={`Copy branch ${name}`}>
        <span className={css({ display: 'flex', minW: '0', w: 'full', overflow: 'hidden' })}>
          <MiddleTruncate split="center" priority="equal" minimumLength={12}>{name}</MiddleTruncate>
        </span>
      </button>
    </WithTooltip>
  )
}

export function BranchPills({ source, target }: { source: string, target: string }) {
  const { copied, copy } = useCopy()
  const sourceCopied = copied === source

  return (
    <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', minW: '0', color: 'fg.muted' })}>
      into
      <BranchPill name={target} copied={copied === target} onCopy={copy} />
      from
      <BranchPill name={source} copied={sourceCopied} onCopy={copy} />
      <WithTooltip label={sourceCopied ? 'Copied' : 'Copy source branch name'}>
        <button
          type="button"
          onClick={() => copy(source)}
          aria-label="Copy source branch name"
          className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, w: '6', h: '6', borderRadius: 'md', cursor: 'pointer', color: sourceCopied ? 'success.fg' : 'fg.muted', _hover: { bg: 'bg.muted', color: sourceCopied ? 'success.fg' : 'fg.default' }, '& svg': { w: '3.5!', h: '3.5!' } })}
        >
          {sourceCopied ? <Check /> : <Copy />}
        </button>
      </WithTooltip>
    </span>
  )
}
