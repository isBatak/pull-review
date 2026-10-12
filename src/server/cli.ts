import type { MrRef } from '../shared/types'
import type { AppOptions } from './app'
import type { ChatService } from './chat/service'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createAdaptorServer } from '@hono/node-server'
import { cac } from 'cac'
import open from 'open'
import { mrAppPath, parseMrRef } from '../shared/mr-ref'
import { createApp } from './app'
import { createNodeChatHost } from './chat/node-host'
import { createChatService } from './chat/service'
import { detectMrFromGit } from './detect'
import { resolveToken, tokenHelp } from './token'

const DEFAULT_PORT = 5179
const MAX_PORT_ATTEMPTS = 20

function listen(options: AppOptions, port: number, attempt = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createAdaptorServer({ fetch: createApp(options).fetch })
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS)
        resolve(listen(options, port + 1, attempt + 1))
      else
        reject(error)
    })
    server.listen(port, '127.0.0.1', () => resolve(port))
  })
}

async function resolveTarget(input: string | undefined, defaultHost: string | undefined): Promise<MrRef | null> {
  if (!input)
    return detectMrFromGit(process.cwd()).catch((error: Error) => {
      console.warn(`  ${error.message}\n  Opening the start page instead.\n`)
      return null
    })
  const ref = parseMrRef(input, defaultHost)
  if (!ref)
    throw new Error(`"${input}" is not a GitLab merge request URL. Example: https://gitlab.com/group/project/-/merge_requests/1`)
  return ref
}

function stopChatOnExit(chat: ChatService) {
  let stopping = false
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      if (stopping)
        return
      stopping = true
      console.log('\n  Cleaning up Claude workspaces…')
      void chat.dispose().finally(() => process.exit(0))
    })
  }
}

const cli = cac('pull-review')

cli
  .command('[mr]', 'Review a GitLab merge request in your browser')
  .option('--port <port>', 'Port for the local server', { default: DEFAULT_PORT })
  .option('--host <host>', 'Default GitLab host for short refs like group/project!1', { default: process.env.GITLAB_HOST })
  .option('--no-open', 'Do not open the browser')
  .example('pull-review https://gitlab.com/group/project/-/merge_requests/42')
  .example('pull-review group/project!42 --host gitlab.com')
  .example('pull-review   # the open merge request of the current branch')
  .action(async (input: string | undefined, flags: { port: number, host?: string, open: boolean }) => {
    const ref = await resolveTarget(input, flags.host)
    if (ref) {
      const token = await resolveToken(ref.host)
      if (!token) {
        console.error(tokenHelp(ref.host))
        process.exit(1)
      }
      console.log(`  Using GitLab token from ${token.source}`)
    }

    const initialPath = ref ? mrAppPath(ref) : '/'
    const chat = createChatService(createNodeChatHost())
    stopChatOnExit(chat)
    const port = await listen({ webRoot: fileURLToPath(new URL('./web', import.meta.url)), initialPath, cwd: process.cwd(), chat }, Number(flags.port))
    const url = `http://127.0.0.1:${port}${initialPath}`
    console.log(`\n  pull-review is running at ${url}\n  Press Ctrl+C to stop.\n`)
    if (flags.open)
      await open(url).catch(() => {})
  })

cli.help()
cli.version(__APP_VERSION__)

try {
  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
}
catch (error) {
  console.error(`  ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
