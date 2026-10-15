import type { DiffFile, MergeRequest } from '../../shared/types'
import type { PixelDiff } from '../lib/pixel-diff'
import { useQuery } from '@tanstack/react-query'
import { ImageOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { css } from 'styled-system/css'
import { api } from '../lib/api'
import { computePixelDiff } from '../lib/pixel-diff'
import { Segmented } from './ui/segmented'
import { Spinner } from './ui/spinner'

const IMAGE_PATH = /\.(?:png|jpe?g|gif|webp|avif|bmp|ico)$/i

export function isImagePath(path: string) {
  return IMAGE_PATH.test(path)
}

function useNearViewport<T extends Element>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element || visible)
      return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '600px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])
  return [ref, visible] as const
}

function useBlobUrl(mergeRequest: MergeRequest, path: string | null, sha: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ['blob', mergeRequest.ref.host, mergeRequest.ref.project, path, sha],
    queryFn: () => api.blob(mergeRequest.ref, path!, sha),
    enabled: enabled && Boolean(path),
    staleTime: Infinity,
  })
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!query.data)
      return
    const objectUrl = URL.createObjectURL(query.data)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [query.data])
  return { url, blob: query.data ?? null, loading: query.isLoading, error: query.error }
}

const checkerboard = css({
  bgColor: 'bg.subtle',
  backgroundImage: 'linear-gradient(45deg, var(--colors-bg-muted) 25%, transparent 25%), linear-gradient(-45deg, var(--colors-bg-muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--colors-bg-muted) 75%), linear-gradient(-45deg, transparent 75%, var(--colors-bg-muted) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
})

function ImagePane({ label, tone, image, size, onSize }: { label: string, tone: 'old' | 'new', image: { url: string | null, loading: boolean, error: Error | null } | null, size: string | null, onSize: (size: string) => void }) {
  return (
    <figure className={css({ display: 'flex', flexDir: 'column', gap: '2', minW: '0' })}>
      <figcaption className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'xs', fontWeight: 'semibold' })}>
        <span style={{ color: tone === 'old' ? 'var(--colors-danger-fg)' : 'var(--colors-success-fg)' }}>{label}</span>
        {size && <span className={css({ color: 'fg.subtle', fontWeight: 'normal', fontFamily: 'mono' })}>{size}</span>}
      </figcaption>
      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'center', minH: '32', p: '2', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', overflow: 'hidden' })} style={{ borderColor: tone === 'old' ? 'color-mix(in srgb, var(--colors-danger-fg) 35%, transparent)' : 'color-mix(in srgb, var(--colors-success-fg) 35%, transparent)' }}>
        <div className={checkerboard} style={{ display: 'inline-flex', maxWidth: '100%' }}>
          {!image && <span className={css({ p: '6', fontSize: 'xs', color: 'fg.subtle' })}>No image on this side</span>}
          {image?.loading && <Spinner className={css({ m: '6', w: '5', h: '5', color: 'fg.subtle' })} />}
          {image?.error && <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', p: '6', fontSize: 'xs', color: 'danger.fg', '& svg': { w: '4', h: '4' } })}><ImageOff />{image.error.message}</span>}
          {image?.url && (
            <img
              src={image.url}
              alt={label}
              onLoad={event => onSize(`${event.currentTarget.naturalWidth}×${event.currentTarget.naturalHeight}`)}
              className={css({ display: 'block', maxW: 'full', h: 'auto', imageRendering: 'auto' })}
            />
          )}
        </div>
      </div>
    </figure>
  )
}

async function sameBytes(a: Blob, b: Blob) {
  if (a.size !== b.size)
    return false
  const [left, right] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()])
  const viewA = new Uint8Array(left)
  const viewB = new Uint8Array(right)
  for (let index = 0; index < viewA.length; index++) {
    if (viewA[index] !== viewB[index])
      return false
  }
  return true
}

function useIdentical(a: Blob | null, b: Blob | null) {
  const [identical, setIdentical] = useState<boolean | null>(null)
  useEffect(() => {
    if (!a || !b) {
      setIdentical(null)
      return
    }
    let cancelled = false
    void sameBytes(a, b).then((result) => {
      if (!cancelled)
        setIdentical(result)
    })
    return () => {
      cancelled = true
    }
  }, [a, b])
  return identical
}

function SwipeView({ before, after }: { before: string, after: string }) {
  const [position, setPosition] = useState(50)
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '3', alignItems: 'center' })}>
      <div className={checkerboard} style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        <img src={before} alt="Before" className={css({ display: 'block', maxW: 'full', h: 'auto' })} />
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${position}%)` }}>
          <img src={after} alt="After" className={css({ display: 'block', maxW: 'full', h: 'auto' })} />
        </div>
        <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `${position}%`, width: 2, marginLeft: -1, background: 'var(--colors-accent-default)' }} />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={event => setPosition(Number(event.target.value))}
        aria-label="Swipe between before and after"
        className={css({ w: 'full', maxW: '80', accentColor: 'var(--colors-accent-default)' })}
      />
    </div>
  )
}

type CompareMode = 'side' | 'swipe' | 'onion' | 'difference'

const COMPARE_MODES: { value: CompareMode, label: string }[] = [
  { value: 'side', label: 'Side by side' },
  { value: 'swipe', label: 'Swipe' },
  { value: 'onion', label: 'Onion skin' },
  { value: 'difference', label: 'Difference' },
]

function OnionSkinView({ before, after }: { before: string, after: string }) {
  const [opacity, setOpacity] = useState(50)
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '3', alignItems: 'center' })}>
      <div className={checkerboard} style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        <img src={before} alt="Before" className={css({ display: 'block', maxW: 'full', h: 'auto' })} />
        <img src={after} alt="After" style={{ position: 'absolute', top: 0, left: 0, opacity: opacity / 100 }} className={css({ display: 'block', maxW: 'full', h: 'auto' })} />
      </div>
      <label className={css({ display: 'flex', alignItems: 'center', gap: '2', w: 'full', maxW: '80', fontSize: 'xs', color: 'fg.muted' })}>
        Before
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={event => setOpacity(Number(event.target.value))}
          aria-label="Opacity of the after image"
          className={css({ flex: '1', accentColor: 'var(--colors-accent-default)' })}
        />
        After
      </label>
    </div>
  )
}

function usePixelDiff(cacheKey: string, before: Blob, after: Blob) {
  const query = useQuery({
    queryKey: ['pixel-diff', cacheKey],
    queryFn: () => computePixelDiff(before, after),
    staleTime: Infinity,
  })
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!query.data)
      return
    const objectUrl = URL.createObjectURL(query.data.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [query.data])
  return { diff: query.data ?? null, url, loading: query.isLoading, error: query.error }
}

function describeDifference(diff: PixelDiff) {
  const total = diff.width * diff.height
  const percent = total ? (diff.changedPixels / total) * 100 : 0
  const share = percent > 0 && percent < 0.01 ? 'under 0.01%' : `${percent.toFixed(2)}%`
  const pixels = `${diff.changedPixels.toLocaleString()} ${diff.changedPixels === 1 ? 'pixel' : 'pixels'} changed (${share})`
  return diff.sizeChanged ? `${pixels}. The size changed, so the smaller image is compared at the top left.` : pixels
}

function DifferenceView({ cacheKey, before, after }: { cacheKey: string, before: Blob, after: Blob }) {
  const { diff, url, loading, error } = usePixelDiff(cacheKey, before, after)
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '3', alignItems: 'center' })}>
      {loading && <Spinner className={css({ m: '6', w: '5', h: '5', color: 'fg.subtle' })} />}
      {error && <span className={css({ fontSize: 'xs', color: 'danger.fg' })}>{error.message}</span>}
      {diff && (
        <p className={css({ fontSize: 'xs', color: 'fg.muted', textAlign: 'center' })}>
          {describeDifference(diff)}
          {' '}
          Red marks changed pixels, yellow marks anti-aliasing differences.
        </p>
      )}
      {url && (
        <div className={checkerboard} style={{ display: 'inline-block', maxWidth: '100%' }}>
          <img src={url} alt="Pixel difference" className={css({ display: 'block', maxW: 'full', h: 'auto' })} />
        </div>
      )}
    </div>
  )
}

export function ImageDiff({ file, mergeRequest }: { file: DiffFile, mergeRequest: MergeRequest }) {
  const [ref, visible] = useNearViewport<HTMLDivElement>()
  const [mode, setMode] = useState<CompareMode>('side')
  const [sizes, setSizes] = useState<{ old: string | null, new: string | null }>({ old: null, new: null })
  const oldPath = file.status === 'added' ? null : (file.previousPath ?? file.path)
  const newPath = file.status === 'removed' ? null : file.path
  const before = useBlobUrl(mergeRequest, oldPath, mergeRequest.diffRefs.baseSha, visible)
  const after = useBlobUrl(mergeRequest, newPath, mergeRequest.diffRefs.headSha, visible)
  const canSwipe = Boolean(before.url && after.url)
  const identical = useIdentical(before.blob, after.blob)

  return (
    <div ref={ref} className={css({ display: 'flex', flexDir: 'column', gap: '3', p: '4' })}>
      {canSwipe && (
        <div className={css({ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '3' })}>
          {identical !== null && (
            <span
              className={css({ display: 'inline-flex', alignItems: 'center', h: '6', px: '2', borderRadius: 'full', fontSize: '2xs', fontWeight: 'semibold' })}
              style={identical
                ? { color: 'var(--colors-fg-muted)', background: 'var(--colors-bg-muted)' }
                : { color: 'var(--colors-warning-fg)', background: 'var(--colors-warning-subtle)' }}
            >
              {identical ? (file.status === 'renamed' ? 'Identical, only moved' : 'Identical') : 'Pixels changed'}
            </span>
          )}
          <Segmented label="Image comparison" value={mode} onChange={setMode} items={COMPARE_MODES} />
        </div>
      )}
      {mode === 'swipe' && canSwipe && <SwipeView before={before.url!} after={after.url!} />}
      {mode === 'onion' && canSwipe && <OnionSkinView before={before.url!} after={after.url!} />}
      {mode === 'difference' && before.blob && after.blob && <DifferenceView cacheKey={`${mergeRequest.ref.host}/${mergeRequest.ref.project}:${oldPath}@${mergeRequest.diffRefs.baseSha}:${newPath}@${mergeRequest.diffRefs.headSha}`} before={before.blob} after={after.blob} />}
      {(mode === 'side' || !canSwipe) && (
        <div className={css({ display: 'grid', gridTemplateColumns: { base: '1fr', md: '1fr 1fr' }, gap: '4' })}>
          <ImagePane label="Before" tone="old" image={oldPath ? before : null} size={sizes.old} onSize={size => setSizes(current => ({ ...current, old: size }))} />
          <ImagePane label="After" tone="new" image={newPath ? after : null} size={sizes.new} onSize={size => setSizes(current => ({ ...current, new: size }))} />
        </div>
      )}
    </div>
  )
}
