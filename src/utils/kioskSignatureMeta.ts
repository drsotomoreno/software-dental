import {
  MIN_SIGNATURE_STROKES,
  type SignatureCaptureMetadata,
} from '@/types/signature'

/** Metadatos del lienzo de la tableta, para que la firma pase la validación clínica. */
export function signatureMetaFromKioskForm(
  formData: Record<string, unknown> | undefined,
): SignatureCaptureMetadata | undefined {
  const raw = formData?.signatureMeta
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const meta = raw as Record<string, unknown>
  const strokeCount = Number(meta.strokeCount)
  if (meta.signatureMethod !== 'canvas_biometric') return undefined
  if (!Number.isFinite(strokeCount) || strokeCount < MIN_SIGNATURE_STROKES) return undefined
  const now = new Date().toISOString()
  return {
    signatureMethod: 'canvas_biometric',
    strokeCount,
    captureStartedAt: typeof meta.captureStartedAt === 'string' ? meta.captureStartedAt : now,
    captureEndedAt: typeof meta.captureEndedAt === 'string' ? meta.captureEndedAt : now,
    canvasWidth: Number(meta.canvasWidth) || 0,
    canvasHeight: Number(meta.canvasHeight) || 0,
  }
}
