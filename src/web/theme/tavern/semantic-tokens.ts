import { defineSemanticTokens } from '@pandacss/dev'

export const semanticTokens = defineSemanticTokens({
  colors: {
    bg: {
      canvas: { value: '#120d09' },
      surface: { value: '#1d1611' },
      subtle: { value: '#251c15' },
      muted: { value: '#32261c' },
      emphasized: { value: '#443427' },
    },
    fg: {
      default: { value: '#f3e7c4' },
      muted: { value: '#d2c19a' },
      subtle: { value: '#9e8c6c' },
      onAccent: { value: '#1a1009' },
    },
    border: {
      default: { value: '#4d3d2d' },
      subtle: { value: '#33281e' },
      strong: { value: '#7a6448' },
    },
    accent: {
      default: { value: '#d4a853' },
      hover: { value: '#e6bf6c' },
      subtle: { value: 'rgba(212, 168, 83, 0.16)' },
      fg: { value: '#f0cd7a' },
    },
    success: {
      fg: { value: '#9cc76a' },
      subtle: { value: 'rgba(124, 170, 72, 0.16)' },
      solid: { value: '#86b24f' },
    },
    danger: {
      fg: { value: '#ea7a5f' },
      subtle: { value: 'rgba(200, 70, 45, 0.18)' },
      solid: { value: '#dd6448' },
    },
    warning: {
      fg: { value: '#f0a94a' },
      subtle: { value: 'rgba(230, 150, 50, 0.16)' },
    },
  },
  shadows: {
    popover: { value: '0 12px 32px rgba(0, 0, 0, 0.7)' },
  },
})
