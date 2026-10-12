export interface GitRemote {
  host: string
  project: string
}

export function parseGitRemote(url: string): GitRemote | null {
  const value = url.trim().replace(/\.git$/, '')
  const scp = /^[\w.-]+@([^:/]+):(?!\d+\/)(.+)$/.exec(value)
  if (scp)
    return { host: scp[1]!, project: scp[2]! }
  try {
    const parsed = new URL(value)
    const project = parsed.pathname.replace(/^\/+/, '')
    if (!project.includes('/'))
      return null
    return { host: parsed.hostname, project }
  }
  catch {
    return null
  }
}
