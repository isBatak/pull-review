export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export interface StreamedProcess {
  kill: () => void
  exited: Promise<{ code: number, stderr: string }>
}

export interface StreamOptions {
  cwd: string
  stdinFile: string
  env: Record<string, string>
  onLine: (line: string) => void
}

export interface LocalHost {
  pid: number
  homeDir: string
  cacheDir: string
  env: () => Promise<Record<string, string>>
  isExecutable: (path: string) => Promise<boolean>
  run: (args: string[], options: { cwd: string, env: Record<string, string>, timeoutMs: number }) => Promise<RunResult>
  stream: (args: string[], options: StreamOptions) => StreamedProcess
  launch: (args: string[], env: Record<string, string>) => void
  writeFile: (path: string, text: string) => Promise<void>
  makeDir: (path: string) => Promise<void>
  remove: (path: string) => Promise<void>
  listDir: (path: string) => Promise<string[]>
  exists: (path: string) => Promise<boolean>
  isProcessAlive: (pid: number) => Promise<boolean>
}

const FALLBACK_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']

export async function findExecutable(host: LocalHost, name: string, extraDirs: string[] = []): Promise<string | null> {
  const env = await host.env()
  const dirs = [...(env.PATH ?? '').split(':'), ...extraDirs, ...FALLBACK_DIRS].filter(Boolean)
  for (const dir of new Set(dirs)) {
    const path = `${dir}/${name}`
    if (await host.isExecutable(path))
      return path
  }
  return null
}

export function lastLines(text: string, count = 5) {
  return text.trim().split('\n').slice(-count).join('\n')
}
