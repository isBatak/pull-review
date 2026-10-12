import type { BundleSettings } from '../../../shared/types'
import type { AppSettings } from '../../lib/settings'
import { useState } from 'react'
import { css } from 'styled-system/css'
import { DEFAULT_BUNDLE_SETTINGS } from '../../lib/settings'
import { Button } from '../ui/button'

const input = css({
  w: 'full',
  h: '9',
  px: '3',
  fontSize: 'sm',
  fontFamily: 'mono',
  bg: 'bg.surface',
  color: 'fg.default',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  outline: 'none',
  _focus: { borderColor: 'accent.default', boxShadow: '0 0 0 3px color-mix(in srgb, var(--colors-accent-default) 18%, transparent)' },
})

const fieldLabel = css({ display: 'block', fontSize: 'xs', fontWeight: 'semibold', mb: '1.5' })
const fieldHint = css({ fontSize: 'xs', color: 'fg.subtle', mt: '1.5' })

type TextField = 'jobName' | 'baseBranch' | 'analysisPath' | 'modulesPath'
type NumberField = 'budgetBytes' | 'thresholdBytes'

const TEXT_FIELDS: { key: TextField, label: string, hint: string }[] = [
  { key: 'jobName', label: 'CI job', hint: 'The job that builds the app and keeps the analysis files as artifacts.' },
  { key: 'baseBranch', label: 'Compare with branch', hint: 'The newest successful job on this branch that the merge request is based on.' },
  { key: 'analysisPath', label: 'Route sizes artifact', hint: 'The __bundle_analysis.json file from nextjs-bundle-analysis.' },
  { key: 'modulesPath', label: 'Module stats artifact', hint: 'The client.json file from @next/bundle-analyzer in json mode. Leave empty to skip the treemap.' },
]

const NUMBER_FIELDS: { key: NumberField, label: string, hint: string }[] = [
  { key: 'budgetBytes', label: 'First load budget (bytes)', hint: 'Gzipped first load JS per route. 614400 is 600 KB.' },
  { key: 'thresholdBytes', label: 'Ignore changes under (bytes)', hint: 'Smaller changes count as unchanged.' },
]

export function BundleTab({ settings, onChange }: { settings: AppSettings, onChange: (patch: Partial<AppSettings>) => void }) {
  const [draft, setDraft] = useState<BundleSettings>(settings.bundle)

  function commit(next: BundleSettings) {
    setDraft(next)
    onChange({ bundle: next })
  }

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '5' })}>
      <p className={css({ fontSize: 'sm', color: 'fg.muted' })}>
        The Bundle tab of a review downloads these artifacts from the merge request pipeline and from the base branch, and compares them.
      </p>
      {TEXT_FIELDS.map(field => (
        <div key={field.key}>
          <label className={fieldLabel} htmlFor={`bundle-${field.key}`}>{field.label}</label>
          <input
            id={`bundle-${field.key}`}
            className={input}
            value={draft[field.key]}
            onChange={event => setDraft({ ...draft, [field.key]: event.target.value })}
            onBlur={() => commit({ ...draft, [field.key]: draft[field.key].trim() || (field.key === 'modulesPath' ? '' : DEFAULT_BUNDLE_SETTINGS[field.key]) })}
          />
          <p className={fieldHint}>{field.hint}</p>
        </div>
      ))}
      <div className={css({ display: 'grid', gridTemplateColumns: { base: '1fr', sm: '1fr 1fr' }, gap: '4' })}>
        {NUMBER_FIELDS.map(field => (
          <div key={field.key}>
            <label className={fieldLabel} htmlFor={`bundle-${field.key}`}>{field.label}</label>
            <input
              id={`bundle-${field.key}`}
              type="number"
              min={0}
              className={input}
              value={draft[field.key]}
              onChange={event => setDraft({ ...draft, [field.key]: Number(event.target.value) })}
              onBlur={() => commit({ ...draft, [field.key]: Number.isFinite(draft[field.key]) && draft[field.key] >= 0 ? Math.round(draft[field.key]) : DEFAULT_BUNDLE_SETTINGS[field.key] })}
            />
            <p className={fieldHint}>{field.hint}</p>
          </div>
        ))}
      </div>
      <div>
        <Button variant="outline" size="sm" onClick={() => commit(DEFAULT_BUNDLE_SETTINGS)}>Restore defaults</Button>
      </div>
    </div>
  )
}
