import type { EditorDefinition } from '../../shared/editors'
import type { LocalHost } from './host'
import { AUTO_EDITOR, detectRunningEditor, EDITORS, editorArguments, editorById } from '../../shared/editors'
import { findExecutable } from './host'

const PS_TIMEOUT_MS = 5000

export class EditorError extends Error {}

export interface EditorStatus {
  detected: string | null
  installed: string[]
}

async function runningEditor(host: LocalHost) {
  const result = await host.run(['/bin/ps', 'ax', '-o', 'comm='], { cwd: '/', env: await host.env(), timeoutMs: PS_TIMEOUT_MS })
  return result.code === 0 ? detectRunningEditor(result.stdout) : null
}

async function findCommand(host: LocalHost, editor: EditorDefinition) {
  for (const command of editor.commands) {
    const path = await findExecutable(host, command)
    if (path)
      return path
  }
  return null
}

async function findMacApp(host: LocalHost, editor: EditorDefinition) {
  if (!editor.macApp)
    return null
  for (const dir of ['/Applications', `${host.homeDir}/Applications`]) {
    const path = `${dir}/${editor.macApp}.app`
    if (await host.exists(path))
      return path
  }
  return null
}

async function isInstalled(host: LocalHost, editor: EditorDefinition) {
  return Boolean(await findMacApp(host, editor) ?? await findCommand(host, editor))
}

export async function editorStatus(host: LocalHost): Promise<EditorStatus> {
  const [running, installed] = await Promise.all([
    runningEditor(host).catch(() => null),
    Promise.all(EDITORS.map(async editor => (await isInstalled(host, editor)) ? editor.id : null)),
  ])
  return { detected: running?.editor.id ?? null, installed: installed.filter((id): id is string => id !== null) }
}

async function resolveEditor(host: LocalHost, preferred: string) {
  const running = await runningEditor(host).catch(() => null)
  if (preferred !== AUTO_EDITOR) {
    const editor = editorById(preferred)
    if (!editor)
      throw new EditorError(`Unknown editor "${preferred}".`)
    return { editor, executable: running?.editor.id === editor.id ? running.executable : null }
  }
  if (running)
    return running
  for (const editor of EDITORS) {
    if (await isInstalled(host, editor))
      return { editor, executable: null }
  }
  throw new EditorError('No code editor found. Choose one in Settings, General.')
}

function launchEnv(env: Record<string, string>) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('VSCODE_') && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'TERM_PROGRAM'))
}

async function findBundledCommand(host: LocalHost, editor: EditorDefinition) {
  const macApp = await findMacApp(host, editor)
  const path = macApp ? `${macApp}/${editor.macCli}` : null
  return path && await host.isExecutable(path) ? path : null
}

export async function openInEditor(host: LocalHost, input: { workspace: string, file: string, line: number, column: number, editor: string }): Promise<string> {
  if (!await host.exists(input.file))
    throw new EditorError(`${input.file} does not exist in your local repository.`)
  const { editor, executable } = await resolveEditor(host, input.editor)
  const env = launchEnv(await host.env())
  const command = await findBundledCommand(host, editor) ?? await findCommand(host, editor) ?? executable
  if (command) {
    host.launch([command, ...editorArguments(editor, input)], env)
    return editor.id
  }
  const macApp = await findMacApp(host, editor)
  if (macApp) {
    host.launch(['/usr/bin/open', '-a', macApp, input.workspace], env)
    return editor.id
  }
  throw new EditorError(`${editor.label} is not installed.`)
}
