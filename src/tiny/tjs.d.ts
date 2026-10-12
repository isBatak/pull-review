interface TjsReadable {
  getReader: () => { read: () => Promise<{ value?: Uint8Array, done: boolean }> }
}

interface TjsProcess {
  stdout: TjsReadable | null
  wait: () => Promise<{ exit_status: number, term_signal: string | null }>
  kill: (signal?: string) => void
}

declare const tjs: {
  env: Record<string, string | undefined>
  spawn: (args: string[], options?: { stdout?: 'pipe' | 'ignore' | 'inherit', stderr?: 'pipe' | 'ignore' | 'inherit', stdin?: 'pipe' | 'ignore' | 'inherit', env?: Record<string, string> }) => TjsProcess
  stat: (path: string) => Promise<{ isFile?: boolean, isExecutable?: boolean }>
}
