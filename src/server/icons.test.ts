import { describe, expect, it } from 'vitest'
import { fileIconName, folderIconName, renderIcon } from './icons'

describe('fileIconName', () => {
  it.each([
    ['proxy.ts', 'file-type-typescript'],
    ['proxy.spec.ts', 'file-type-testts'],
    ['AccountsFilterForm.tsx', 'file-type-reactts'],
    ['bot-card.stories.tsx', 'file-type-storybook'],
    ['Dockerfile', 'file-type-docker'],
    ['navigation.json', 'file-type-json'],
    ['report.spec.ts.snap', 'file-type-jest-snapshot'],
    ['unknown.zzz', 'default-file'],
  ])('maps %s to %s for the dark theme', (name, icon) => {
    expect(fileIconName(name, 'dark')).toBe(icon)
  })

  it('uses a light variant when one exists', () => {
    expect(fileIconName('navigation.json', 'light')).toBe('file-type-light-json')
    expect(fileIconName('proxy.ts', 'light')).toBe('file-type-typescript')
  })
})

describe('folderIconName', () => {
  it('maps known folders and open state', () => {
    expect(folderIconName('src', false, 'dark')).toBe('folder-type-src')
    expect(folderIconName('src', true, 'dark')).toBe('folder-type-src-opened')
    expect(folderIconName('frontend', false, 'dark')).toBe('default-folder')
  })
})

describe('renderIcon', () => {
  it('renders an svg document', () => {
    expect(renderIcon('file-type-typescript')).toMatch(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)
    expect(renderIcon('file-type-typescript')!.match(/xmlns=/g)).toHaveLength(1)
    expect(renderIcon('does-not-exist')).toBeNull()
  })
})
