import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { css } from 'styled-system/css'
import { button } from 'styled-system/recipes'
import { Button } from '../components/ui/button'

const center = css({ display: 'flex', flexDir: 'column', alignItems: 'center', justifyContent: 'center', gap: '3', minH: '100dvh', p: '6', textAlign: 'center' })

export function LoadingState({ label }: { label: string }) {
  return (
    <div className={center}>
      <LoaderCircle className={css({ w: '6', h: '6', color: 'accent.default', animation: 'spin' })} />
      <span className={css({ color: 'fg.muted', fontSize: 'sm' })}>{label}</span>
    </div>
  )
}

export function ErrorState({ title, message, onRetry }: { title: string, message: string, onRetry?: () => void }) {
  return (
    <div className={center}>
      <TriangleAlert className={css({ w: '7', h: '7', color: 'danger.fg' })} />
      <h1 className={css({ fontSize: 'lg', fontWeight: 'semibold' })}>{title}</h1>
      <pre className={css({ maxW: '2xl', whiteSpace: 'pre-wrap', fontFamily: 'mono', fontSize: 'xs', color: 'fg.muted', bg: 'bg.subtle', p: '3', borderRadius: 'md', textAlign: 'left' })}>{message}</pre>
      <div className={css({ display: 'flex', gap: '2' })}>
        <Link to="/" className={button({ variant: 'outline', size: 'sm' })}>Start page</Link>
        {onRetry && <Button variant="solid" onClick={onRetry}>Try again</Button>}
      </div>
    </div>
  )
}
