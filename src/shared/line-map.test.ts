import { describe, expect, it } from 'vitest'
import { countChanges, createLineMap, sideForPosition } from './line-map'

const diff = [
  '@@ -1,4 +1,5 @@',
  ' a',
  '-b',
  '+B',
  '+B2',
  ' c',
  ' d',
  '@@ -20,3 +21,2 @@',
  ' x',
  '-y',
  ' z',
  '\\ No newline at end of file',
].join('\n')

describe('countChanges', () => {
  it('counts added and removed lines', () => {
    expect(countChanges(diff)).toEqual({ additions: 2, deletions: 2 })
  })
})

describe('createLineMap', () => {
  const map = createLineMap(diff)

  it('maps added and removed lines to one side only', () => {
    expect(map.resolve('additions', 2)).toEqual({ oldLine: null, newLine: 2 })
    expect(map.resolve('deletions', 2)).toEqual({ oldLine: 2, newLine: null })
    expect(map.resolve('deletions', 21)).toEqual({ oldLine: 21, newLine: null })
  })

  it('maps context lines inside hunks to both sides', () => {
    expect(map.resolve('additions', 4)).toEqual({ oldLine: 3, newLine: 4 })
    expect(map.resolve('deletions', 4)).toEqual({ oldLine: 4, newLine: 5 })
    expect(map.resolve('additions', 22)).toEqual({ oldLine: 22, newLine: 22 })
  })

  it('maps expanded lines between and after hunks using the running offset', () => {
    expect(map.resolve('additions', 10)).toEqual({ oldLine: 9, newLine: 10 })
    expect(map.resolve('deletions', 9)).toEqual({ oldLine: 9, newLine: 10 })
    expect(map.resolve('additions', 40)).toEqual({ oldLine: 40, newLine: 40 })
  })
})

describe('sideForPosition', () => {
  it('prefers the new side', () => {
    expect(sideForPosition(3, 4)).toEqual({ side: 'additions', line: 4 })
    expect(sideForPosition(3, null)).toEqual({ side: 'deletions', line: 3 })
    expect(sideForPosition(null, null)).toBeNull()
  })
})
