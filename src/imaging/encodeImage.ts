type AnyCanvas = OffscreenCanvas | HTMLCanvasElement

function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function canvasToBlob(
  canvas: AnyCanvas,
  type: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality })
  }
  const htmlCanvas = canvas as HTMLCanvasElement
  return new Promise((resolve, reject) => {
    htmlCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('No se pudo comprimir la imagen.'))
      },
      type,
      quality,
    )
  })
}

export async function rgbaToCompressed(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: { maxSide?: number; quality?: number } = {},
): Promise<{ data: ArrayBuffer; mimeType: string; width: number; height: number }> {
  const maxSide = options.maxSide ?? 1024
  const quality = options.quality ?? 0.84
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const outW = Math.max(1, Math.round(width * scale))
  const outH = Math.max(1, Math.round(height * scale))

  const source = createCanvas(width, height)
  const sourceCtx = source.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!sourceCtx) throw new Error('Canvas 2D no disponible.')
  const pixels = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba)
  sourceCtx.putImageData(new ImageData(pixels, width, height), 0, 0)

  const target = scale === 1 ? source : createCanvas(outW, outH)
  if (scale !== 1) {
    const ctx = target.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx || !('drawImage' in ctx)) throw new Error('Canvas 2D no disponible.')
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(source as CanvasImageSource, 0, 0, outW, outH)
  }

  let blob = await canvasToBlob(target, 'image/webp', quality)
  let mimeType = blob.type || 'image/webp'
  if (mimeType !== 'image/webp' || blob.size < 32) {
    blob = await canvasToBlob(target, 'image/jpeg', quality)
    mimeType = blob.type || 'image/jpeg'
  }
  return {
    data: await blob.arrayBuffer(),
    mimeType,
    width: outW,
    height: outH,
  }
}

export async function bitmapToCompressed(
  source: ImageBitmap | HTMLImageElement,
  options: { maxSide?: number; quality?: number } = {},
): Promise<{ data: ArrayBuffer; mimeType: string; width: number; height: number }> {
  const maxSide = options.maxSide ?? 1024
  const quality = options.quality ?? 0.84
  const width = 'naturalWidth' in source ? source.naturalWidth || source.width : source.width
  const height = 'naturalHeight' in source ? source.naturalHeight || source.height : source.height
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const outW = Math.max(1, Math.round(width * scale))
  const outH = Math.max(1, Math.round(height * scale))
  const canvas = createCanvas(outW, outH)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx || !('drawImage' in ctx)) throw new Error('Canvas 2D no disponible.')
  ctx.drawImage(source as CanvasImageSource, 0, 0, outW, outH)
  let blob = await canvasToBlob(canvas, 'image/webp', quality)
  let mimeType = blob.type || 'image/webp'
  if (mimeType !== 'image/webp' || blob.size < 32) {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    mimeType = blob.type || 'image/jpeg'
  }
  return {
    data: await blob.arrayBuffer(),
    mimeType,
    width: outW,
    height: outH,
  }
}

export async function makeThumbFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<{ data: ArrayBuffer; mimeType: string }> {
  const encoded = await rgbaToCompressed(rgba, width, height, { maxSide: 128, quality: 0.7 })
  return { data: encoded.data, mimeType: encoded.mimeType }
}

export async function makeThumbFromBitmap(
  source: ImageBitmap | HTMLImageElement,
): Promise<{ data: ArrayBuffer; mimeType: string }> {
  const encoded = await bitmapToCompressed(source, { maxSide: 128, quality: 0.7 })
  return { data: encoded.data, mimeType: encoded.mimeType }
}
