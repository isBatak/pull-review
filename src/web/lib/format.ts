const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size)
      return formatter.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export function fileName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function directoryName(path: string) {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index + 1)
}

export function domIdForFile(fileId: string) {
  return `file-${fileId.replace(/[^\w-]/g, '_')}`
}
