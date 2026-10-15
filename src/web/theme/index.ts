import { defineThemeVariant } from '@pandacss/dev'
import * as classic from './classic'
import { scopeRecipes, scopeSlotRecipes } from './merge'
import * as tavern from './tavern'

export const themeConditions = {
  tavern: '[data-panda-theme=tavern] &',
}

export const themeTokens = classic.tokens
export const themeSemanticTokens = classic.semanticTokens
export const themeKeyframes = tavern.keyframes
export const themeRecipes = scopeRecipes(classic.recipes, tavern.recipes, '_tavern')
export const themeSlotRecipes = scopeSlotRecipes(classic.slotRecipes, tavern.slotRecipes, '_tavern')
export const themeGlobalCss = tavern.globalCss

export const themeVariants = {
  tavern: defineThemeVariant({ tokens: tavern.tokens, semanticTokens: tavern.semanticTokens }),
}

export const themeStaticCss = {
  themes: Object.keys(themeVariants),
  recipes: {
    button: [{ frame: ['true'] }],
    badge: [{ shape: ['*'], faction: ['*'] }],
    tooltip: [{ rarity: ['*'] }],
    tab: [{ faction: ['*'] }],
    tabPanel: [{ faction: ['*'] }],
    hero: [{ faction: ['*'] }],
    checkbox: [{ faction: ['*'] }],
    skeleton: [{ faction: ['*'] }],
    notice: [{ faction: ['*'] }],
    avatar: [{ faction: ['*'] }],
    disclosure: [{ icon: ['*'] }],
  },
}
