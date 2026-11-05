import type { BootFailure } from '../shared/self-improve'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOT_FAILURE_FILE } from '../shared/self-improve'
import { cliOverlayRoot } from './self-improve/cli-overlay'

const SHIPPED_FLAG = '--shipped'

const shippedCli = new URL('./cli.mjs', import.meta.url)
globalThis.__pullReviewShipped = dirname(fileURLToPath(shippedCli))

const root = cliOverlayRoot(homedir(), process.platform, process.env.XDG_DATA_HOME)

function activeOverlay() {
  if (process.argv.includes(SHIPPED_FLAG))
    return null
  try {
    const dir = `${root}/${__APP_VERSION__}`
    return readFileSync(`${root}/active`, 'utf8').trim() === __APP_VERSION__ && existsSync(`${dir}/build/cli.mjs`) ? dir : null
  }
  catch {
    return null
  }
}

function turnOff(reason: string) {
  const failure: BootFailure = { version: __APP_VERSION__, reason, at: new Date().toISOString() }
  try {
    writeFileSync(`${root}/active`, 'off\n')
    writeFileSync(`${root}/${BOOT_FAILURE_FILE}`, `${JSON.stringify(failure, null, 2)}\n`)
  }
  catch {}
}

const overlay = activeOverlay()
if (overlay) {
  globalThis.__pullReviewOverlay = overlay
  try {
    await import(pathToFileURL(`${overlay}/build/cli.mjs`).href)
  }
  catch (error) {
    const reason = `The changed command line tool did not start: ${error instanceof Error ? error.message : String(error)}`
    console.error(`\n  ${reason}\n  Your local changes are off now. Starting pull-review as it shipped.\n`)
    turnOff(reason)
    globalThis.__pullReviewOverlay = undefined
    globalThis.__pullReviewStartFailure = reason
    await import(shippedCli.href)
  }
}
else {
  await import(shippedCli.href)
}
