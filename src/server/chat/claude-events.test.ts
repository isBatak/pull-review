import type { ChatMessage } from '../../shared/chat'
import { describe, expect, it } from 'vitest'
import { applyStreamLine, describeToolInput, explainExit } from './claude-events'

function reply(): ChatMessage {
  return { id: '1', role: 'assistant', text: '', contexts: [], tools: [], status: 'streaming', error: null }
}

const line = (value: unknown) => JSON.stringify(value)

describe('applyStreamLine', () => {
  it('appends streamed text', () => {
    const message = reply()
    applyStreamLine(message, line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } } }))
    applyStreamLine(message, line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: ' there' } } }))
    expect(message.text).toBe('Hello there')
  })

  it('records tool use with a path relative to the workspace', () => {
    const message = reply()
    applyStreamLine(message, line({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', id: 't1', name: 'Read' } } }))
    applyStreamLine(message, line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/work/src/a.ts', offset: 40 } }] } }), { repo: '/work', context: '/ctx' })
    expect(message.tools).toEqual([{ id: 't1', name: 'Read', detail: 'src/a.ts', root: 'repo', line: 40 }])
  })

  it('tells repository files from context files and other paths', () => {
    const roots = { repo: '/work', context: '/ctx' }
    expect(describeToolInput({ file_path: '/ctx/diffs/a.ts.diff' }, roots)).toEqual({ detail: 'diffs/a.ts.diff', root: 'context', line: null })
    expect(describeToolInput({ file_path: '/home/me/.claude/skills/ds/SKILL.md' }, roots)).toEqual({ detail: '/home/me/.claude/skills/ds/SKILL.md', root: null, line: null })
    expect(describeToolInput({ pattern: 'DS|libs', path: '/work/libs' }, roots)).toEqual({ detail: 'DS|libs', root: null, line: null })
  })

  it('separates text blocks around tool calls', () => {
    const message = reply()
    message.text = 'First.'
    applyStreamLine(message, line({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text', text: '' } } }))
    expect(message.text).toBe('First.\n\n')
  })

  it('finishes on a successful result', () => {
    const message = reply()
    message.text = 'Done.\n\n'
    const outcome = applyStreamLine(message, line({ type: 'result', subtype: 'success', is_error: false, result: 'Done.' }))
    expect(outcome.finished).toBe(true)
    expect(message).toMatchObject({ status: 'done', text: 'Done.' })
  })

  it('reports an error result', () => {
    const message = reply()
    applyStreamLine(message, line({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['Boom'] }))
    expect(message).toMatchObject({ status: 'error', error: 'Boom' })
  })

  it('keeps comment tool calls and marks the ones the tool rejected', () => {
    const message = reply()
    const use = (id: string, line: number) => ({ type: 'tool_use', id, name: 'mcp__pull-review__add_review_comment', input: { path: 'src/a.ts', line, body: 'Rename this.' } })
    applyStreamLine(message, JSON.stringify({ type: 'assistant', message: { content: [use('t1', 9), use('t2', 2)] } }))
    applyStreamLine(message, JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'not in the diff' }, { type: 'tool_result', tool_use_id: 't2', content: 'ok' }] } }))
    expect(message.tools).toMatchObject([
      { id: 't1', detail: 'src/a.ts:9', failed: true },
      { id: 't2', detail: 'src/a.ts:2', comment: { path: 'src/a.ts', side: 'additions', line: 2, body: 'Rename this.' } },
    ])
    expect(message.tools[1]!.failed).toBeUndefined()
  })

  it('ignores lines that are not JSON', () => {
    expect(applyStreamLine(reply(), 'not json')).toEqual({ changed: false, finished: false })
  })
})

describe('explainExit', () => {
  it('explains a missing login', () => {
    expect(explainExit(1, 'Not logged in · Please run /login')).toMatch(/not signed in/)
  })

  it('includes stderr otherwise', () => {
    expect(explainExit(2, 'oops')).toBe('Claude Code exited with code 2: oops')
  })
})
