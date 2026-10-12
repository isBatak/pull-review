import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { createTokenResolver } from './token-core'

export type { ResolvedToken } from './token-core'
export { tokenHelp } from './token-core'

const execFileAsync = promisify(execFile)

async function readGlabToken(host: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('glab', ['config', 'get', 'token', '--host', host], { timeout: 5000 })
    return stdout.trim() || null
  }
  catch {
    return null
  }
}

export const resolveToken = createTokenResolver({ getEnv: key => process.env[key], readGlabToken })
