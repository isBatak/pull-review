import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import { shownLines } from '../../shared/line-map'
import { commentToolConfig, commentToolScript, commentToolTargets } from './comment-tool'

const dir = mkdtempSync(join(tmpdir(), 'comment-tool-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function call(id: number, args: Record<string, unknown>) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'add_review_comment', arguments: args } }
}

function runServer(messages: object[]) {
  const targets = join(dir, 'targets.json')
  const script = join(dir, 'server.mjs')
  writeFileSync(targets, JSON.stringify(commentToolTargets([{ path: 'src/a.ts', previousPath: null, diff: '@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n' }])))
  writeFileSync(script, commentToolScript(targets))
  const output = execFileSync(process.execPath, [script], { input: messages.map(message => JSON.stringify(message)).join('\n') })
  return String(output).trim().split('\n').map(line => JSON.parse(line) as { id: number, result?: { tools?: unknown[], isError?: boolean, content?: { text: string }[] }, error?: unknown })
}

describe('comment tool server', () => {
  it('answers the MCP handshake and lists the tool', () => {
    const [init, list] = runServer([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ])
    expect(init).toMatchObject({ id: 1, result: { protocolVersion: '2025-06-18' } })
    expect(list!.result!.tools).toHaveLength(1)
  })

  it('accepts lines shown in the diff and explains the others', () => {
    const [ok, missingLine, missingFile] = runServer([
      call(1, { path: 'src/a.ts', line: 2, body: 'Rename this.' }),
      call(2, { path: 'src/a.ts', line: 9, body: 'x' }),
      call(3, { path: 'src/b.ts', line: 1, body: 'x' }),
    ])
    expect(ok!.result!.isError).toBeUndefined()
    expect(missingLine!.result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('Lines shown in the diff: 1-3.') }] })
    expect(missingFile!.result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('Changed files: src/a.ts') }] })
  })

  it('points Claude at the script through the runner', () => {
    expect(JSON.parse(commentToolConfig(['/app/tjs', 'run'], '/ctx/server.mjs'))).toEqual({ mcpServers: { 'pull-review': { type: 'stdio', command: '/app/tjs', args: ['run', '/ctx/server.mjs'] } } })
  })
})

describe('shownLines', () => {
  it('lists the lines of each side shown in the diff', () => {
    expect(shownLines('@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n')).toEqual({ additions: [1, 2, 3], deletions: [1, 2, 3] })
  })
})
