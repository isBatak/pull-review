import type { CategoryConfig } from '../../../shared/grouping'
import type { AppSettings } from '../../lib/settings'
import { ArrowDown, ArrowUp, FlaskConical, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { createClassifier, DEFAULT_CATEGORIES, parseRules } from '../../../shared/grouping'
import { createTeamId } from '../../lib/settings'
import { Button, IconButton } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { FileIcon } from '../ui/file-icon'

const input = css({
  w: 'full',
  h: '9',
  px: '3',
  fontSize: 'sm',
  bg: 'bg.surface',
  color: 'fg.default',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  outline: 'none',
  _focus: { borderColor: 'accent.default', boxShadow: '0 0 0 3px color-mix(in srgb, var(--colors-accent-default) 18%, transparent)' },
  _placeholder: { color: 'fg.subtle' },
})

const rulesArea = css({
  w: 'full',
  minH: '32',
  p: '2.5',
  fontFamily: 'mono',
  fontSize: 'xs',
  lineHeight: '1.7',
  bg: 'bg.surface',
  color: 'fg.default',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  outline: 'none',
  resize: 'vertical',
  whiteSpace: 'pre',
  _focus: { borderColor: 'accent.default' },
  _placeholder: { color: 'fg.subtle' },
})

const fieldLabel = css({ display: 'block', fontSize: 'xs', fontWeight: 'semibold', mb: '1.5' })
const fieldHint = css({ fontSize: 'xs', color: 'fg.subtle', mt: '1.5', lineHeight: '1.6' })
const code = css({ fontFamily: 'mono', fontSize: '0.95em', bg: 'bg.muted', px: '1', borderRadius: 'sm', color: 'fg.default' })

interface CategoriesTabProps {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}

function RulesField({ label, value, onChange, placeholder, hint }: { label: string, value: string[], onChange: (lines: string[]) => void, placeholder: string, hint?: React.ReactNode }) {
  const [text, setText] = useState(value.join('\n'))
  const { errors } = useMemo(() => parseRules(text.split('\n')), [text])
  return (
    <div>
      <span className={fieldLabel}>{label}</span>
      <textarea
        className={rulesArea}
        value={text}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value)
          onChange(event.target.value.split('\n'))
        }}
        style={{ borderColor: errors.length ? 'var(--colors-danger-fg)' : undefined }}
      />
      {errors.map(error => (
        <p key={error.source} className={css({ fontSize: 'xs', color: 'danger.fg', mt: '1' })}>
          <span className={code}>{error.source}</span>
          {' is ignored: '}
          {error.message}
        </p>
      ))}
      {hint && <p className={fieldHint}>{hint}</p>}
    </div>
  )
}

function CategoryEditor({ category, onChange, onDelete }: { category: CategoryConfig, onChange: (patch: Partial<CategoryConfig>) => void, onDelete: () => void }) {
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '4' })}>
      <div className={css({ display: 'flex', gap: '3', alignItems: 'flex-end' })}>
        <div className={css({ flex: '1' })}>
          <label className={fieldLabel} htmlFor="category-name">Name</label>
          <input id="category-name" className={input} value={category.label} onChange={event => onChange({ label: event.target.value })} />
        </div>
        {!category.builtin && (
          <IconButton label="Delete category" size="md" variant="outline" onClick={onDelete}>
            <Trash2 />
          </IconButton>
        )}
      </div>
      <div>
        <label className={fieldLabel} htmlFor="category-description">Description</label>
        <input id="category-description" className={input} value={category.description} onChange={event => onChange({ description: event.target.value })} placeholder="Shown above the files of this category" />
      </div>

      {category.builtin
        ? (
            <p className={css({ fontSize: 'sm', color: 'fg.muted', bg: 'bg.subtle', borderRadius: 'md', p: '3' })}>
              {category.builtin === 'code'
                ? 'Built in. Every text file that no other category claims lands here, so it has no rules of its own.'
                : 'Built in. Binary files that no other category claims land here.'}
            </p>
          )
        : (
            <RulesField
              key={`${category.id}-match`}
              label="Files in this category"
              value={category.match}
              onChange={match => onChange({ match })}
              placeholder={'*.po\nlocales/\nlibs/**/tests/**\n/\\.e2e\\.ts$/'}
              hint={(
                <>
                  One rule per line.
                  {' '}
                  <span className={code}>*.po</span>
                  {' '}
                  matches a file name in any folder.
                  {' '}
                  <span className={code}>locales/</span>
                  {' '}
                  matches everything inside a folder with that name.
                  {' '}
                  <span className={code}>libs/**/tests/**</span>
                  {' '}
                  matches the full path.
                  {' '}
                  <span className={code}>/regex/i</span>
                  {' '}
                  is a regular expression. Lines starting with # are comments.
                </>
              )}
            />
          )}

      <div className={css({ display: 'flex', flexDir: 'column', gap: '2.5' })}>
        <label className={css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'sm', cursor: 'pointer' })}>
          <Checkbox checked={category.collapsed} onCheckedChange={collapsed => onChange({ collapsed })} label="Collapse files by default" />
          Collapse these files by default
        </label>
        {!category.builtin && (
          <label className={css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'sm', cursor: 'pointer' })}>
            <Checkbox checked={category.includeGitlabGenerated === true} onCheckedChange={value => onChange({ includeGitlabGenerated: value || undefined })} label="Include files GitLab marks as generated" />
            Also include files GitLab marks as generated
          </label>
        )}
      </div>

      {category.collapsed && !category.builtin && (
        <RulesField
          key={`${category.id}-keep`}
          label="Keep these expanded"
          value={category.keepExpanded}
          onChange={keepExpanded => onChange({ keepExpanded })}
          placeholder="locales/en/"
          hint="Files in this category that match these rules stay expanded. Use it to keep the primary language open, for example."
        />
      )}
    </div>
  )
}

function PathTester({ categories }: { categories: CategoryConfig[] }) {
  const [path, setPath] = useState('apps/frontend/app/public/locales/de/common.json')
  const result = useMemo(() => {
    const value = path.trim()
    if (!value)
      return null
    return createClassifier(categories).classify({ path: value, isBinary: /\.(?:png|jpe?g|gif|webp|ico)$/i.test(value), generated: false })
  }, [categories, path])

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '2', p: '3', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg' })}>
      <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', fontSize: 'xs', fontWeight: 'semibold', '& svg': { w: '3.5', h: '3.5', color: 'accent.fg' } })}>
        <FlaskConical />
        Test a file path
      </span>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '3' })}>
        <div className={css({ flex: '1', display: 'flex', alignItems: 'center', gap: '2', h: '9', px: '3', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', _focusWithin: { borderColor: 'accent.default' } })}>
          <FileIcon name={path.slice(path.lastIndexOf('/') + 1) || 'file'} />
          <input value={path} onChange={event => setPath(event.target.value)} spellCheck={false} className={css({ flex: '1', minW: '0', bg: 'transparent', outline: 'none', fontFamily: 'mono', fontSize: 'xs' })} aria-label="File path to test" />
        </div>
        {result && (
          <div className={css({ flexShrink: 0, textAlign: 'right', fontSize: 'xs', lineHeight: '1.4' })}>
            <div className={css({ fontWeight: 'semibold' })}>{result.category.label}</div>
            <div className={css({ color: 'fg.subtle' })}>
              {result.rule ? <span className={code}>{result.rule}</span> : 'no rule matched'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function CategoriesTab({ settings, onChange }: CategoriesTabProps) {
  const categories = settings.categories
  const [activeId, setActiveId] = useState(categories[0]?.id ?? null)
  const [confirmReset, setConfirmReset] = useState(false)
  const active = categories.find(category => category.id === activeId) ?? categories[0]

  function save(next: CategoryConfig[]) {
    onChange({ categories: next })
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= categories.length)
      return
    const next = [...categories]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    save(next)
  }

  function addCategory() {
    const category: CategoryConfig = { id: `custom-${createTeamId()}`, label: 'New category', description: '', match: [], keepExpanded: [], collapsed: false }
    const codeIndex = categories.findIndex(item => item.builtin === 'code')
    const next = [...categories]
    next.splice(codeIndex + 1, 0, category)
    save(next)
    setActiveId(category.id)
  }

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '4' })}>
      <PathTester categories={categories} />
      <div className={css({ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '5', minH: '440px' })}>
        <div className={css({ display: 'flex', flexDir: 'column', gap: '1' })}>
          <p className={css({ fontSize: 'xs', color: 'fg.subtle', mb: '1' })}>The first matching category wins. Order also sets the order on the review page.</p>
          {categories.map((category, index) => (
            <div
              key={category.id}
              data-active={active?.id === category.id || undefined}
              className={cx('group', css({ display: 'flex', alignItems: 'center', gap: '1', pl: '2.5', pr: '1', h: '9', borderRadius: 'md', color: 'fg.muted', _hover: { bg: 'bg.muted' }, '&[data-active]': { bg: 'bg.muted', color: 'fg.default' } }))}
            >
              <button type="button" onClick={() => setActiveId(category.id)} className={css({ flex: '1', minW: '0', display: 'flex', alignItems: 'center', gap: '2', h: 'full', textAlign: 'left', fontSize: 'sm', cursor: 'pointer' })}>
                <span className={css({ truncate: true, fontWeight: active?.id === category.id ? 'medium' : 'normal' })}>{category.label || 'Untitled'}</span>
                {category.builtin && <span className={css({ fontSize: '2xs', color: 'fg.subtle' })}>built in</span>}
                {category.collapsed && <span className={css({ fontSize: '2xs', color: 'fg.subtle' })}>collapsed</span>}
              </button>
              <span className={css({ display: 'flex', opacity: 0, _groupHover: { opacity: 1 }, _focusWithin: { opacity: 1 } })}>
                <IconButton size="xs" label="Move up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></IconButton>
                <IconButton size="xs" label="Move down" disabled={index === categories.length - 1} onClick={() => move(index, 1)}><ArrowDown /></IconButton>
              </span>
            </div>
          ))}
          <Button variant="ghost" size="md" onClick={addCategory} className={css({ justifyContent: 'flex-start', px: '2.5' })}>
            <Plus />
            New category
          </Button>
          <div className={css({ mt: 'auto', pt: '3' })}>
            {confirmReset
              ? (
                  <div className={css({ display: 'flex', flexDir: 'column', gap: '2', fontSize: 'xs', color: 'fg.muted' })}>
                    Replace all categories with the defaults?
                    <div className={css({ display: 'flex', gap: '2' })}>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          save(DEFAULT_CATEGORIES)
                          setActiveId(DEFAULT_CATEGORIES[0]!.id)
                          setConfirmReset(false)
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                )
              : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
                    <RotateCcw />
                    Reset to defaults
                  </Button>
                )}
          </div>
        </div>
        {active && (
          <CategoryEditor
            key={active.id}
            category={active}
            onChange={patch => save(categories.map(category => category.id === active.id ? { ...category, ...patch } : category))}
            onDelete={() => {
              save(categories.filter(category => category.id !== active.id))
              setActiveId(categories[0]?.id ?? null)
            }}
          />
        )}
      </div>
    </div>
  )
}
