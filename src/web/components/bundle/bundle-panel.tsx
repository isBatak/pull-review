import type { AnalyzerNode, BundleAnalysis, FileComparison, ModuleSizeKey, RouteComparison, SizeDelta } from '../../../shared/bundle'
import type { ReactNode } from 'react'
import type { BundleArtifacts, BundleArtifactSide, BundleSettings, MrRef } from '../../../shared/types'
import { ChevronDown, ChevronRight, ExternalLink, LoaderCircle, Package } from 'lucide-react'
import { useMemo, useState } from 'react'
import { css, cx } from 'styled-system/css'
import { APP_CODE_LABEL, compareBundles, comparePackages } from '../../../shared/bundle'
import { useBundleArtifacts } from '../../hooks/use-merge-request'
import { formatBytes } from '../../lib/bytes'
import { timeAgo } from '../../lib/format'
import { useSettings } from '../../lib/settings'
import { Button } from '../ui/button'
import { Segmented } from '../ui/segmented'
import { ModuleTreemap } from './module-treemap'
import { DeltaPill } from './size-delta'

const card = css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg' })
const sectionTitle = css({ fontSize: 'sm', fontWeight: 'semibold' })
const sectionHint = css({ fontSize: 'xs', color: 'fg.muted' })
const numeric = css({ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' })
const tableHead = css({ display: 'grid', alignItems: 'center', gap: '3', px: '4', h: '8', fontSize: '2xs', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'wider', color: 'fg.muted', bg: 'bg.subtle', borderBottomWidth: '1px', borderColor: 'border.default' })
const tableRow = css({ display: 'grid', alignItems: 'center', gap: '3', px: '4', minH: '9', fontSize: 'sm', borderBottomWidth: '1px', borderColor: 'border.subtle', _last: { borderBottomWidth: '0' } })
const link = css({ color: 'accent.fg', display: 'inline-flex', alignItems: 'center', gap: '1', _hover: { textDecoration: 'underline' }, '& svg': { w: '3', h: '3' } })

const SIZE_LABELS: Record<ModuleSizeKey, string> = { gzipSize: 'Gzip', parsedSize: 'Minified', statSize: 'Source' }

function shortSha(sha: string) {
  return sha.slice(0, 8)
}

function SideLink({ label, side }: { label: string, side: BundleArtifactSide }) {
  return (
    <span>
      {label}
      {' '}
      <a href={side.jobUrl} target="_blank" rel="noreferrer" className={link}>
        <span className={css({ fontFamily: 'mono' })}>{shortSha(side.sha)}</span>
        <ExternalLink />
      </a>
      {side.finishedAt && <span className={css({ color: 'fg.subtle' })}>{` built ${timeAgo(side.finishedAt)}`}</span>}
    </span>
  )
}

function Notice({ title, children, busy }: { title: string, children: ReactNode, busy?: boolean }) {
  return (
    <div className={cx(card, css({ p: '6', display: 'flex', flexDir: 'column', alignItems: 'center', gap: '2', textAlign: 'center', '& svg': { w: '6', h: '6', color: 'fg.subtle' } }))}>
      {busy ? <LoaderCircle className={css({ animation: 'spin' })} /> : <Package />}
      <h2 className={css({ fontSize: 'md', fontWeight: 'semibold' })}>{title}</h2>
      <div className={css({ fontSize: 'sm', color: 'fg.muted', maxW: '560px', display: 'flex', flexDir: 'column', gap: '2' })}>{children}</div>
    </div>
  )
}

function MissingCurrent({ data, settings }: { data: BundleArtifacts, settings: BundleSettings }) {
  const job = <code className={css({ fontFamily: 'mono', fontSize: 'xs' })}>{settings.jobName}</code>
  const latest = data.latestJob
  if (latest && ['running', 'pending', 'created', 'preparing', 'waiting_for_resource', 'manual', 'scheduled'].includes(latest.status)) {
    return (
      <Notice title="The bundle is still building" busy>
        <p>
          The
          {' '}
          {job}
          {' '}
          job is
          {' '}
          {latest.status.replaceAll('_', ' ')}
          . Refresh this tab when it finishes.
        </p>
        <a href={latest.webUrl} target="_blank" rel="noreferrer" className={cx(link, css({ alignSelf: 'center' }))}>Open the job<ExternalLink /></a>
      </Notice>
    )
  }
  if (latest) {
    return (
      <Notice title="No bundle analysis for this merge request">
        <p>
          The latest
          {' '}
          {job}
          {' '}
          job is
          {' '}
          {latest.status}
          {latest.status === 'success' && ', but it did not keep the analysis file as an artifact'}
          .
        </p>
        {latest.status === 'success' && (
          <p>
            Merge request pipelines must keep
            {' '}
            <code className={css({ fontFamily: 'mono', fontSize: 'xs' })}>{settings.analysisPath}</code>
            . Pipelines that ran before that CI change have no artifact.
          </p>
        )}
        <a href={latest.webUrl} target="_blank" rel="noreferrer" className={cx(link, css({ alignSelf: 'center' }))}>Open the job<ExternalLink /></a>
      </Notice>
    )
  }
  return (
    <Notice title="No bundle analysis for this merge request">
      <p>
        No
        {' '}
        {job}
        {' '}
        job ran in the latest pipelines. The job usually runs only when the frontend app changes.
      </p>
      <p>You can change the job name and artifact paths in Settings, Bundle.</p>
    </Notice>
  )
}

function SummaryCard({ label, value, delta, hint }: { label: string, value: string, delta?: SizeDelta | null, hint?: ReactNode }) {
  return (
    <div className={cx(card, css({ p: '4', display: 'flex', flexDir: 'column', gap: '1', minW: '0' }))}>
      <span className={css({ fontSize: 'xs', color: 'fg.muted', fontWeight: 'medium' })}>{label}</span>
      <span className={css({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2' })}>
        <span className={css({ fontSize: 'xl', fontWeight: 'semibold', fontVariantNumeric: 'tabular-nums' })}>{value}</span>
        {delta && <DeltaPill value={delta} />}
      </span>
      {hint && <span className={css({ fontSize: 'xs', color: 'fg.subtle', minW: '0', truncate: true })}>{hint}</span>}
    </div>
  )
}

function BudgetBar({ percent, basePercent }: { percent: number | null, basePercent: number | null }) {
  if (percent === null)
    return <span className={css({ color: 'fg.subtle', fontSize: 'xs' })}>–</span>
  const over = percent > 100
  const tone = over ? 'danger.solid' : percent > 85 ? 'warning.fg' : 'success.solid'
  return (
    <span className={css({ display: 'flex', alignItems: 'center', gap: '2' })} title={`${percent.toFixed(1)}% of the budget`}>
      <span className={css({ position: 'relative', flex: '1', h: '1.5', borderRadius: 'full', bg: 'bg.muted', overflow: 'hidden' })}>
        <span className={css({ position: 'absolute', insetY: '0', left: '0', borderRadius: 'full', bg: tone })} style={{ width: `${Math.min(100, percent)}%` }} />
        {basePercent !== null && <span className={css({ position: 'absolute', insetY: '0', w: '2px', bg: 'fg.default', opacity: 0.6 })} style={{ left: `calc(${Math.min(100, basePercent)}% - 1px)` }} />}
      </span>
      <span className={cx(numeric, css({ w: '10', fontSize: 'xs', color: over ? 'danger.fg' : 'fg.muted', fontWeight: over ? 'semibold' : 'normal' }))}>{`${percent.toFixed(0)}%`}</span>
    </span>
  )
}

function FileRows({ files }: { files: FileComparison[] }) {
  if (!files.length)
    return <div className={css({ px: '4', py: '2', fontSize: 'xs', color: 'fg.subtle' })}>No route-specific chunks.</div>
  return (
    <div className={css({ bg: 'bg.subtle', borderBottomWidth: '1px', borderColor: 'border.subtle' })}>
      {files.map(file => (
        <div key={file.key} className={css({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px 132px', alignItems: 'center', gap: '3', pl: '10', pr: '4', h: '7', fontSize: 'xs' })}>
          <span className={css({ fontFamily: 'mono', color: 'fg.muted', truncate: true })} title={file.file}>{file.key}</span>
          <span className={numeric}>{formatBytes(file.gzip.current ?? file.gzip.base)}</span>
          <span className={css({ display: 'flex', justifyContent: 'flex-end' })}><DeltaPill value={file.gzip} /></span>
        </div>
      ))}
    </div>
  )
}

function RoutesTable({ routes, hasBase }: { routes: RouteComparison[], hasBase: boolean }) {
  const changedCount = routes.filter(route => route.firstLoadGzip.kind !== 'same').length
  const [onlyChanged, setOnlyChanged] = useState(hasBase && changedCount > 0)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const visible = onlyChanged ? routes.filter(route => route.firstLoadGzip.kind !== 'same') : routes
  const columns = 'minmax(0, 1fr) 96px 132px minmax(120px, 180px)'

  function toggle(route: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(route))
        next.delete(route)
      else
        next.add(route)
      return next
    })
  }

  return (
    <section className={card}>
      <header className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', flexWrap: 'wrap', px: '4', py: '3' })}>
        <div>
          <h2 className={sectionTitle}>Routes</h2>
          <p className={sectionHint}>First load JS is the route&apos;s own chunks plus the shared chunks, gzipped. The marker on each bar shows the base.</p>
        </div>
        {hasBase && (
          <Segmented
            label="Routes to show"
            value={onlyChanged ? 'changed' : 'all'}
            onChange={value => setOnlyChanged(value === 'changed')}
            items={[
              { value: 'changed', label: `Changed (${changedCount})` },
              { value: 'all', label: `All (${routes.length})` },
            ]}
          />
        )}
      </header>
      <div className={tableHead} style={{ gridTemplateColumns: columns }}>
        <span>Route</span>
        <span className={numeric}>First load</span>
        <span className={numeric}>Change</span>
        <span>Budget</span>
      </div>
      {visible.map((route) => {
        const open = expanded.has(route.route)
        return (
          <div key={route.route}>
            <button type="button" onClick={() => toggle(route.route)} aria-expanded={open} className={cx(tableRow, css({ w: 'full', textAlign: 'left', cursor: 'pointer', _hover: { bg: 'bg.subtle' } }))} style={{ gridTemplateColumns: columns }}>
              <span className={css({ display: 'flex', alignItems: 'center', gap: '1.5', minW: '0', '& svg': { w: '3.5', h: '3.5', color: 'fg.subtle', flexShrink: 0 } })}>
                {open ? <ChevronDown /> : <ChevronRight />}
                <span className={css({ fontFamily: 'mono', fontSize: 'xs', truncate: true })}>{route.route}</span>
              </span>
              <span className={numeric}>{formatBytes(route.firstLoadGzip.current ?? route.firstLoadGzip.base)}</span>
              <span className={css({ display: 'flex', justifyContent: 'flex-end' })}>{hasBase ? <DeltaPill value={route.firstLoadGzip} /> : null}</span>
              <BudgetBar percent={route.budgetPercent} basePercent={hasBase ? route.baseBudgetPercent : null} />
            </button>
            {open && <FileRows files={route.files} />}
          </div>
        )
      })}
      {visible.length === 0 && <div className={css({ px: '4', py: '6', textAlign: 'center', fontSize: 'sm', color: 'fg.muted' })}>No route changed.</div>}
    </section>
  )
}

function SharedChunks({ files, total, hasBase }: { files: FileComparison[], total: SizeDelta, hasBase: boolean }) {
  return (
    <section className={card}>
      <header className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', px: '4', py: '3' })}>
        <div>
          <h2 className={sectionTitle}>Shared chunks</h2>
          <p className={sectionHint}>Loaded on every page.</p>
        </div>
        <span className={css({ display: 'flex', alignItems: 'center', gap: '2', fontWeight: 'semibold', fontVariantNumeric: 'tabular-nums' })}>
          {formatBytes(total.current ?? total.base)}
          {hasBase && <DeltaPill value={total} />}
        </span>
      </header>
      <div className={tableHead} style={{ gridTemplateColumns: 'minmax(0, 1fr) 96px 132px' }}>
        <span>Chunk</span>
        <span className={numeric}>Gzip</span>
        <span className={numeric}>Change</span>
      </div>
      {files.map(file => (
        <div key={file.key} className={tableRow} style={{ gridTemplateColumns: 'minmax(0, 1fr) 96px 132px' }}>
          <span className={css({ fontFamily: 'mono', fontSize: 'xs', truncate: true })} title={file.file}>{file.key}</span>
          <span className={numeric}>{formatBytes(file.gzip.current ?? file.gzip.base)}</span>
          <span className={css({ display: 'flex', justifyContent: 'flex-end' })}>{hasBase && <DeltaPill value={file.gzip} />}</span>
        </div>
      ))}
    </section>
  )
}

const PACKAGES_SHOWN = 12

function PackageChanges({ current, base, sizeKey }: { current: AnalyzerNode[], base: AnalyzerNode[] | null, sizeKey: ModuleSizeKey }) {
  const packages = useMemo(() => comparePackages(current, base, sizeKey), [current, base, sizeKey])
  const [showAll, setShowAll] = useState(false)
  const relevant = base ? packages.filter(pkg => pkg.size.kind !== 'same') : packages
  const visible = showAll ? relevant : relevant.slice(0, PACKAGES_SHOWN)
  const columns = 'minmax(0, 1fr) 72px 96px 132px'
  return (
    <div className={css({ borderTopWidth: '1px', borderColor: 'border.default' })}>
      <div className={css({ px: '4', py: '3' })}>
        <h3 className={sectionTitle}>{base ? 'Package changes' : 'Largest packages'}</h3>
        <p className={sectionHint}>Modules summed by npm package or workspace library. Files of the app itself count as &quot;This app&quot;.</p>
      </div>
      <div className={tableHead} style={{ gridTemplateColumns: columns }}>
        <span>Package</span>
        <span className={numeric}>Modules</span>
        <span className={numeric}>{SIZE_LABELS[sizeKey]}</span>
        <span className={numeric}>Change</span>
      </div>
      {visible.map(pkg => (
        <div key={pkg.name} className={tableRow} style={{ gridTemplateColumns: columns }}>
          <span className={css({ fontFamily: pkg.name === APP_CODE_LABEL ? 'body' : 'mono', fontSize: 'xs', truncate: true })}>{pkg.name}</span>
          <span className={cx(numeric, css({ color: 'fg.muted' }))}>{pkg.modules}</span>
          <span className={numeric}>{formatBytes(pkg.size.current ?? pkg.size.base)}</span>
          <span className={css({ display: 'flex', justifyContent: 'flex-end' })}>{base && <DeltaPill value={pkg.size} />}</span>
        </div>
      ))}
      {relevant.length === 0 && <div className={css({ px: '4', py: '4', fontSize: 'sm', color: 'fg.muted' })}>No package changed size.</div>}
      {relevant.length > PACKAGES_SHOWN && (
        <div className={css({ px: '4', py: '2' })}>
          <Button variant="ghost" size="sm" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer' : `Show all ${relevant.length}`}</Button>
        </div>
      )}
    </div>
  )
}

function Modules({ current, base }: { current: AnalyzerNode[], base: AnalyzerNode[] | null }) {
  const [sizeKey, setSizeKey] = useState<ModuleSizeKey>('gzipSize')
  return (
    <section className={card}>
      <header className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', flexWrap: 'wrap', px: '4', py: '3' })}>
        <div>
          <h2 className={sectionTitle}>Modules</h2>
          <p className={sectionHint}>{base ? 'Every client chunk and the modules inside it. Colours compare each tile with the base build.' : 'Every client chunk and the modules inside it. The base build has no module data, so tiles are not compared.'}</p>
        </div>
        <Segmented
          label="Module size"
          value={sizeKey}
          onChange={setSizeKey}
          items={(Object.keys(SIZE_LABELS) as ModuleSizeKey[]).map(key => ({ value: key, label: SIZE_LABELS[key] }))}
        />
      </header>
      <div className={css({ px: '4', pb: '4' })}>
        <ModuleTreemap current={current} base={base} sizeKey={sizeKey} />
      </div>
      <PackageChanges current={current} base={base} sizeKey={sizeKey} />
    </section>
  )
}

function ServerRoutes({ comparison, hasBase }: { comparison: ReturnType<typeof compareBundles>['server'], hasBase: boolean }) {
  const [open, setOpen] = useState(false)
  const changed = comparison.filter(route => route.raw.kind !== 'same')
  const rows = hasBase ? changed : comparison
  if (!comparison.length)
    return null
  return (
    <section className={card}>
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className={css({ w: 'full', display: 'flex', alignItems: 'center', gap: '2', px: '4', py: '3', textAlign: 'left', cursor: 'pointer', '& svg': { w: '4', h: '4', color: 'fg.subtle' } })}>
        {open ? <ChevronDown /> : <ChevronRight />}
        <span className={css({ flex: '1' })}>
          <span className={sectionTitle}>Server routes</span>
          <span className={cx(sectionHint, css({ display: 'block' }))}>{hasBase ? `${changed.length} of ${comparison.length} changed. Uncompressed server bundle size.` : 'Uncompressed server bundle size.'}</span>
        </span>
      </button>
      {open && (
        <>
          <div className={tableHead} style={{ gridTemplateColumns: 'minmax(0, 1fr) 96px 132px' }}>
            <span>Route</span>
            <span className={numeric}>Size</span>
            <span className={numeric}>Change</span>
          </div>
          {rows.map(route => (
            <div key={route.route} className={tableRow} style={{ gridTemplateColumns: 'minmax(0, 1fr) 96px 132px' }}>
              <span className={css({ fontFamily: 'mono', fontSize: 'xs', truncate: true })}>{route.route}</span>
              <span className={numeric}>{formatBytes(route.raw.current ?? route.raw.base)}</span>
              <span className={css({ display: 'flex', justifyContent: 'flex-end' })}>{hasBase && <DeltaPill value={route.raw} />}</span>
            </div>
          ))}
          {rows.length === 0 && <div className={css({ px: '4', py: '4', fontSize: 'sm', color: 'fg.muted' })}>No server route changed.</div>}
        </>
      )}
    </section>
  )
}

function BundleReport({ data, settings }: { data: BundleArtifacts, settings: BundleSettings }) {
  const current = data.current!
  const base = data.base
  const comparison = useMemo(
    () => compareBundles(current.analysis as BundleAnalysis, (base?.analysis ?? null) as BundleAnalysis | null, { budgetBytes: settings.budgetBytes, thresholdBytes: settings.thresholdBytes }),
    [current, base, settings.budgetBytes, settings.thresholdBytes],
  )
  const hasBase = Boolean(base)
  const heaviest = comparison.routes.reduce<RouteComparison | null>((max, route) => ((route.firstLoadGzip.current ?? 0) > (max?.firstLoadGzip.current ?? 0) ? route : max), null)
  const overBudget = comparison.routes.filter(route => (route.budgetPercent ?? 0) > 100).length
  const currentModules = current.modules as AnalyzerNode[] | null
  const baseModules = (base?.modules ?? null) as AnalyzerNode[] | null
  const isStale = current.sha !== data.headSha

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '4' })}>
      <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '1', columnGap: '4', fontSize: 'xs', color: 'fg.muted' })}>
        <SideLink label="This MR" side={current} />
        {base
          ? <SideLink label={`Compared with ${settings.baseBranch}`} side={base} />
          : <span className={css({ color: 'warning.fg' })}>{`No ${settings.baseBranch} build to compare with was found.`}</span>}
      </div>
      {isStale && (
        <div className={css({ px: '3', py: '2', borderRadius: 'md', bg: 'warning.subtle', color: 'warning.fg', fontSize: 'xs' })}>
          {`This analysis is for ${shortSha(current.sha)}, not the latest commit ${shortSha(data.headSha)}. A newer build may still be running.`}
        </div>
      )}
      <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '3' })}>
        <SummaryCard label="Client JS, all routes" value={formatBytes(comparison.totals.clientGzip.current)} delta={hasBase ? comparison.totals.clientGzip : null} hint="Gzip, shared and route chunks" />
        <SummaryCard label="Shared JS" value={formatBytes(comparison.global.gzip.current)} delta={hasBase ? comparison.global.gzip : null} hint="Gzip, loaded on every page" />
        <SummaryCard label="Routes changed" value={hasBase ? `${comparison.totals.routesChanged} of ${comparison.totals.routesTotal}` : String(comparison.totals.routesTotal)} hint={hasBase ? `Changes under ${formatBytes(settings.thresholdBytes)} are ignored` : 'Routes in this build'} />
        <SummaryCard
          label="Heaviest first load"
          value={formatBytes(heaviest?.firstLoadGzip.current)}
          hint={heaviest ? `${heaviest.route}${overBudget ? `, ${overBudget} over the ${formatBytes(settings.budgetBytes)} budget` : ''}` : undefined}
        />
      </div>
      <RoutesTable routes={comparison.routes} hasBase={hasBase} />
      <SharedChunks files={comparison.global.files} total={comparison.global.gzip} hasBase={hasBase} />
      {currentModules?.length
        ? <Modules current={currentModules} base={baseModules?.length ? baseModules : null} />
        : (
            <div className={cx(card, css({ px: '4', py: '3', fontSize: 'sm', color: 'fg.muted' }))}>
              The build kept no module data, so there is no module treemap. Builds need
              {' '}
              <code className={css({ fontFamily: 'mono', fontSize: 'xs' })}>{settings.modulesPath}</code>
              {' '}
              as an artifact.
            </div>
          )}
      <ServerRoutes comparison={comparison.server} hasBase={hasBase} />
    </div>
  )
}

export function BundlePanel({ mrRef }: { mrRef: MrRef }) {
  const [settings] = useSettings()
  const query = useBundleArtifacts(mrRef, settings.bundle, true)

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '4' })}>
      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3' })}>
        <div>
          <h1 className={css({ fontSize: 'lg', fontWeight: 'semibold' })}>Bundle analysis</h1>
          <p className={sectionHint}>
            Built by the
            {' '}
            <code className={css({ fontFamily: 'mono' })}>{settings.bundle.jobName}</code>
            {' '}
            CI job and compared with
            {' '}
            {settings.bundle.baseBranch}
            .
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? 'Checking…' : 'Refresh'}</Button>
      </div>
      {query.isPending
        ? <Notice title="Looking for bundle analysis" busy><p>Searching the latest pipelines for analysis artifacts.</p></Notice>
        : query.error
          ? <Notice title="Could not load the bundle analysis"><p>{query.error.message}</p></Notice>
          : query.data.current
            ? <BundleReport data={query.data} settings={settings.bundle} />
            : <MissingCurrent data={query.data} settings={settings.bundle} />}
    </div>
  )
}
