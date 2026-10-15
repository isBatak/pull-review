import { defineTokens } from '@pandacss/dev'

export const tokens = defineTokens({
  fonts: {
    body: { value: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
    heading: { value: '{fonts.body}' },
    mono: { value: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace' },
  },
  fontSizes: {
    '2xs': { value: '0.6875rem' },
  },
  zIndex: {
    sticky: { value: 10 },
    overlay: { value: 40 },
    modal: { value: 50 },
    popover: { value: 60 },
    tooltip: { value: 70 },
  },
})
