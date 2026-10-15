import type { defineRecipe, defineSlotRecipe, defineStyles } from '@pandacss/dev'

type RecipeConfig = ReturnType<typeof defineRecipe>
type SlotRecipeConfig = ReturnType<typeof defineSlotRecipe>
type SystemStyleObject = ReturnType<typeof defineStyles>
type StyleMap = Record<string, unknown>

export interface ThemeRecipeOverride {
  base?: SystemStyleObject
  variants?: Record<string, Record<string, SystemStyleObject>>
}

export interface ThemeSlotRecipeOverride {
  base?: Record<string, SystemStyleObject>
  variants?: Record<string, Record<string, Record<string, SystemStyleObject>>>
}

export type ThemeRecipeOverrides = Record<string, ThemeRecipeOverride>
export type ThemeSlotRecipeOverrides = Record<string, ThemeSlotRecipeOverride>

function scope(style: StyleMap | undefined, override: StyleMap | undefined, condition: string) {
  return override ? { ...style, [condition]: override } : style
}

function scopeSlots(styles: Record<string, StyleMap> | undefined, overrides: Record<string, StyleMap> | undefined, condition: string) {
  const scoped: Record<string, StyleMap | undefined> = { ...styles }
  for (const [slot, override] of Object.entries(overrides ?? {}))
    scoped[slot] = scope(styles?.[slot], override, condition)
  return scoped
}

function scopeVariants<T>(variants: Record<string, Record<string, T>> | undefined, overrides: Record<string, Record<string, T>> | undefined, apply: (style: T | undefined, override: T) => T) {
  const scoped: Record<string, Record<string, T>> = { ...variants }
  for (const [variant, values] of Object.entries(overrides ?? {})) {
    scoped[variant] = { ...scoped[variant] }
    for (const [value, override] of Object.entries(values))
      scoped[variant][value] = apply(scoped[variant][value], override)
  }
  return scoped
}

export function scopeRecipes<T extends Record<string, RecipeConfig>>(recipes: T, overrides: ThemeRecipeOverrides, condition: string): T {
  const scoped: Record<string, RecipeConfig> = { ...recipes }
  for (const [name, override] of Object.entries(overrides)) {
    const recipe = recipes[name]
    if (!recipe)
      throw new Error(`Theme overrides an unknown recipe: ${name}`)
    scoped[name] = {
      ...recipe,
      base: scope(recipe.base as StyleMap, override.base as StyleMap, condition),
      variants: scopeVariants(recipe.variants as Record<string, Record<string, StyleMap>>, override.variants as Record<string, Record<string, StyleMap>>, (style, value) => scope(style, value, condition)!),
    } as RecipeConfig
  }
  return scoped as T
}

export function scopeSlotRecipes<T extends Record<string, SlotRecipeConfig>>(recipes: T, overrides: ThemeSlotRecipeOverrides, condition: string): T {
  const scoped: Record<string, SlotRecipeConfig> = { ...recipes }
  for (const [name, override] of Object.entries(overrides)) {
    const recipe = recipes[name]
    if (!recipe)
      throw new Error(`Theme overrides an unknown slot recipe: ${name}`)
    scoped[name] = {
      ...recipe,
      base: scopeSlots(recipe.base as Record<string, StyleMap>, override.base as Record<string, StyleMap>, condition),
      variants: scopeVariants(recipe.variants as Record<string, Record<string, Record<string, StyleMap>>>, override.variants as Record<string, Record<string, Record<string, StyleMap>>>, (styles, value) => scopeSlots(styles, value, condition) as Record<string, StyleMap>),
    } as SlotRecipeConfig
  }
  return scoped as T
}
