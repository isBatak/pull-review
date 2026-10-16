interface TjsReadable {
  getReader: () => { read: () => Promise<{ value?: Uint8Array, done: boolean }> }
}

interface TjsProcess {
  stdout: TjsReadable | null
  stderr: TjsReadable | null
  wait: () => Promise<{ exit_status: number, term_signal: string | null }>
  kill: (signal?: string) => void
}

interface TjsDirEntry {
  name: string
  isDirectory: boolean
}

type TjsStdio = 'pipe' | 'ignore' | 'inherit'

interface TinyMenuItem {
  id: string
  label: string
}

interface TinyApp {
  setMenu: (menus: Array<{ role: 'app', items: TinyMenuItem[] }>) => void
}

declare const tjs: {
  env: Record<string, string | undefined>
  pid: number
  homeDir: string
  spawn: (args: string[], options?: { stdout?: TjsStdio, stderr?: TjsStdio, stdin?: TjsStdio, env?: Record<string, string> }) => TjsProcess
  stat: (path: string) => Promise<{ isFile?: boolean, isDirectory?: boolean }>
  writeFile: (path: string, data: Uint8Array) => Promise<void>
  readFile: (path: string) => Promise<Uint8Array>
  makeDir: (path: string, options?: { recursive?: boolean }) => Promise<void>
  remove: (path: string, options?: { recursive?: boolean }) => Promise<void>
  readDir: (path: string) => Promise<AsyncIterable<TjsDirEntry>>
}
