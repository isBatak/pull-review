import { defineConfig, defineRecipe, defineSemanticTokens } from '@pandacss/dev'
import basePreset from '@pandacss/preset-base'
import pandaPreset from '@pandacss/preset-panda'

const semanticTokens = defineSemanticTokens({
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
    tooltip: {
      bg: { value: { base: '#1f2328', _dark: '#262c36' } },
      fg: { value: { base: '#ffffff', _dark: '#f0f6fc' } },
      border: { value: { base: '#1f2328', _dark: '#3d444d' } },
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

const button = defineRecipe({
  className: 'button',
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1.5',
    flexShrink: 0,
    fontWeight: 'medium',
    borderRadius: 'md',
    borderWidth: '1px',
    borderColor: 'transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    transition: 'background 120ms, border-color 120ms, color 120ms',
    _disabled: { opacity: 0.5, cursor: 'not-allowed' },
    _focusVisible: { outline: '2px solid', outlineColor: 'accent.default', outlineOffset: '1px' },
    '& svg': { width: '1em', height: '1em' },
  },
  variants: {
    variant: {
      solid: {
        bg: 'accent.default',
        color: 'fg.onAccent',
        _hover: { _enabled: { bg: 'accent.hover' } },
      },
      outline: {
        bg: 'bg.surface',
        borderColor: 'border.default',
        color: 'fg.default',
        _hover: { _enabled: { bg: 'bg.muted' } },
      },
      ghost: {
        color: 'fg.muted',
        _hover: { _enabled: { bg: 'bg.muted', color: 'fg.default' } },
      },
      danger: {
        bg: 'danger.solid',
        color: 'white',
        _hover: { _enabled: { filter: 'brightness(1.08)' } },
      },
      success: {
        bg: 'success.solid',
        color: 'fg.onAccent',
        _hover: { _enabled: { filter: 'brightness(1.08)' } },
      },
    },
    size: {
      xs: { h: '6', px: '2', fontSize: 'xs' },
      sm: { h: '7', px: '2.5', fontSize: 'xs' },
      md: { h: '8', px: '3', fontSize: 'sm' },
    },
    iconOnly: {
      true: { px: '0', aspectRatio: '1' },
    },
  },
  defaultVariants: { variant: 'outline', size: 'sm' },
})

const badge = defineRecipe({
  className: 'badge',
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '1',
    px: '1.5',
    h: '5',
    borderRadius: 'sm',
    fontSize: '2xs',
    fontWeight: 'semibold',
    lineHeight: '1',
    whiteSpace: 'nowrap',
  },
  variants: {
    tone: {
      neutral: { bg: 'bg.muted', color: 'fg.muted' },
      accent: { bg: 'accent.subtle', color: 'accent.fg' },
      success: { bg: 'success.subtle', color: 'success.fg' },
      danger: { bg: 'danger.subtle', color: 'danger.fg' },
      warning: { bg: 'warning.subtle', color: 'warning.fg' },
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export default defineConfig({
  preflight: true,
  presets: [basePreset, pandaPreset],
  include: ['./src/web/**/*.{ts,tsx}'],
  exclude: [],
  outdir: 'styled-system',
  jsxFramework: 'react',
  conditions: {
    extend: {
      dark: '.dark &',
      checked: '&:is([data-state=checked], [aria-checked=true])',
    },
  },
  globalCss: {
    'html, body': {
      bg: 'bg.canvas',
      color: 'fg.default',
      fontFamily: 'body',
      fontSize: 'sm',
      lineHeight: '1.5',
      WebkitFontSmoothing: 'antialiased',
    },
    '::selection': { bg: 'accent.subtle' },
  },
  theme: {
    extend: {
      tokens: {
        fonts: {
          body: { value: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
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
      },
      keyframes: {
        shimmer: {
          from: { backgroundPosition: '100% 0' },
          to: { backgroundPosition: '-100% 0' },
        },
      },
      semanticTokens,
      recipes: { button, badge },
    },
  },
})
