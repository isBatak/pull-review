import type { MrRef } from './types'

const MR_PATH_PATTERN = /^\/?([^/]+)\/(.+?)\/-\/merge_requests\/(\d+)(?:[/?#].*)?$/
const SHORT_REF_PATTERN = /^(?:([^/\s]+):)?([^\s!]+\/[^\s!]+)!(\d+)$/

export function parseMrRef(input: string, defaultHost?: string): MrRef | null {
  const value = input.trim()
  if (!value)
    return null

  const short = SHORT_REF_PATTERN.exec(value)
  if (short) {
    const host = short[1] ?? defaultHost
    if (!host)
      return null
    return { host, project: short[2]!, iid: Number(short[3]) }
  }

  let path = value
  if (/^https?:\/\//.test(value)) {
    try {
      const url = new URL(value)
      path = `${url.host}${url.pathname}`
    }
    catch {
      return null
    }
  }

  const match = MR_PATH_PATTERN.exec(path)
  if (!match)
    return null
  return { host: match[1]!, project: decodeURIComponent(match[2]!), iid: Number(match[3]) }
}

export function mrAppPath(ref: MrRef): string {
  return `/${ref.host}/${ref.project}/-/merge_requests/${ref.iid}`
}

export function mrWebUrl(ref: MrRef): string {
  return `https://${ref.host}/${ref.project}/-/merge_requests/${ref.iid}`
}

export function mrKey(ref: MrRef): string {
  return `${ref.host}/${ref.project}!${ref.iid}`
}
