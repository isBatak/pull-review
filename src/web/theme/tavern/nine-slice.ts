type Sides = [top: number, right: number, bottom: number, left: number]

interface Frame {
  slice: Sides
  border?: Sides
  fill?: boolean
  repeat?: 'stretch' | 'round'
}

export const FRAMES = {
  button: { slice: [32, 32, 32, 32] },
  buttonSmall: { slice: [30, 30, 30, 30] },
  buttonFramed: { slice: [100, 200, 100, 200] },
  buttonFramedSmall: { slice: [60, 210, 60, 210] },
  input: { slice: [75, 75, 75, 75], fill: false, repeat: 'round' },
  panel: { slice: [60, 60, 60, 60] },
  plaque: { slice: [66, 210, 62, 210], border: [66, 50, 62, 48], repeat: 'round' },
  accordionHeader: { slice: [10, 300, 100, 300], border: [10, 10, 24, 10] },
  tab: { slice: [24, 24, 24, 24] },
  tabPanel: { slice: [32, 32, 32, 32], repeat: 'round' },
  tabPanelFaction: { slice: [100, 100, 100, 100], border: [48, 48, 48, 48], repeat: 'round' },
  scroll: { slice: [20, 12, 20, 12] },
} satisfies Record<string, Frame>

function px(sides: Sides, scale: number) {
  return sides.map(side => `${Math.round(side * scale * 10) / 10}px`).join(' ')
}

export function nineSlice(frame: Frame, source: string, scale: number) {
  return {
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '0',
    borderWidth: px(frame.border ?? frame.slice, scale),
    borderImageSource: source,
    borderImageSlice: `${frame.slice.join(' ')}${frame.fill === false ? '' : ' fill'}`,
    borderImageWidth: px(frame.slice, scale),
    borderImageRepeat: frame.repeat ?? 'stretch',
  }
}

export function nineSliceVars(frame: Frame, scale: number) {
  return {
    '--wc-slice-slice': `${frame.slice.join(' ')}${frame.fill === false ? '' : ' fill'}`,
    '--wc-slice-width': px(frame.slice, scale),
    '--wc-slice-border': px(frame.border ?? frame.slice, scale),
    '--wc-slice-repeat': frame.repeat ?? 'stretch',
  }
}
