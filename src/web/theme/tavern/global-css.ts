import { defineGlobalStyles } from '@pandacss/dev'
import { FACTIONS, factionVars } from './factions'

const root = '[data-panda-theme=tavern]'

export const globalCss = defineGlobalStyles({
  [root]: {
    ...factionVars('default'),
    '--diffs-addition-color-override': '#98bb4a',
    '--diffs-deletion-color-override': '#e0603f',
  },
  ...Object.fromEntries(FACTIONS.map(faction => [`${root}[data-tavern-faction=${faction}]`, factionVars(faction)])),
  [`${root} body`]: {
    cursor: 'var(--wc-cursor)',
    backgroundImage: 'radial-gradient(ellipse at 50% -10%, rgba(232, 160, 60, 0.12), transparent 60%), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.012) 0 2px, transparent 2px 7px)',
    backgroundAttachment: 'fixed',
  },
  [`${root} :is(h1, h2, h3)`]: {
    fontFamily: 'heading',
    letterSpacing: '0.03em',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
  },
})
