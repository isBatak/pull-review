import { LoaderCircle } from 'lucide-react'
import { cx } from 'styled-system/css'
import { spinner } from 'styled-system/recipes'
import { useThemeName } from '../../lib/preferences'
import { SPINNER_PATH } from '../../theme/tavern/spinner-path'

const GLYPH_CENTER = { x: 107.607415, y: 182.916484 }

export function Spinner({ className }: { className?: string }) {
  const [themeName] = useThemeName()
  const classes = spinner()
  if (themeName !== 'tavern')
    return <LoaderCircle className={cx(classes.root, className)} />
  return (
    <svg role="status" aria-label="Loading" className={cx(classes.root, className)} viewBox="14 15.946284 187.21483 333.9404" preserveAspectRatio="none">
      <g transform={`translate(${GLYPH_CENTER.x} ${GLYPH_CENTER.y}) rotate(-2) translate(${-GLYPH_CENTER.x} ${-GLYPH_CENTER.y})`}>
        <g className={classes.wrap}>
          <path className={classes.glow} d={SPINNER_PATH} fill="currentColor" />
          <path className={classes.core} d={SPINNER_PATH} fill="currentColor" />
        </g>
      </g>
    </svg>
  )
}
