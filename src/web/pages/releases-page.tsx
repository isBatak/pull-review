import { ArrowLeft, Hourglass, Settings } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { css } from 'styled-system/css'
import { HotfixTags } from '../components/releases/hotfix-tags'
import { SettingsDialog } from '../components/settings/settings-dialog'
import { IconButton, WithTooltip } from '../components/ui/button'
import { FolderTabs, folderBar } from '../components/ui/folder-tabs'
import { homePath } from '../lib/last-home'
import { useSettings } from '../lib/settings'

type ReleaseKind = 'regular' | 'hotfix'

const RELEASE_KINDS: { value: ReleaseKind, label: string }[] = [
  { value: 'hotfix', label: 'Hotfix' },
  { value: 'regular', label: 'Regular release' },
]

function isReleaseKind(value: string | undefined): value is ReleaseKind {
  return RELEASE_KINDS.some(entry => entry.value === value)
}

function ComingSoon() {
  return (
    <div className={css({ display: 'flex', flexDir: 'column', alignItems: 'center', gap: '2', py: '16', px: '6', textAlign: 'center', '& svg': { w: '7', h: '7', color: 'fg.subtle' } })}>
      <Hourglass />
      <p className={css({ fontWeight: 'semibold' })}>Coming soon</p>
      <p className={css({ fontSize: 'sm', color: 'fg.muted', maxW: 'md' })}>Regular releases are not ready yet. Use Hotfix for now.</p>
    </div>
  )
}

export function ReleasesPage() {
  const navigate = useNavigate()
  const { kind } = useParams()
  const [settings, updateSettings] = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  if (!isReleaseKind(kind))
    return <Navigate to="/releases/hotfix" replace />

  return (
    <div className={css({ minH: '100dvh', bg: 'bg.canvas' })}>
      <header className={css({ position: 'sticky', top: '0', zIndex: 'sticky', display: 'flex', alignItems: 'center', gap: '4', px: '4', py: '2.5', borderBottomWidth: '1px', borderColor: 'border.default', bg: 'bg.surface' })}>
        <WithTooltip label="Back to merge requests">
          <Link
            to={homePath()}
            aria-label="Back to merge requests"
            className={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, w: '8', h: '8', borderRadius: 'md', color: 'fg.muted', _hover: { bg: 'bg.muted', color: 'fg.default' }, _focusVisible: { outline: '2px solid', outlineColor: 'accent.default' }, '& svg': { w: '4.5', h: '4.5' } })}
          >
            <ArrowLeft />
          </Link>
        </WithTooltip>
        <h1 className={css({ flex: '1', fontSize: 'md', fontWeight: 'semibold' })}>Releases</h1>
        <IconButton label="Release settings" onClick={() => setSettingsOpen(true)}>
          <Settings />
        </IconButton>
      </header>
      <main className={css({ maxW: '1200px', mx: 'auto', px: { base: '4', md: '8' }, py: '8', display: 'flex', flexDir: 'column', gap: '5' })}>
        <div className={folderBar}>
          <FolderTabs
            label="Release type"
            opensInto="canvas"
            value={kind}
            onChange={value => navigate(`/releases/${value}`)}
            tabs={RELEASE_KINDS}
          />
        </div>
        {kind === 'hotfix' && (settings.project
          ? <HotfixTags project={settings.project} />
          : <p className={css({ fontSize: 'sm', color: 'fg.muted' })}>Choose a GitLab project in Settings first. Tags are loaded from it.</p>)}
        {kind === 'regular' && <ComingSoon />}
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={updateSettings}
      />
    </div>
  )
}
