import type { LocalHost } from './host'
import { findExecutable } from './host'

const REMOVED_ENV = ['ANTHROPIC_API_KEY', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']

export function findClaude(host: LocalHost) {
  return findExecutable(host, 'claude', [`${host.homeDir}/.local/bin`, `${host.homeDir}/.claude/local`])
}

export async function claudeEnv(host: LocalHost) {
  const env = { ...await host.env() }
  for (const key of REMOVED_ENV)
    delete env[key]
  return env
}
