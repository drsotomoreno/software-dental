/**
 * Reduce el PNG del SignaturePad a JPEG para que Socket.IO / nginx
 * no corten el envío (el default de body en muchos proxies es 1 MB).
 */
export async function compressSignatureDataUrl(
  dataUrl: string,
  options: { maxWidth?: number; quality?: number } = {},
): Promise<string> {
  const raw = String(dataUrl || '').trim()
  if (!raw.startsWith('data:image/')) return raw

  const maxWidth = options.maxWidth ?? 900
  const quality = options.quality ?? 0.72

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / Math.max(1, img.width))
        const width = Math.max(1, Math.round(img.width * scale))
        const height = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(raw)
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        const jpeg = canvas.toDataURL('image/jpeg', quality)
        resolve(jpeg.length < raw.length ? jpeg : raw)
      } catch {
        resolve(raw)
      }
    }
    img.onerror = () => resolve(raw)
    img.src = raw
  })
}
