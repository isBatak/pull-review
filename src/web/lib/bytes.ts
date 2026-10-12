const UNITS = ['B', 'KB', 'MB', 'GB']

export function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined)
    return '–'
  let value = Math.abs(bytes)
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${bytes < 0 ? '-' : ''}${value.toFixed(digits)} ${UNITS[unit]}`
}

export function formatDeltaBytes(bytes: number) {
  if (bytes === 0)
    return '0 B'
  return `${bytes > 0 ? '+' : ''}${formatBytes(bytes)}`
}

export function formatPercentChange(delta: number, base: number | null) {
  if (!base)
    return null
  const percent = (delta / base) * 100
  if (Math.abs(percent) < 0.05)
    return null
  return `${percent > 0 ? '+' : ''}${percent.toFixed(Math.abs(percent) >= 10 ? 0 : 1)}%`
}
