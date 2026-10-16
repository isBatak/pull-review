import type { FixTarget, LocalFix } from '../../shared/local-changes'
import type { MrRef } from '../../shared/types'
import type { LocalHost } from './host'
import { readLocalFix, withFix, withoutFix } from '../../shared/local-changes'
import { mrKey } from '../../shared/mr-ref'
import { slugFor } from '../chat/workspace'

interface SavedFixes {
  fixes: LocalFix[]
  updatedAt: number
}

export function localFixesFile(chatDir: string) {
  return `${chatDir}/fixes.json`
}

export async function readSavedFixes(host: LocalHost, path: string): Promise<SavedFixes | null> {
  const text = await host.readFile(path)
  if (!text)
    return null
  try {
    const saved = JSON.parse(text) as Partial<SavedFixes>
    return {
      fixes: (Array.isArray(saved.fixes) ? saved.fixes : []).flatMap(fix => readLocalFix(fix) ?? []),
      updatedAt: typeof saved.updatedAt === 'number' ? saved.updatedAt : 0,
    }
  }
  catch {
    return null
  }
}

export function createLocalFixStore(host: LocalHost) {
  const queues = new Map<string, Promise<unknown>>()
  const dirFor = (ref: MrRef) => `${host.cacheDir}/chats/${slugFor(ref)}`

  async function list(ref: MrRef) {
    return (await readSavedFixes(host, localFixesFile(dirFor(ref))))?.fixes ?? []
  }

  function update(ref: MrRef, change: (fixes: LocalFix[]) => LocalFix[]) {
    const key = mrKey(ref)
    const next = (queues.get(key) ?? Promise.resolve()).catch(() => null).then(async () => {
      const fixes = change(await list(ref))
      await host.makeDir(dirFor(ref))
      await host.writeFile(localFixesFile(dirFor(ref)), JSON.stringify({ fixes, updatedAt: Date.now() } satisfies SavedFixes))
      return fixes
    })
    queues.set(key, next)
    return next
  }

  return {
    list,
    add: (ref: MrRef, added: LocalFix[]) => update(ref, fixes => added.reduce(withFix, fixes)),
    remove: (ref: MrRef, target: FixTarget) => update(ref, fixes => withoutFix(fixes, target)),
  }
}
