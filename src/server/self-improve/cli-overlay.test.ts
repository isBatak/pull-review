import { describe, expect, it } from 'vitest'
import { cliOverlayRoot, openFolderCommand } from './cli-overlay'

describe('the command line overlay', () => {
  it('lives in the app support folder on macOS and the data folder elsewhere', () => {
    expect(cliOverlayRoot('/Users/me', 'darwin', undefined)).toBe('/Users/me/Library/Application Support/dev.pull-review.app/cli-overlay')
    expect(cliOverlayRoot('/home/me', 'linux', undefined)).toBe('/home/me/.local/share/pull-review/cli-overlay')
    expect(cliOverlayRoot('/home/me', 'linux', '/data')).toBe('/data/pull-review/cli-overlay')
  })

  it('opens folders with the system tool', () => {
    expect(openFolderCommand('darwin')).toBe('open')
    expect(openFolderCommand('linux')).toBe('xdg-open')
  })
})
