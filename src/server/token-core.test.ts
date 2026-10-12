import { describe, expect, it } from 'vitest'
import { createTokenResolver } from './token-core'

function resolverWith(env: Record<string, string>, glab: Record<string, string> = {}) {
  return createTokenResolver({ getEnv: key => env[key], readGlabToken: async host => glab[host] ?? null })
}

describe('createTokenResolver', () => {
  it('uses generic token variables only for trusted hosts', async () => {
    const resolve = resolverWith({ GITLAB_TOKEN: 'secret' })
    expect(await resolve('gitlab.tradelocker.com')).toEqual({ token: 'secret', source: '$GITLAB_TOKEN' })
    expect(await resolve('gitlab.evil.example')).toBeNull()
  })

  it('reads trusted hosts from PULL_REVIEW_GITLAB_HOSTS and GITLAB_HOST', async () => {
    const resolve = resolverWith({ GITLAB_TOKEN: 'secret', PULL_REVIEW_GITLAB_HOSTS: 'gitlab.com, https://code.example.org/', GITLAB_HOST: 'git.example.net' })
    expect(await resolve('gitlab.com')).not.toBeNull()
    expect(await resolve('code.example.org')).not.toBeNull()
    expect(await resolve('git.example.net')).not.toBeNull()
    expect(await resolve('gitlab.tradelocker.com')).toBeNull()
  })

  it('always accepts host-specific variables and glab tokens', async () => {
    const resolve = resolverWith({ PULL_REVIEW_GITLAB_TOKEN_GITLAB_EVIL_EXAMPLE: 'mine' }, { 'other.example': 'from-glab' })
    expect(await resolve('gitlab.evil.example')).toEqual({ token: 'mine', source: '$PULL_REVIEW_GITLAB_TOKEN_GITLAB_EVIL_EXAMPLE' })
    expect(await resolve('other.example')).toEqual({ token: 'from-glab', source: 'glab config' })
  })
})
