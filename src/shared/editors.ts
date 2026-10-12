export type EditorFamily = 'vscode' | 'jetbrains' | 'colon' | 'zed'

export interface EditorDefinition {
  id: string
  label: string
  family: EditorFamily
  macApp: string | null
  macProcesses: string[]
  macCli: string
  commands: string[]
}

function vscodeLike(id: string, label: string, macApp: string, commands: string[], processes = ['Electron', macApp]): EditorDefinition {
  return {
    id,
    label,
    family: 'vscode',
    macApp,
    macProcesses: processes.map(name => `/${macApp}.app/Contents/MacOS/${name}`),
    macCli: `Contents/Resources/app/bin/${commands[0]}`,
    commands,
  }
}

function jetbrains(id: string, label: string, macApp: string, binary: string): EditorDefinition {
  return {
    id,
    label,
    family: 'jetbrains',
    macApp,
    macProcesses: [`/${macApp}.app/Contents/MacOS/${binary}`],
    macCli: `Contents/MacOS/${binary}`,
    commands: [binary],
  }
}

export const EDITORS: EditorDefinition[] = [
  vscodeLike('code', 'Visual Studio Code', 'Visual Studio Code', ['code'], ['Electron', 'Code']),
  vscodeLike('cursor', 'Cursor', 'Cursor', ['cursor'], ['Cursor']),
  vscodeLike('windsurf', 'Windsurf', 'Windsurf', ['windsurf']),
  vscodeLike('code-insiders', 'Visual Studio Code Insiders', 'Visual Studio Code - Insiders', ['code-insiders'], ['Electron']),
  vscodeLike('codium', 'VSCodium', 'VSCodium', ['codium', 'vscodium'], ['Electron']),
  vscodeLike('trae', 'Trae', 'Trae', ['trae']),
  vscodeLike('kiro', 'Kiro', 'Kiro', ['kiro']),
  vscodeLike('antigravity', 'Antigravity', 'Antigravity', ['antigravity']),
  {
    id: 'zed',
    label: 'Zed',
    family: 'zed',
    macApp: 'Zed',
    macProcesses: ['/Zed.app/Contents/MacOS/zed'],
    macCli: 'Contents/MacOS/cli',
    commands: ['zed'],
  },
  {
    id: 'sublime',
    label: 'Sublime Text',
    family: 'colon',
    macApp: 'Sublime Text',
    macProcesses: ['/Sublime Text.app/Contents/MacOS/sublime_text', '/Sublime Text.app/Contents/MacOS/Sublime Text'],
    macCli: 'Contents/SharedSupport/bin/subl',
    commands: ['subl'],
  },
  jetbrains('webstorm', 'WebStorm', 'WebStorm', 'webstorm'),
  jetbrains('idea', 'IntelliJ IDEA', 'IntelliJ IDEA', 'idea'),
  jetbrains('phpstorm', 'PhpStorm', 'PhpStorm', 'phpstorm'),
  jetbrains('pycharm', 'PyCharm', 'PyCharm', 'pycharm'),
  jetbrains('goland', 'GoLand', 'GoLand', 'goland'),
  jetbrains('rider', 'Rider', 'Rider', 'rider'),
  jetbrains('rubymine', 'RubyMine', 'RubyMine', 'rubymine'),
  jetbrains('clion', 'CLion', 'CLion', 'clion'),
]

export const AUTO_EDITOR = 'auto'

export function editorById(id: string) {
  return EDITORS.find(editor => editor.id === id) ?? null
}

export function editorArguments(editor: EditorDefinition, target: { workspace: string, file: string, line: number, column: number }): string[] {
  const { workspace, file, line, column } = target
  switch (editor.family) {
    case 'vscode':
      return [workspace, '-g', `${file}:${line}:${column}`]
    case 'jetbrains':
      return [workspace, '--line', String(line), '--column', String(column), file]
    case 'zed':
    case 'colon':
      return [workspace, `${file}:${line}:${column}`]
  }
}

export function detectRunningEditor(processList: string): { editor: EditorDefinition, executable: string } | null {
  const processes = processList.split('\n').map(line => line.trim()).filter(Boolean)
  for (const editor of EDITORS) {
    const executable = processes.find(process => editor.macProcesses.some(suffix => process.endsWith(suffix)) || editor.commands.includes(process))
    if (executable)
      return { editor, executable }
  }
  return null
}
