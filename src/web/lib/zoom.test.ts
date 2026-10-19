import { describe, expect, it } from 'vitest'
import { codeMetrics, formatZoom, stepZoom } from './zoom'

describe('stepZoom', () => {
  it('moves to the next level', () => {
    expect(stepZoom(1, 1)).toBe(1.1)
    expect(stepZoom(1, -1)).toBe(0.9)
  })

  it('stops at the ends', () => {
    expect(stepZoom(1.5, 1)).toBe(1.5)
    expect(stepZoom(0.8, -1)).toBe(0.8)
  })
})

describe('codeMetrics', () => {
  it('keeps the line height in whole pixels', () => {
    expect(codeMetrics(1.25, 12, 20)).toEqual({ fontSize: 15, lineHeight: 25 })
    expect(codeMetrics(1.1, 12, 20)).toEqual({ fontSize: 13.2, lineHeight: 22 })
  })
})

describe('formatZoom', () => {
  it('shows a percent', () => {
    expect(formatZoom(1.25)).toBe('125%')
  })
})
