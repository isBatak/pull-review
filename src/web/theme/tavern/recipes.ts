import type { defineStyles } from '@pandacss/dev'
import type { ThemeRecipeOverrides, ThemeSlotRecipeOverrides } from '../merge'
import { factionVariants } from './factions'
import { FRAMES, nineSlice } from './nine-slice'

type SystemStyleObject = ReturnType<typeof defineStyles>

const goldGlow = '0 0 10px rgba(240, 205, 122, 0.45)'

function buttonFrame(set: 'normal' | 'framed', frame: typeof FRAMES[keyof typeof FRAMES], source: string, scale: number) {
  const sliced = nineSlice(frame, source, scale)
  return {
    [`--wc-btn-${set}-src`]: source,
    [`--wc-btn-${set}-slice`]: sliced.borderImageSlice,
    [`--wc-btn-${set}-width`]: sliced.borderImageWidth,
  }
}

function useButtonFrame(set: 'normal' | 'framed') {
  return {
    '--wc-btn-src': `var(--wc-btn-${set}-src)`,
    '--wc-btn-slice': `var(--wc-btn-${set}-slice)`,
    '--wc-btn-width': `var(--wc-btn-${set}-width)`,
  } as SystemStyleObject
}

const framedBadge = nineSlice(FRAMES.buttonFramed, 'var(--wc-button-frame)', 0.03)

function rarity(hue: string, glow: number) {
  return {
    borderColor: `hsl(${hue})`,
    boxShadow: `inset 0 0 ${glow}px hsl(${hue} / 0.12), 0 4px 20px hsl(0 0% 0% / 0.7)`,
  }
}

const commandButton = {
  borderStyle: 'solid',
  borderColor: 'transparent',
  borderRadius: '0',
  borderWidth: 'var(--wc-btn-width)',
  borderImageSource: 'var(--wc-btn-src)',
  borderImageSlice: 'var(--wc-btn-slice)',
  borderImageWidth: 'var(--wc-btn-width)',
  borderImageRepeat: 'stretch',
  bg: 'transparent',
  color: '#fff',
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
}

const scroll = nineSlice(FRAMES.scroll, 'var(--wc-scroll)', 0.3)

const socket = 'radial-gradient(circle at 40% 35%, hsl(35 8% 18%) 0%, hsl(35 6% 10%) 70%, hsl(35 4% 6%) 100%)'
const gem = 'radial-gradient(circle at 45% 40%, hsl(48 100% 78%) 0%, hsl(43 100% 60%) 18%, hsl(38 90% 45%) 30%, hsl(30 80% 35%) 36%, transparent 40%)'

export const recipes: ThemeRecipeOverrides = {
  button: {
    base: {
      ...buttonFrame('normal', FRAMES.button, 'var(--wc-button)', 0.16),
      ...buttonFrame('framed', FRAMES.buttonFramed, 'var(--wc-button-frame)', 0.06),
      ...useButtonFrame('normal'),
      fontFamily: 'heading',
      letterSpacing: '0.04em',
      _active: { _enabled: { transform: 'scale(0.95)', filter: 'brightness(0.75)' } },
    },
    variants: {
      variant: {
        solid: {
          ...commandButton,
          _hover: { _enabled: { bg: 'transparent', filter: 'brightness(1.1)' } },
        },
        success: {
          ...commandButton,
          filter: 'hue-rotate(-100deg) saturate(0.85)',
          _hover: { _enabled: { filter: 'hue-rotate(-100deg) saturate(0.85) brightness(1.1)' } },
        },
        outline: {
          ...nineSlice(FRAMES.input, 'var(--wc-input)', 0.04),
          bg: 'bg.subtle',
          _hover: { _enabled: { bg: 'bg.muted', color: 'accent.fg' } },
        },
        ghost: {
          _hover: { _enabled: { bg: 'bg.muted', color: 'accent.fg' } },
        },
      },
      size: {
        xs: { ...buttonFrame('normal', FRAMES.buttonSmall, 'var(--wc-button-sm)', 0.1), ...buttonFrame('framed', FRAMES.buttonFramedSmall, 'var(--wc-button-frame-sm)', 0.05) } as SystemStyleObject,
        sm: { ...buttonFrame('normal', FRAMES.buttonSmall, 'var(--wc-button-sm)', 0.13), ...buttonFrame('framed', FRAMES.buttonFramedSmall, 'var(--wc-button-frame-sm)', 0.06) } as SystemStyleObject,
      },
      frame: {
        true: useButtonFrame('framed'),
      },
    },
  },
  badge: {
    base: {
      ...nineSlice(FRAMES.button, 'var(--wc-button)', 0.07),
      fontFamily: 'heading',
      letterSpacing: '0.03em',
      bg: 'transparent',
    },
    variants: {
      tone: {
        neutral: { bg: 'transparent', color: '#e2e8f0' },
        accent: { ...framedBadge, bg: 'transparent', color: '#fef3c7', textShadow: '0 0 8px rgba(251, 191, 36, 0.4)' },
        danger: { ...framedBadge, bg: 'transparent', color: '#fecaca', textShadow: '0 0 8px rgba(239, 68, 68, 0.4)', filter: 'brightness(0.75) hue-rotate(320deg)' },
        success: { ...framedBadge, bg: 'transparent', color: '#fef3c7', filter: 'hue-rotate(-100deg) saturate(0.85)' },
        warning: { ...framedBadge, bg: 'transparent', color: '#fef3c7', filter: 'hue-rotate(170deg) saturate(1.2)' },
      },
      shape: {
        default: {},
        shield: { borderBottomWidth: '5px' },
        banner: { clipPath: 'polygon(0% 0%, 100% 0%, 100% 85%, 50% 100%, 0% 85%)', pb: '1' },
      },
      faction: {
        none: {},
        alliance: { color: '#dbeafe', textShadow: '0 0 10px rgba(59, 130, 246, 0.5)' },
        horde: { color: '#fee2e2', textShadow: '0 0 10px rgba(239, 68, 68, 0.5)' },
      },
    },
  },
  input: {
    base: {
      ...nineSlice(FRAMES.input, 'var(--wc-input)', 0.07),
      bg: 'bg.canvas',
      _focus: { borderColor: 'transparent', boxShadow: `0 0 0 1px token(colors.accent.default), ${goldGlow}` },
    },
    variants: {
      multiline: {
        true: { ...nineSlice(FRAMES.panel, 'var(--wc-textarea)', 0.2), bg: 'transparent', px: '3', py: '2' },
      },
    },
  },
  card: {
    base: {
      ...nineSlice(FRAMES.panel, 'var(--wc-dropdown)', 0.2),
      bg: 'transparent',
    },
    variants: {
      tone: {
        accent: { boxShadow: `0 0 0 1px rgba(212, 168, 83, 0.45), ${goldGlow}` },
      },
      ornate: {
        true: nineSlice(FRAMES.plaque, 'var(--wc-card)', 0.42),
      },
    },
  },
  tab: {
    base: {
      minW: '24',
      justifyContent: 'center',
      fontFamily: 'heading',
      letterSpacing: '0.04em',
      color: 'var(--wc-tab-fg)',
      ...nineSlice(FRAMES.tab, 'var(--wc-tab)', 0.25),
      bg: 'transparent',
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
      _hover: { color: 'var(--wc-tab-fg)', filter: 'brightness(1.25)' },
      _focusVisible: { boxShadow: 'none', outline: '2px solid hsl(45 100% 60%)', outlineOffset: '2px' },
      '&[aria-selected=true]': { color: 'var(--wc-tab-fg)', borderImageSource: 'var(--wc-tab-active)' },
      '&[aria-selected=true]::after': { display: 'none' },
    },
    variants: {
      kind: {
        line: { h: '9', px: '3', mr: '1', _selected: { color: 'var(--wc-tab-fg)' } },
      },
      faction: factionVariants(),
    },
  },
  tabPanel: {
    base: {
      borderStyle: 'solid',
      borderColor: 'transparent',
      borderWidth: 'var(--wc-tab-content-border)',
      borderImageSource: 'var(--wc-tab-content)',
      borderImageSlice: 'var(--wc-tab-content-slice)',
      borderImageWidth: 'var(--wc-tab-content-width)',
      borderImageRepeat: 'var(--wc-tab-content-repeat)',
      p: '4',
      mt: '2',
      color: '#f3e7c4',
    },
    variants: {
      faction: factionVariants(),
    },
  },
  hero: {
    base: {
      display: 'block',
      w: '40',
      h: '40',
      mx: 'auto',
      mb: '2',
      background: 'var(--wc-hero) center / contain no-repeat',
      filter: 'drop-shadow(0 6px 16px rgba(0, 0, 0, 0.7))',
    },
    variants: {
      faction: factionVariants(),
    },
  },
  checkbox: {
    base: {
      w: '4.5',
      h: '4.5',
      borderWidth: '0',
      borderRadius: '0',
      background: 'var(--wc-checkbox) center / contain no-repeat',
      _hover: { filter: 'brightness(1.25)' },
      _focusVisible: { outline: 'none', boxShadow: '0 0 0 3px hsl(45 100% 60% / 0.4)' },
      _checked: { background: 'var(--wc-checkbox-checked) center / contain no-repeat' },
      '&[data-state=indeterminate]': { background: 'var(--wc-checkbox-checked) center / contain no-repeat', opacity: 0.6 },
      '& svg': { display: 'none' },
    },
    variants: {
      faction: factionVariants(),
    },
  },
  tooltip: {
    base: {
      ...rarity('45 60% 35%', 8),
      borderWidth: '1px',
      borderStyle: 'solid',
      background: 'linear-gradient(180deg, hsl(35 15% 8%) 0%, hsl(35 10% 5%) 100%)',
      color: '#fef3c7',
      fontFamily: 'heading',
      px: '3',
      py: '2',
    },
    variants: {
      rarity: {
        common: {},
        uncommon: rarity('120 35% 32%', 8),
        rare: rarity('220 50% 42%', 8),
        epic: rarity('280 40% 42%', 10),
        legendary: rarity('30 70% 40%', 10),
      },
    },
  },
  skeleton: {
    base: {
      background: 'var(--wc-skeleton-bg)',
      boxShadow: 'var(--wc-skeleton-shadow)',
      animation: 'none',
      '&::before': { content: '""', position: 'absolute', inset: '0', backgroundImage: 'var(--wc-skeleton-icons)', backgroundSize: 'var(--wc-skeleton-icon-size)', animation: 'wcIconPulse 3s ease-in-out infinite', pointerEvents: 'none' },
      '&::after': { content: '""', position: 'absolute', inset: '0', background: 'var(--wc-skeleton-shimmer)', animation: 'wcShimmer 2.5s ease-in-out infinite', pointerEvents: 'none' },
      _motionReduce: { '&::before, &::after': { animation: 'none' } },
    },
    variants: {
      tone: {
        soft: { background: 'var(--wc-skeleton-bg)', opacity: 0.7 },
      },
      faction: factionVariants(),
    },
  },
  notice: {
    base: {
      ...scroll,
      position: 'relative',
      px: '8',
      py: '4',
      borderRadius: '0',
      color: '#3b2a14',
      '--colors-fg-default': '#3b2a14',
      '--colors-fg-muted': '#5b4630',
      '--colors-warning-fg': '#8a4b0f',
      '--colors-danger-fg': '#8b1d12',
      '--colors-success-fg': '#2f5d1a',
      '&::before, &::after': { content: '""', position: 'absolute', top: '-6px', bottom: '-6px', w: '5', background: 'var(--wc-scroll-handle) center / 100% 100% no-repeat' },
      '&::before': { left: '-3.6px' },
      '&::after': { right: '-3.6px', transform: 'scaleX(-1)' },
    },
    variants: {
      tone: {
        warning: { bg: 'transparent' },
        danger: { bg: 'transparent' },
        success: { bg: 'transparent' },
      },
      faction: factionVariants(),
    },
  },
}

export const slotRecipes: ThemeSlotRecipeOverrides = {
  avatar: {
    base: {
      root: {
        overflow: 'visible',
        borderRadius: '0',
        bg: 'transparent',
        p: 'calc(var(--avatar-size) * 0.2)',
        '&::after': { content: '""', position: 'absolute', inset: '0', transform: 'scale(1.05)', background: 'var(--wc-avatar) center / contain no-repeat', pointerEvents: 'none' },
      },
      image: { bg: 'bg.emphasized' },
    },
    variants: {
      faction: Object.fromEntries(Object.entries(factionVariants()).map(([faction, vars]) => [faction, { root: vars }])),
    },
  },
  spinner: {
    base: {
      root: { animation: 'none', color: 'rgb(102 255 153 / 0.95)', overflow: 'visible' },
      wrap: { transformOrigin: 'center', animation: 'wcSpinnerFlicker 3400ms linear infinite', _motionReduce: { animation: 'none' } },
      glow: { transformOrigin: 'center', animation: 'wcSpinnerGlow 2600ms linear infinite', _motionReduce: { animation: 'none', opacity: 0.35 } },
      core: { transformOrigin: 'center', animation: 'wcSpinnerCore 2600ms linear infinite', _motionReduce: { animation: 'none', opacity: 1 } },
    },
  },
  segmented: {
    base: {
      root: { ...nineSlice(FRAMES.input, 'var(--wc-input)', 0.04), bg: 'bg.canvas' },
      indicator: { ...nineSlice(FRAMES.tab, 'var(--wc-tab-active)', 0.15), bg: 'transparent', boxShadow: 'none' },
      item: {
        gap: '1.5',
        fontFamily: 'heading',
        letterSpacing: '0.03em',
        borderRadius: '0',
        '&::before': { content: '""', w: '3', h: '3', flexShrink: 0, borderRadius: 'full', background: socket, boxShadow: 'inset 0 1px 3px hsl(0 0% 0% / 0.6), 0 0 0 1px hsl(35 15% 28%)' },
        _checked: {
          color: 'accent.fg',
          '&::before': { background: `${gem}, ${socket}`, animation: 'wcGemPulse 2.5s ease-in-out infinite', _motionReduce: { animation: 'none' } },
        },
      },
    },
  },
  disclosure: {
    base: {
      header: {
        ...nineSlice(FRAMES.accordionHeader, 'var(--wc-accordion-header)', 0.14),
        bg: 'transparent',
        color: '#fff',
        '--truncate-marker-background-color': 'transparent',
      },
      icon: {
        w: '4',
        h: '4',
        background: 'var(--wc-icon-sword) center / contain no-repeat',
        filter: 'brightness(0) saturate(100%) invert(83%) sepia(38%) saturate(1148%) hue-rotate(349deg) brightness(102%) contrast(101%)',
        transition: 'transform 300ms',
        '& svg': { display: 'none' },
      },
    },
    variants: {
      open: {
        true: {
          header: { boxShadow: '0 0 0 1px rgba(255, 215, 120, 0.4), 0 0 12px rgba(255, 200, 100, 0.35)' },
          icon: { transform: 'rotate(180deg)' },
        },
      },
      icon: {
        sword: {},
        shield: { icon: { backgroundImage: 'var(--wc-icon-shield)', filter: 'brightness(0) saturate(100%) invert(66%) sepia(30%) saturate(965%) hue-rotate(171deg) brightness(92%) contrast(88%)' } },
        runeStone: { icon: { backgroundImage: 'var(--wc-icon-rune-stone)', filter: 'brightness(0) saturate(100%) invert(66%) sepia(18%) saturate(951%) hue-rotate(253deg) brightness(94%) contrast(91%)' } },
      },
    },
  },
}
