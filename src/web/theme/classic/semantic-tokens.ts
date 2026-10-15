import { defineSemanticTokens } from '@pandacss/dev'

export const semanticTokens = defineSemanticTokens({
  colors: {
    bg: {
      canvas: { value: { base: '#eef1f4', _dark: '#0d1117' } },
      surface: { value: { base: '#ffffff', _dark: '#151b23' } },
      subtle: { value: { base: '#f6f8fa', _dark: '#1b222c' } },
      muted: { value: { base: '#eaeef2', _dark: '#252c36' } },
      emphasized: { value: { base: '#d8dee4', _dark: '#313945' } },
    },
    fg: {
      default: { value: { base: '#1f2328', _dark: '#f0f6fc' } },
      muted: { value: { base: '#4b5563', _dark: '#b1bac4' } },
      subtle: { value: { base: '#636c76', _dark: '#8b949e' } },
      onAccent: { value: '{colors.white}' },
    },
    border: {
      default: { value: { base: '#d1d9e0', _dark: '#3d444d' } },
      subtle: { value: { base: '#e3e8ed', _dark: '#2a313a' } },
      strong: { value: { base: '#b0bac4', _dark: '#56606b' } },
    },
    accent: {
      default: { value: { base: '{colors.violet.600}', _dark: '{colors.violet.500}' } },
      hover: { value: { base: '{colors.violet.700}', _dark: '{colors.violet.400}' } },
      subtle: { value: { base: '{colors.violet.50}', _dark: 'rgba(139, 92, 246, 0.14)' } },
      fg: { value: { base: '{colors.violet.700}', _dark: '{colors.violet.300}' } },
    },
    success: {
      fg: { value: { base: '{colors.green.700}', _dark: '{colors.green.400}' } },
      subtle: { value: { base: '{colors.green.50}', _dark: 'rgba(34, 197, 94, 0.12)' } },
      solid: { value: { base: '{colors.green.600}', _dark: '{colors.green.600}' } },
    },
    danger: {
      fg: { value: { base: '{colors.red.700}', _dark: '{colors.red.400}' } },
      subtle: { value: { base: '{colors.red.50}', _dark: 'rgba(239, 68, 68, 0.12)' } },
      solid: { value: { base: '{colors.red.600}', _dark: '{colors.red.600}' } },
    },
    warning: {
      fg: { value: { base: '{colors.amber.700}', _dark: '{colors.amber.400}' } },
      subtle: { value: { base: '{colors.amber.50}', _dark: 'rgba(245, 158, 11, 0.12)' } },
    },
  },
  shadows: {
    popover: {
      value: {
        base: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.12)',
        _dark: '0 1px 2px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.5)',
      },
    },
  },
})
