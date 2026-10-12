import type { ChatHost } from './host'
import { execFile, spawn } from 'node:child_process'
import { closeSync, constants, openSync } from 'node:fs'
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import process from 'node:process'
import { createInterface } from 'node:readline'

const STDERR_LIMIT = 8000

function cacheDirFor(home: string) {
  if (process.platform === 'darwin')
    return `${home}/Library/Caches/pull-review`
  return `${process.env.XDG_CACHE_HOME || `${home}/.cache`}/pull-review`
}

export function createNodeChatHost(): ChatHost {
  const home = homedir()
  return {
    pid: process.pid,
    homeDir: home,
    cacheDir: cacheDirFor(home),
    env: async () => Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    isExecutable: path => access(path, constants.X_OK).then(() => true, () => false),

    run: (args, { cwd, env, timeoutMs }) => new Promise((resolve) => {
      execFile(args[0]!, args.slice(1), { cwd, env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
        resolve({ code, stdout: String(stdout), stderr: String(stderr) })
      })
    }),

    stream(args, { cwd, stdinFile, env, onLine }) {
      const stdin = openSync(stdinFile, 'r')
      const child = spawn(args[0]!, args.slice(1), { cwd, env, stdio: [stdin, 'pipe', 'pipe'] })
      closeSync(stdin)
      let stderr = ''
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-STDERR_LIMIT)
      })
      createInterface({ input: child.stdout! }).on('line', onLine)
      const exited = new Promise<{ code: number, stderr: string }>((resolve) => {
        child.once('error', error => resolve({ code: 1, stderr: error.message }))
        child.once('close', code => resolve({ code: code ?? 1, stderr }))
      })
      return { kill: () => child.kill('SIGTERM'), exited }
    },

    writeFile: (path, text) => writeFile(path, text),
    makeDir: path => mkdir(path, { recursive: true }).then(() => undefined),
    remove: path => rm(path, { recursive: true, force: true }),
    listDir: path => readdir(path).catch(() => []),
    exists: path => access(path).then(() => true, () => false),
    isProcessAlive: async (pid) => {
      try {
        process.kill(pid, 0)
        return true
      }
      catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM'
      }
    },
  }
}
