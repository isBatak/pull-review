import type { DiffFile } from './types'
import { describe, expect, it } from 'vitest'
import { buildSymbolResult, createClassifier, definitionKind, isSearchableSymbol, parseGitGrep, searchDiffFiles } from './symbols'

describe('isSearchableSymbol', () => {
  it('accepts identifiers and rejects keywords and punctuation', () => {
    expect(isSearchableSymbol('transport')).toBe(true)
    expect(isSearchableSymbol('$store')).toBe(true)
    expect(isSearchableSymbol('const')).toBe(false)
    expect(isSearchableSymbol('a.b')).toBe(false)
    expect(isSearchableSymbol('42')).toBe(false)
  })
})

describe('createClassifier', () => {
  const classify = createClassifier('transport')

  it.each([
    'export async function transport(method: string): Promise<Response> {',
    'const transport = createTransport()',
    'export const transport = async (path: string) => {',
    '  transport(method: string, path: string): Promise<Response> {',
    '  transport: (path) => fetch(path),',
    'class transport {',
    'def transport(self):',
    'func (c *Client) transport(path string) error {',
  ])('finds a definition in %s', (text) => {
    expect(classify(text)).toBe('definition')
  })

  it.each([
    'const response = await transport(\'GET\', path)',
    'import { transport } from \'./platform\'',
    'return transport',
    'transports.push(x)',
  ])('treats %s as a reference', (text) => {
    expect(classify(text)).toBe('reference')
  })
})

describe('parseGitGrep', () => {
  it('reads path, line, column and text', () => {
    const output = [
      'abc123:src/web/lib/platform.ts:34:23:export async function transport(method: string) {',
      'abc123:src/web/lib/api.ts:50:26:  const response = await transport(',
      '',
    ].join('\n')
    const { hits } = parseGitGrep(output, 'abc123', 'transport')
    expect(hits).toEqual([
      { path: 'src/web/lib/platform.ts', line: 34, column: 23, text: 'export async function transport(method: string) {', kind: 'definition' },
      { path: 'src/web/lib/api.ts', line: 50, column: 26, text: 'const response = await transport(', kind: 'reference' },
    ])
  })
})

describe('searchDiffFiles', () => {
  const file = {
    path: 'a.ts',
    status: 'modified',
    diff: ['@@ -10,3 +10,4 @@', ' const x = 1', '-old(transport)', '+function transport() {', '+  return transport2', ' }'].join('\n'),
  } as DiffFile

  it('searches new-side lines with whole-word matches', () => {
    expect(searchDiffFiles([file], 'transport').hits).toEqual([
      { path: 'a.ts', line: 11, column: 10, text: 'function transport() {', kind: 'definition' },
    ])
  })
})

describe('buildSymbolResult', () => {
  it('splits definitions from references and puts changed files first', () => {
    const result = buildSymbolResult('x', 'repository', {
      truncated: false,
      hits: [
        { path: 'b.ts', line: 1, column: 1, text: 'x()', kind: 'reference' },
        { path: 'z.ts', line: 5, column: 1, text: 'x()', kind: 'reference' },
        { path: 'a.ts', line: 3, column: 1, text: 'const x = 1', kind: 'definition' },
      ],
    }, new Set(['z.ts']))
    expect(result.definitions.map(hit => hit.path)).toEqual(['a.ts'])
    expect(result.references.map(hit => hit.path)).toEqual(['z.ts', 'b.ts'])
  })
})

describe('definitionKind', () => {
  it.each([
    ['export async function transport(method: string) {', 'function'],
    ['export const transport = async () => {', 'const'],
    ['export interface Transport {', 'interface'],
    ['export class Transport {', 'class'],
    ['type Transport = string', 'type'],
    ['  transport(method: string) {', 'function'],
  ])('labels %s as %s', (text, kind) => {
    expect(definitionKind(text, text.includes('Transport') ? 'Transport' : 'transport')).toBe(kind)
  })
})
