import { defineRecipe, defineSlotRecipe } from '@pandacss/dev'

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

const input = defineRecipe({
  className: 'input',
  base: {
    w: 'full',
    px: '3',
    fontSize: 'sm',
    bg: 'bg.surface',
    color: 'fg.default',
    borderWidth: '1px',
    borderColor: 'border.default',
    borderRadius: 'md',
    outline: 'none',
    _focus: { borderColor: 'accent.default', boxShadow: '0 0 0 3px color-mix(in srgb, var(--colors-accent-default) 18%, transparent)' },
    _placeholder: { color: 'fg.subtle' },
  },
  variants: {
    multiline: {
      true: { display: 'block', px: '2.5', py: '2.5', resize: 'vertical' },
      false: { h: '9' },
    },
    mono: {
      true: { fontFamily: 'mono' },
    },
  },
  defaultVariants: { multiline: false },
})

const card = defineRecipe({
  className: 'card',
  base: {
    bg: 'bg.surface',
    borderWidth: '1px',
    borderColor: 'border.default',
    borderRadius: 'lg',
  },
  variants: {
    tone: {
      neutral: {},
      accent: { borderColor: 'accent.default' },
    },
    floating: {
      true: { boxShadow: 'popover' },
    },
    ornate: {
      true: { borderRadius: 'xl' },
    },
  },
  defaultVariants: { tone: 'neutral' },
})

const tab = defineRecipe({
  className: 'tab',
  base: {
    position: 'relative',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2',
    fontWeight: 'medium',
    color: 'fg.muted',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    outline: 'none',
    borderRadius: 'md',
    _hover: { color: 'fg.default' },
    _focusVisible: { boxShadow: 'inset 0 0 0 2px token(colors.accent.default)' },
    '&[aria-selected=true]': { color: 'fg.default' },
    '&[aria-selected=true]::after': { content: '""', position: 'absolute', insetInline: '2', bottom: '-1px', h: '2px', borderRadius: 'full', bg: 'accent.default' },
  },
  variants: {
    size: {
      md: { h: '10', px: '3', fontSize: 'sm' },
      sm: { h: '8', px: '2.5', fontSize: 'xs' },
    },
    kind: {
      pill: {},
      line: {
        h: '9',
        px: '1',
        mr: '4',
        borderRadius: '0',
        borderBottomWidth: '2px',
        borderColor: 'transparent',
        _selected: { color: 'fg.default', borderColor: 'accent.default' },
        '&[aria-selected=true]::after': { display: 'none' },
      },
    },
  },
  defaultVariants: { size: 'md', kind: 'pill' },
})

const tabPanel = defineRecipe({
  className: 'tab-panel',
  base: {},
})

const hero = defineRecipe({
  className: 'hero',
  base: { display: 'none' },
})

const checkbox = defineRecipe({
  className: 'checkbox',
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    w: '4',
    h: '4',
    borderRadius: 'sm',
    borderWidth: '1.5px',
    borderColor: 'border.strong',
    bg: 'bg.surface',
    color: 'fg.onAccent',
    cursor: 'pointer',
    transition: 'background 120ms, border-color 120ms',
    _hover: { borderColor: 'accent.default' },
    _checked: { bg: 'success.solid', borderColor: 'success.solid' },
    '&[data-state=indeterminate]': { bg: 'warning.fg', borderColor: 'warning.fg' },
    '& svg': { w: '3', h: '3', strokeWidth: 3 },
  },
})

const tooltip = defineRecipe({
  className: 'tooltip',
  base: {
    bg: 'fg.default',
    color: 'bg.canvas',
    fontSize: 'xs',
    px: '2',
    py: '1',
    borderRadius: 'sm',
    boxShadow: 'popover',
    maxW: '64',
    zIndex: 'tooltip',
  },
})

const avatar = defineSlotRecipe({
  className: 'avatar',
  slots: ['root', 'image'],
  base: {
    root: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      borderRadius: 'full',
      overflow: 'hidden',
      bg: 'bg.emphasized',
      color: 'fg.muted',
      fontWeight: 'semibold',
      userSelect: 'none',
    },
    image: { w: 'full', h: 'full', objectFit: 'cover' },
  },
})

const skeleton = defineRecipe({
  className: 'skeleton',
  base: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 'sm',
    bg: 'bg.muted',
    animation: 'pulse',
  },
  variants: {
    shape: {
      line: {},
      circle: { borderRadius: 'full', animation: 'none' },
    },
    tone: {
      strong: {},
      soft: { bg: 'bg.subtle' },
    },
  },
  defaultVariants: { shape: 'line', tone: 'strong' },
})

const spinner = defineSlotRecipe({
  className: 'spinner',
  slots: ['root', 'wrap', 'glow', 'core'],
  base: {
    root: { flexShrink: 0, animation: 'spin' },
  },
})

const segmented = defineSlotRecipe({
  className: 'segmented',
  slots: ['root', 'indicator', 'item', 'itemText'],
  base: {
    root: {
      position: 'relative',
      display: 'inline-flex',
      p: '0.5',
      gap: '0.5',
      bg: 'bg.muted',
      borderRadius: 'md',
    },
    indicator: {
      bg: 'bg.surface',
      borderRadius: 'sm',
      boxShadow: 'xs',
      width: 'var(--width)',
      height: 'var(--height)',
      top: 'var(--top)',
      left: 'var(--left)',
      transition: 'left 150ms, width 150ms',
    },
    item: {
      position: 'relative',
      zIndex: 1,
      display: 'inline-flex',
      alignItems: 'center',
      h: '6',
      px: '2',
      fontSize: 'xs',
      fontWeight: 'medium',
      color: 'fg.muted',
      cursor: 'pointer',
      borderRadius: 'sm',
      _checked: { color: 'fg.default' },
      '& svg': { w: '3.5', h: '3.5' },
    },
    itemText: { display: 'inline-flex', alignItems: 'center', gap: '1' },
  },
})

const disclosure = defineSlotRecipe({
  className: 'disclosure',
  slots: ['header', 'icon'],
  base: {
    header: {
      position: 'sticky',
      top: '0',
      zIndex: 'sticky',
      display: 'flex',
      alignItems: 'center',
      gap: '2',
      h: '10',
      px: '2.5',
      bg: 'bg.subtle',
      borderWidth: '1px',
      borderColor: 'border.default',
      borderTopRadius: 'lg',
      cursor: 'pointer',
      userSelect: 'none',
    },
    icon: { color: 'fg.subtle', display: 'inline-flex', '& svg': { w: '4', h: '4' } },
  },
  variants: {
    open: {
      true: { header: { borderBottomRadius: '0' } },
      false: { header: { borderBottomRadius: 'lg' } },
    },
  },
  defaultVariants: { open: true },
})

const notice = defineRecipe({
  className: 'notice',
  base: {
    display: 'flex',
    flexDir: 'column',
    gap: '2',
    p: '3',
    borderRadius: 'lg',
    fontSize: 'sm',
  },
  variants: {
    tone: {
      warning: { bg: 'warning.subtle' },
      danger: { bg: 'danger.subtle' },
      success: { bg: 'success.subtle' },
    },
  },
  defaultVariants: { tone: 'warning' },
})

export const recipes = { button, badge, input, card, tab, tabPanel, hero, checkbox, tooltip, skeleton, notice }

export const slotRecipes = { avatar, spinner, segmented, disclosure }
