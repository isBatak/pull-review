import type { UpdateInfo } from '../../shared/updates'
import { CHECK_FOR_UPDATES_MENU_ID, notesSince } from '../../shared/updates'
import { callApp, onAppEvent } from './platform'

interface CheckResult {
  available: boolean
  current: string
  latest: string | null
  notes: string | null
}

function withNewNotesOnly(info: UpdateInfo): UpdateInfo {
  return { ...info, notes: info.notes ? notesSince(info.notes, info.current) || null : null }
}

export async function checkForUpdate(): Promise<{ current: string, update: UpdateInfo | null }> {
  const result = await callApp<CheckResult>('update.check')
  const update = result.available && result.latest ? withNewNotesOnly({ current: result.current, latest: result.latest, notes: result.notes }) : null
  return { current: result.current, update }
}

export function installUpdate() {
  return callApp<boolean>('update.install')
}

export function onUpdateAvailable(listener: (info: UpdateInfo) => void) {
  return onAppEvent<UpdateInfo>('update-available', info => listener(withNewNotesOnly(info)))
}

export function onCheckForUpdatesMenu(listener: () => void) {
  return onAppEvent<{ id: string }>('menu', ({ id }) => {
    if (id === CHECK_FOR_UPDATES_MENU_ID)
      listener()
  })
}
