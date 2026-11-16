import { driveIdentityHeaders } from '@/services/googleDriveClinicContext'
import { isSignatureDriveRef } from '../../shared/signatureDriveRef.js'

const cache = new Map<string, Promise<string | null>>()

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Baja el PNG del proxy autenticado y lo deja en memoria como data URL. */
export async function fetchSignatureProxyAsDataUrl(src: string): Promise<string | null> {
  const response = await fetch(src, {
    headers: {
      Accept: 'image/png, image/jpeg, image/webp, */*',
      ...driveIdentityHeaders(),
    },
  })
  if (!response.ok) return null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return null
  const blob = await response.blob()
  if (!blob.size) return null
  const dataUrl = await blobToDataUrl(blob)
  return dataUrl.startsWith('data:image/') ? dataUrl : null
}

/** data URL se devuelve tal cual. Una referencia Drive se resuelve con el token de sesión. */
export function loadSignatureSrc(src: string | null | undefined): Promise<string | null> {
  const raw = String(src || '').trim()
  if (!raw) return Promise.resolve(null)
  if (raw.startsWith('data:image/') || raw.startsWith('blob:')) return Promise.resolve(raw)
  if (!isSignatureDriveRef(raw)) return Promise.resolve(raw)
  const cached = cache.get(raw)
  if (cached) return cached
  const pending = fetchSignatureProxyAsDataUrl(raw).catch(() => null)
  cache.set(raw, pending)
  return pending
}

/**
 * Sustituye referencias `/api/drive/file/...` por data URL antes de armar el HTML
 * de impresión. El diálogo de imprimir no envía el Bearer en las etiquetas img.
 */
export async function inlineDriveSignatureRefs<T>(value: T): Promise<T> {
  const clone = JSON.parse(JSON.stringify(value)) as T
  const tasks: Array<Promise<void>> = []

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => {
        if (typeof entry === 'string' && isSignatureDriveRef(entry)) {
          tasks.push(
            loadSignatureSrc(entry).then((dataUrl) => {
              if (dataUrl?.startsWith('data:image/')) node[index] = dataUrl
            }),
          )
          return
        }
        if (entry && typeof entry === 'object') visit(entry)
      })
      return
    }
    if (!node || typeof node !== 'object') return
    for (const [key, entry] of Object.entries(node as Record<string, unknown>)) {
      if (typeof entry === 'string' && isSignatureDriveRef(entry)) {
        tasks.push(
          loadSignatureSrc(entry).then((dataUrl) => {
            if (dataUrl?.startsWith('data:image/')) {
              ;(node as Record<string, unknown>)[key] = dataUrl
            }
          }),
        )
        continue
      }
      if (entry && typeof entry === 'object') visit(entry)
    }
  }

  visit(clone)
  await Promise.all(tasks)
  return clone
}
