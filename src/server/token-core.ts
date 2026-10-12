export interface ResolvedToken {
  token: string
  source: string
}

export type TokenResolver = (host: string) => Promise<ResolvedToken | null>

export interface TokenSources {
  getEnv: (key: string) => string | undefined | Promise<string | undefined>
  readGlabToken: (host: string) => Promise<string | null>
}

const ENV_KEYS = ['PULL_REVIEW_GITLAB_TOKEN', 'GITLAB_TOKEN', 'GITLAB_PRIVATE_TOKEN', 'GLAB_TOKEN']
const HOSTS_KEY = 'PULL_REVIEW_GITLAB_HOSTS'
export const DEFAULT_TRUSTED_HOSTS = ['gitlab.tradelocker.com']

function normalizeHost(value: string) {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed)
    return ''
  try {
    return new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).host
  }
  catch {
    return ''
  }
}

async function trustedHosts(sources: TokenSources): Promise<Set<string>> {
  const listed = (await sources.getEnv(HOSTS_KEY)) ?? ''
  const glabHost = (await sources.getEnv('GITLAB_HOST')) ?? ''
  const hosts = [...listed.split(','), glabHost].map(normalizeHost).filter(Boolean)
  return new Set(hosts.length ? hosts : DEFAULT_TRUSTED_HOSTS)
}

function hostEnvKey(host: string) {
  return `PULL_REVIEW_GITLAB_TOKEN_${host.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
}

export function createTokenResolver(sources: TokenSources): TokenResolver {
  const cache = new Map<string, Promise<ResolvedToken | null>>()

  async function lookup(host: string): Promise<ResolvedToken | null> {
    const genericKeys = (await trustedHosts(sources)).has(host.toLowerCase()) ? ENV_KEYS : []
    for (const key of [hostEnvKey(host), ...genericKeys]) {
      const value = (await sources.getEnv(key))?.trim()
      if (value)
        return { token: value, source: `$${key}` }
    }
    const glab = await sources.readGlabToken(host)
    if (glab)
      return { token: glab, source: 'glab config' }
    return null
  }

  return (host) => {
    let pending = cache.get(host)
    if (!pending) {
      pending = lookup(host)
      cache.set(host, pending)
    }
    return pending
  }
}

export function tokenHelp(host: string): string {
  return [
    `No GitLab token found for ${host}.`,
    `Set ${hostEnvKey(host)}, or one of ${ENV_KEYS.join(', ')} together with ${HOSTS_KEY}=${host}`,
    `or sign in with: glab auth login --hostname ${host}`,
    'The token needs the "api" scope to post and resolve comments.',
  ].join('\n')
}
