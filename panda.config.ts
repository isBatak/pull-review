import { defineConfig } from '@pandacss/dev'
import basePreset from '@pandacss/preset-base'
import pandaPreset from '@pandacss/preset-panda'
import { themeConditions, themeGlobalCss, themeKeyframes, themeRecipes, themeSemanticTokens, themeSlotRecipes, themeStaticCss, themeTokens, themeVariants } from './src/web/theme'

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
      ...themeConditions,
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
    ...themeGlobalCss,
  },
  themes: themeVariants,
  staticCss: themeStaticCss,
  theme: {
    extend: {
      tokens: themeTokens,
      semanticTokens: themeSemanticTokens,
      keyframes: themeKeyframes,
      recipes: themeRecipes,
      slotRecipes: themeSlotRecipes,
    },
  },
})
