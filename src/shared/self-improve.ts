export const APP_OVERLAY_ROOT = 'Library/Application Support/dev.pull-review.app/overlay'

export function overlayPageUrl(overlayDir: string) {
  return `file://${encodeURI(`${overlayDir}/build/app-web/index.html`)}`
}
