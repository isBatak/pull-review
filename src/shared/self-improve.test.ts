import { describe, expect, it } from 'vitest'
import tinyConfig from '../../tinyjs.json'
import { APP_OVERLAY_ROOT, overlayPageUrl } from './self-improve'

describe('self-improve paths', () => {
  it('lets the window read the overlay folder', () => {
    expect(tinyConfig.readAccess).toBe(`~/${APP_OVERLAY_ROOT}`)
  })

  it('points the window at the overlay page', () => {
    expect(overlayPageUrl('/Users/me/Library/Application Support/x/overlay/1.0.0')).toBe('file:///Users/me/Library/Application%20Support/x/overlay/1.0.0/build/app-web/index.html')
  })
})
