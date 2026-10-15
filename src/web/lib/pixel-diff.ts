import pixelmatch from 'pixelmatch'

export interface PixelDiff {
  blob: Blob
  width: number
  height: number
  changedPixels: number
  sizeChanged: boolean
}

const PLAYWRIGHT_THRESHOLD = 0.2

function pixelsOf(image: ImageBitmap, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, width, height)
}

export async function computePixelDiff(before: Blob, after: Blob): Promise<PixelDiff> {
  const [oldImage, newImage] = await Promise.all([createImageBitmap(before), createImageBitmap(after)])
  const width = Math.max(oldImage.width, newImage.width)
  const height = Math.max(oldImage.height, newImage.height)
  const oldPixels = pixelsOf(oldImage, width, height)
  const newPixels = pixelsOf(newImage, width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const output = context.createImageData(width, height)
  const changedPixels = pixelmatch(oldPixels.data, newPixels.data, output.data, width, height, { threshold: PLAYWRIGHT_THRESHOLD })
  context.putImageData(output, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not draw the difference.')), 'image/png'))
  return {
    blob,
    width,
    height,
    changedPixels,
    sizeChanged: oldImage.width !== newImage.width || oldImage.height !== newImage.height,
  }
}
