import type { defineStyles } from '@pandacss/dev'
import { FRAMES, nineSliceVars } from './nine-slice'

type SystemStyleObject = ReturnType<typeof defineStyles>

export const FACTIONS = ['default', 'human', 'orc', 'elf', 'undead'] as const

export type Faction = typeof FACTIONS[number]

interface SkeletonLook {
  bg: string
  shadow: string
  shimmer: string
  icons: string
  iconSize: string
}

const SKELETON: Record<Faction, SkeletonLook> = {
  default: {
    bg: 'linear-gradient( 135deg, hsl(35 10% 12%) 0%, hsl(35 8% 18%) 50%, hsl(35 10% 14%) 100% )',
    shadow: 'inset 0 1px 0 hsl(35 10% 25% / 0.3), inset 0 -1px 0 hsl(35 10% 8% / 0.5), 0 2px 8px hsl(0 0% 0% / 0.4)',
    shimmer: 'linear-gradient( 90deg, transparent 0%, hsl(45 100% 50% / 0.08) 20%, hsl(40 100% 60% / 0.15) 40%, hsl(35 100% 55% / 0.2) 50%, hsl(40 100% 60% / 0.15) 60%, hsl(45 100% 50% / 0.08) 80%, transparent 100% )',
    icons: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\' viewBox=\'0 0 60 60\'%3E%3Cpath d=\'M30 5 L35 15 L30 25 L25 15 Z M10 30 L20 35 L10 40 Z M50 30 L40 35 L50 40 Z M30 35 L35 45 L30 55 L25 45 Z\' fill=\'%23d4a853\' fill-opacity=\'0.5\'/%3E%3C/svg%3E")',
    iconSize: '40px 40px',
  },
  human: {
    bg: 'linear-gradient( 135deg, hsl(220 40% 15%) 0%, hsl(225 35% 20%) 50%, hsl(220 40% 17%) 100% )',
    shadow: 'inset 0 1px 0 hsl(225 40% 28% / 0.3), inset 0 -1px 0 hsl(220 40% 10% / 0.5), 0 2px 8px hsl(220 50% 10% / 0.5)',
    shimmer: 'linear-gradient( 90deg, transparent 0%, hsl(200 80% 60% / 0.08) 20%, hsl(210 70% 65% / 0.15) 40%, hsl(220 60% 70% / 0.2) 50%, hsl(210 70% 65% / 0.15) 60%, hsl(200 80% 60% / 0.08) 80%, transparent 100% )',
    icons: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\' viewBox=\'0 0 60 60\'%3E%3Cg fill=\'%235a8ac4\' fill-opacity=\'0.5\'%3E%3C!-- Shield (centered at 30) --%3E%3Cpath d=\'M30 12 L40 17 L40 32 Q40 38 30 45 Q20 38 20 32 L20 17 Z\' fill=\'%235a8ac4\' stroke=\'%234a7ab4\' stroke-width=\'1.2\'/%3E%3C!-- Shield boss --%3E%3Ccircle cx=\'30\' cy=\'27\' r=\'3.5\' fill=\'%234a7ab4\' opacity=\'0.7\'/%3E%3C!-- Cross --%3E%3Cline x1=\'30\' y1=\'17\' x2=\'30\' y2=\'40\' stroke=\'%234a7ab4\' stroke-width=\'1.5\' opacity=\'0.4\'/%3E%3Cline x1=\'23\' y1=\'27\' x2=\'37\' y2=\'27\' stroke=\'%234a7ab4\' stroke-width=\'1.5\' opacity=\'0.4\'/%3E%3C!-- Shine --%3E%3Cpath d=\'M25 20 Q27.5 19 30 20\' stroke=\'%236a9ad4\' stroke-width=\'0.8\' fill=\'none\' opacity=\'0.5\'/%3E%3C/g%3E%3C/svg%3E")',
    iconSize: '35px 35px',
  },
  orc: {
    bg: 'linear-gradient( 135deg, hsl(0 30% 12%) 0%, hsl(10 25% 18%) 50%, hsl(0 30% 14%) 100% )',
    shadow: 'inset 0 1px 0 hsl(10 30% 25% / 0.3), inset 0 -1px 0 hsl(0 30% 8% / 0.5), 0 2px 8px hsl(10 50% 10% / 0.5)',
    shimmer: 'linear-gradient( 90deg, transparent 0%, hsl(10 100% 50% / 0.08) 20%, hsl(15 100% 60% / 0.15) 40%, hsl(20 100% 55% / 0.2) 50%, hsl(15 100% 60% / 0.15) 60%, hsl(10 85% 50% / 0.08) 80%, transparent 100% )',
    icons: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\' viewBox=\'0 0 60 60\'%3E%3Cg fill=\'%23d4624a\' fill-opacity=\'0.5\'%3E%3C!-- Wooden handle (centered at 30) --%3E%3Crect x=\'28\' y=\'15\' width=\'4\' height=\'30\' rx=\'2\' fill=\'%23703010\'/%3E%3C!-- Axe blade (curved single blade) --%3E%3Cpath d=\'M20 20 Q18 25 20 30 L28 30 L28 20 Z\' fill=\'%23d4624a\'/%3E%3C!-- Blade edge (darker) --%3E%3Cpath d=\'M20 20 Q18 25 20 30\' stroke=\'%23902010\' stroke-width=\'1.2\' fill=\'none\'/%3E%3C!-- Small back spike --%3E%3Cpath d=\'M32 23 L36 25 L32 27 Z\' fill=\'%23a04020\'/%3E%3C/g%3E%3C/svg%3E")',
    iconSize: '35px 35px',
  },
  elf: {
    bg: 'linear-gradient( 135deg, hsl(170 35% 12%) 0%, hsl(175 30% 18%) 50%, hsl(170 35% 14%) 100% )',
    shadow: 'inset 0 1px 0 hsl(175 35% 25% / 0.3), inset 0 -1px 0 hsl(170 35% 8% / 0.5), 0 2px 8px hsl(175 40% 10% / 0.5)',
    shimmer: 'linear-gradient( 90deg, transparent 0%, hsl(180 80% 60% / 0.08) 20%, hsl(185 70% 65% / 0.15) 40%, hsl(190 60% 70% / 0.2) 50%, hsl(185 70% 65% / 0.15) 60%, hsl(180 80% 60% / 0.08) 80%, transparent 100% )',
    icons: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\' viewBox=\'0 0 60 60\'%3E%3Cg fill=\'%235aaaa5\' fill-opacity=\'0.5\'%3E%3C!-- Center leaf (simple flowing shape) --%3E%3Cpath d=\'M30 18 Q28 20 26 25 Q28 30 30 32 Q32 30 34 25 Q32 20 30 18 Z\' fill=\'%235aaaa5\'/%3E%3Cline x1=\'30\' y1=\'18\' x2=\'30\' y2=\'32\' stroke=\'%234a9a95\' stroke-width=\'0.8\'/%3E%3C!-- Left leaf --%3E%3Cpath d=\'M20 22 Q18 24 17 28 Q19 32 20 33 Q21 32 23 28 Q22 24 20 22 Z\' fill=\'%235aaaa5\' opacity=\'0.85\'/%3E%3Cline x1=\'20\' y1=\'22\' x2=\'20\' y2=\'33\' stroke=\'%234a9a95\' stroke-width=\'0.6\' opacity=\'0.7\'/%3E%3C!-- Right leaf --%3E%3Cpath d=\'M40 22 Q38 24 37 28 Q39 32 40 33 Q41 32 43 28 Q42 24 40 22 Z\' fill=\'%235aaaa5\' opacity=\'0.85\'/%3E%3Cline x1=\'40\' y1=\'22\' x2=\'40\' y2=\'33\' stroke=\'%234a9a95\' stroke-width=\'0.6\' opacity=\'0.7\'/%3E%3C/g%3E%3C/svg%3E")',
    iconSize: '35px 35px',
  },
  undead: {
    bg: 'linear-gradient( 135deg, hsl(270 25% 10%) 0%, hsl(275 20% 15%) 50%, hsl(270 25% 12%) 100% )',
    shadow: 'inset 0 1px 0 hsl(275 25% 22% / 0.3), inset 0 -1px 0 hsl(270 25% 6% / 0.5), 0 2px 8px hsl(270 40% 8% / 0.6)',
    shimmer: 'linear-gradient( 90deg, transparent 0%, hsl(280 70% 50% / 0.08) 20%, hsl(285 60% 55% / 0.15) 40%, hsl(290 50% 60% / 0.2) 50%, hsl(285 60% 55% / 0.15) 60%, hsl(280 70% 50% / 0.08) 80%, transparent 100% )',
    icons: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\' viewBox=\'0 0 60 60\'%3E%3Cg fill=\'%23a68ac4\' fill-opacity=\'0.5\'%3E%3Cpath d=\'M30 10 Q40 10 45 18 Q50 26 48 35 L42 35 Q42 38 40 40 L35 40 L35 45 L32 48 L28 48 L25 45 L25 40 L20 40 Q18 38 18 35 L12 35 Q10 26 15 18 Q20 10 30 10 M22 22 Q22 26 25 26 Q28 26 28 22 Q28 18 25 18 Q22 18 22 22 M32 22 Q32 26 35 26 Q38 26 38 22 Q38 18 35 18 Q32 18 32 22 M25 32 L28 35 L30 33 L32 35 L35 32\'/%3E%3C/g%3E%3C/svg%3E")',
    iconSize: '45px 45px',
  },
}

const DARK_TAB_TEXT = new Set<Faction>(['elf', 'undead'])

const FACTION_ASSETS = ['checkbox', 'checkbox-checked', 'tab', 'tab-active', 'tab-content', 'avatar', 'scroll', 'scroll-handle', 'hero', 'cursor']

function prefixed(prefix: string, vars: Record<string, string>) {
  return Object.fromEntries(Object.entries(vars).map(([name, value]) => [name.replace('--wc-slice', prefix), value]))
}

export function factionVars(faction: Faction): SystemStyleObject {
  const skeleton = SKELETON[faction]
  const vars: Record<string, string> = {
    ...Object.fromEntries(FACTION_ASSETS.map(asset => [`--wc-${asset}`, `var(--wc-${asset}-${faction})`])),
    '--wc-tab-fg': DARK_TAB_TEXT.has(faction) ? '#000' : '#fff',
    ...prefixed('--wc-tab-content', faction === 'default' ? nineSliceVars(FRAMES.tabPanel, 0.5) : nineSliceVars(FRAMES.tabPanelFaction, 0.3)),
    '--wc-skeleton-bg': skeleton.bg,
    '--wc-skeleton-shadow': skeleton.shadow,
    '--wc-skeleton-shimmer': skeleton.shimmer,
    '--wc-skeleton-icons': skeleton.icons,
    '--wc-skeleton-icon-size': skeleton.iconSize,
  }
  return vars as SystemStyleObject
}

export function factionVariants(): Record<Faction, SystemStyleObject> {
  return Object.fromEntries(FACTIONS.map(faction => [faction, factionVars(faction)])) as Record<Faction, SystemStyleObject>
}
