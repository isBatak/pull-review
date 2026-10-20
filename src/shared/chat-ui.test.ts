import { createParser } from '@openuidev/lang-core'
import { describe, expect, it } from 'vitest'
import { buildChatUiPrompt, createChatUiLibrary } from './chat-ui'

const library = createChatUiLibrary<null>({ Stack: null, Callout: null, RiskTable: null, FileList: null, Checklist: null, MergeStatus: null, FollowUps: null })
const parse = (source: string) => createParser(library.toJSONSchema(), library.root).parse(source)

describe('chat UI catalog', () => {
  it('lists every component in the prompt and asks for openui-lang fences', () => {
    const prompt = buildChatUiPrompt()
    for (const name of ['Stack(', 'Callout(', 'RiskTable(', 'FileList(', 'Checklist(', 'MergeStatus(', 'FollowUps('])
      expect(prompt).toContain(name)
    expect(prompt).toContain('```openui-lang')
    expect(prompt).not.toContain('Inline Mode')
  })

  it('parses the examples it shows Claude without errors', () => {
    const result = parse([
      'root = Stack([risks, status, next])',
      'risks = RiskTable([{area: "Session refresh", level: "high", reason: "Retries can loop", path: "src/auth/refresh.ts", line: 42}])',
      'status = MergeStatus()',
      'next = FollowUps(["Which tests cover the retry?"])',
    ].join('\n'))
    expect(result.meta.errors).toEqual([])
    expect(result.root?.typeName).toBe('Stack')
    const children = result.root?.props.children as { typeName: string, props: Record<string, unknown> }[]
    expect(children.map(child => child.typeName)).toEqual(['RiskTable', 'MergeStatus', 'FollowUps'])
    expect(children[0]!.props.rows).toEqual([{ area: 'Session refresh', level: 'high', reason: 'Retries can loop', path: 'src/auth/refresh.ts', line: 42 }])
  })

  it('reports components that are not in the catalog', () => {
    const result = parse('root = Stack([chart])\nchart = BarChart([1, 2])')
    expect(result.meta.errors.map(error => error.code)).toContain('unknown-component')
  })
})
