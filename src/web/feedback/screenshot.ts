import { toPng } from 'html-to-image'
import { SELF_IMPROVE_UI_ATTRIBUTE } from '../../shared/self-improve'

const CAPTURE_TIMEOUT_MS = 8000
const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

function isOwnUi(node: Node) {
  return node instanceof Element && node.hasAttribute(SELF_IMPROVE_UI_ATTRIBUTE)
}

export async function captureWindow(): Promise<string | null> {
  const capture = toPng(document.body, {
    width: innerWidth,
    height: innerHeight,
    pixelRatio: 1,
    // Fonts and remote images can't be fetched under the app's CSP, so they are skipped instead of failing the picture.
    skipFonts: true,
    imagePlaceholder: EMPTY_IMAGE,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    filter: node => !isOwnUi(node),
  })
  const timeout = new Promise<null>(resolve => setTimeout(resolve, CAPTURE_TIMEOUT_MS, null))
  return Promise.race([capture, timeout]).catch(() => null)
}
