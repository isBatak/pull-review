import type { ProjectInfo, ProjectRef } from '../../shared/types'
import { CornerDownLeft, Link2, Moon, Settings, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { css } from 'styled-system/css'
import { mrAppPath, parseMrRef } from '../../shared/mr-ref'
import { themeHasLightMode, useTheme, useThemeName } from '../lib/preferences'
import { IconButton } from './ui/button'
import { ProjectAvatar } from './ui/project-avatar'

const SHORT_IID = /^!?(\d+)$/

export function resolveMrInput(input: string, project: ProjectRef | null) {
  const value = input.trim()
  const short = SHORT_IID.exec(value)
  if (short && project)
    return { ...project, iid: Number(short[1]) }
  return parseMrRef(value, project?.host)
}

interface AppHeaderProps {
  project: ProjectRef | null
  projectInfo: ProjectInfo | undefined
  onOpenSettings: () => void
}

export function AppHeader({ project, projectInfo, onOpenSettings }: AppHeaderProps) {
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()
  const [themeName] = useThemeName()
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function submit() {
    const ref = resolveMrInput(value, project)
    if (!ref) {
      setError(true)
      return
    }
    setValue('')
    navigate(mrAppPath(ref))
  }

  return (
    <header
     
      className={css({
        position: 'sticky',
        top: '0',
        zIndex: 'sticky',
        display: 'grid',
        gridTemplateColumns: '1fr minmax(0, 560px) 1fr',
        alignItems: 'center',
        gap: '4',
        h: '14',
        px: '4',
        bg: 'bg.surface',
        borderBottomWidth: '1px',
        borderColor: 'border.default',
      })}
    >
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2.5', minW: '0' })}>
        {projectInfo && (
          <>
            <button
              type="button"
              onClick={onOpenSettings}
              title="Change project"
              className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', minW: '0', px: '1.5', h: '7', borderRadius: 'md', fontSize: 'sm', color: 'fg.muted', cursor: 'pointer', _hover: { bg: 'bg.muted', color: 'fg.default' } })}
            >
              <ProjectAvatar project={projectInfo} />
              <span className={css({ truncate: true })}>{projectInfo.pathWithNamespace}</span>
            </button>
          </>
        )}
        <span
          title={`Pull Review ${__APP_VERSION__}`}
          className={css({ flexShrink: 0, px: '1.5', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'sm', fontSize: '2xs', lineHeight: '1.6', color: 'fg.subtle', fontVariantNumeric: 'tabular-nums' })}
        >
          v{__APP_VERSION__}
        </span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className={css({
          display: 'flex',
          alignItems: 'center',
          gap: '2',
          h: '9',
          px: '3',
          bg: 'bg.subtle',
          borderWidth: '1px',
          borderColor: error ? 'danger.fg' : 'border.default',
          borderRadius: 'lg',
          transition: 'border-color 120ms, box-shadow 120ms, background 120ms',
          _focusWithin: { bg: 'bg.surface', borderColor: 'accent.default', boxShadow: '0 0 0 3px color-mix(in srgb, var(--colors-accent-default) 18%, transparent)' },
          '& svg': { w: '4', h: '4', color: 'fg.subtle', flexShrink: 0 },
        })}
      >
        <Link2 />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(false)
          }}
          placeholder={project ? 'Paste a merge request link, or type !6039' : 'Paste a GitLab merge request link'}
          aria-label="Open merge request"
          className={css({ flex: '1', minW: '0', bg: 'transparent', outline: 'none', fontSize: 'sm', color: 'fg.default', _placeholder: { color: 'fg.subtle' } })}
        />
        {value
          ? <CornerDownLeft aria-hidden />
          : <kbd className={css({ fontFamily: 'body', fontSize: '2xs', color: 'fg.subtle', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'sm', px: '1', lineHeight: '1.4' })}>⌘K</kbd>}
      </form>

      <div className={css({ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1' })}>
        {themeHasLightMode(themeName) && (
          <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </IconButton>
        )}
        <IconButton label="Settings" onClick={onOpenSettings}>
          <Settings />
        </IconButton>
      </div>
    </header>
  )
}
