import type { LocalHost, RunResult } from '../server/local/host'

const STDERR_LIMIT = 8000
const RUN_IN_DIR = 'cd -- "$0" || exit 1; exec "$@"'
const RUN_IN_DIR_WITH_INPUT = 'cd -- "$0" || exit 1; input=$1; shift; exec "$@" < "$input"'

async function readStream(stream: TjsReadable | null, onChunk: (text: string) => void) {
  const reader = stream?.getReader()
  if (!reader)
    return
  const decoder = new TextDecoder()
  for (;;) {
    const { value, done } = await reader.read()
    if (done)
      break
    onChunk(decoder.decode(value, { stream: true }))
  }
}

async function exists(path: string) {
  try {
    await tjs.stat(path)
    return true
  }
  catch {
    return false
  }
}

export function createTinyLocalHost(loadEnv: () => Promise<Record<string, string>>): LocalHost {
  const encoder = new TextEncoder()

  async function run(args: string[], { cwd, env, timeoutMs }: { cwd: string, env: Record<string, string>, timeoutMs: number }): Promise<RunResult> {
    let stdout = ''
    let stderr = ''
    try {
      const process = tjs.spawn(['/bin/sh', '-c', RUN_IN_DIR, cwd, ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env })
      const timer = setTimeout(() => process.kill('SIGKILL'), timeoutMs)
      try {
        await Promise.all([
          readStream(process.stdout, (text) => { stdout += text }),
          readStream(process.stderr, (text) => { stderr = (stderr + text).slice(-STDERR_LIMIT) }),
        ])
        const status = await process.wait()
        return { code: status.term_signal ? 1 : status.exit_status, stdout, stderr }
      }
      finally {
        clearTimeout(timer)
      }
    }
    catch (error) {
      return { code: 1, stdout, stderr: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    pid: tjs.pid,
    homeDir: tjs.homeDir,
    cacheDir: `${tjs.homeDir}/Library/Caches/pull-review`,
    env: loadEnv,
    isExecutable: exists,
    run,

    stream(args, { cwd, stdinFile, env, onLine }) {
      const process = tjs.spawn(['/bin/sh', '-c', RUN_IN_DIR_WITH_INPUT, cwd, stdinFile, ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env })
      let pending = ''
      let stderr = ''
      const exited = (async () => {
        await Promise.all([
          readStream(process.stdout, (text) => {
            pending += text
            const lines = pending.split('\n')
            pending = lines.pop() ?? ''
            for (const line of lines)
              onLine(line)
          }),
          readStream(process.stderr, (text) => { stderr = (stderr + text).slice(-STDERR_LIMIT) }),
        ])
        if (pending)
          onLine(pending)
        const status = await process.wait()
        return { code: status.term_signal ? 1 : status.exit_status, stderr }
      })().catch((error: unknown) => ({ code: 1, stderr: error instanceof Error ? error.message : String(error) }))
      return {
        kill: () => {
          try {
            process.kill('SIGTERM')
          }
          catch {}
        },
        exited,
      }
    },

    launch(args, env) {
      const process = tjs.spawn(args, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore', env })
      void process.wait().catch(() => null)
    },

    writeFile: (path, text) => tjs.writeFile(path, encoder.encode(text)),
    makeDir: path => tjs.makeDir(path, { recursive: true }).catch(() => undefined),
    remove: async (path) => {
      if (await exists(path))
        await tjs.remove(path, { recursive: true })
    },
    async listDir(path) {
      const names: string[] = []
      try {
        for await (const entry of await tjs.readDir(path))
          names.push(entry.name)
      }
      catch {}
      return names
    },
    exists,
    isProcessAlive: async pid => (await run(['/bin/kill', '-0', String(pid)], { cwd: '/', env: {}, timeoutMs: 5000 })).code === 0,
  }
}
