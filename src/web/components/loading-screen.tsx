import { useEffect, useState } from 'react'
import { css } from 'styled-system/css'

const BACKGROUND = `${import.meta.env.BASE_URL}tavern/loading-background.jpg`

const TIPS = [
  'Small merge requests get reviewed faster, and better.',
  'Read the tests first. They tell you what the code is supposed to do.',
  'A suggestion block lets the author accept your fix with one click.',
  'Ask questions instead of giving orders. The author knows things you don\'t.',
  'Mark files as reviewed to keep your place in long merge requests.',
  'Praise good code too. Reviews are not only for finding mistakes.',
  'Press ⌘K to jump to any merge request.',
]

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

function useCreepingProgress() {
  const [progress, setProgress] = useState(0.04)
  useEffect(() => {
    const timer = window.setInterval(() => setProgress(value => value + (0.92 - value) * 0.06), 150)
    return () => window.clearInterval(timer)
  }, [])
  return progress
}

const screen = css({
  position: 'fixed',
  inset: '0',
  display: 'flex',
  flexDir: 'column',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: '3',
  pb: '8vh',
  px: '6',
  bg: '#000',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  '&::before': {
    content: '""',
    position: 'absolute',
    inset: '0',
    background: 'linear-gradient(180deg, transparent 55%, rgba(0, 0, 0, 0.85) 100%)',
    pointerEvents: 'none',
  },
})

const tipText = css({
  position: 'relative',
  maxW: '3xl',
  textAlign: 'center',
  fontSize: 'md',
  color: '#fff',
  textShadow: '0 1px 2px #000, 0 0 8px #000',
})

const tipLabel = css({ fontFamily: 'heading', color: '#ffd100', mr: '1.5' })

const bar = css({
  position: 'relative',
  w: 'min(860px, 80vw)',
  h: '12',
  borderStyle: 'solid',
  borderColor: 'transparent',
  borderWidth: '13px 28px',
  borderImageSource: 'var(--wc-button-frame)',
  borderImageSlice: '100 200',
  borderImageWidth: '13px 28px',
  borderImageRepeat: 'stretch',
  bg: 'linear-gradient(180deg, #050302, #1a120a)',
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.9)',
})

const fill = css({
  position: 'absolute',
  insetBlock: '0',
  left: '0',
  background: 'linear-gradient(180deg, #fff3b0 0%, #ffd23f 22%, #e8a317 50%, #b86b0a 78%, #6e3a05 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 0 10px rgba(255, 190, 60, 0.55)',
  transition: 'width 150ms linear',
  '&::after': {
    content: '""',
    position: 'absolute',
    insetBlock: '-2px',
    right: '-3px',
    w: '6px',
    borderRadius: 'full',
    background: 'radial-gradient(ellipse at center, #fff 0%, rgba(255, 230, 150, 0.9) 35%, transparent 70%)',
    filter: 'blur(1px)',
  },
})

const caption = css({
  position: 'relative',
  fontFamily: 'heading',
  fontSize: 'xs',
  letterSpacing: '0.08em',
  color: '#d8c79a',
  textShadow: '0 1px 2px #000',
})

export function TavernLoadingScreen({ label }: { label: string }) {
  const [tip] = useState(() => pick(TIPS))
  const progress = useCreepingProgress()

  return (
    <div className={screen} style={{ backgroundImage: `url(${BACKGROUND})` }} role="status" aria-live="polite">
      <p className={tipText}>
        <span className={tipLabel}>Tip:</span>
        {tip}
      </p>
      <div className={bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className={fill} style={{ width: `${progress * 100}%` }} />
      </div>
      <span className={caption}>{label}</span>
    </div>
  )
}
