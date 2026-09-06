import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getDiagnosticAidBlobByAidId } from '@/services/diagnosticAidBlobStore'
import {
  getDerivative,
  listSlices,
} from '@/services/diagnosticAidDerivativeStore'
import { enqueueDerivativeJobForEntry } from '@/imaging/derivativeJobs'
import type { DiagnosticAid } from '@/types/diagnosticAid'
import { resolveStudyKind } from '@/utils/diagnosticAidWebClassification'
import { DiagnosticViewerShell } from '@/viewers/DiagnosticViewerShell'
import type { LightboxImage } from '@/viewers/PhotoLightboxViewer'

const PhotoLightboxViewer = lazy(async () => {
  const mod = await import('@/viewers/PhotoLightboxViewer')
  return { default: mod.PhotoLightboxViewer }
})
const Mesh3dViewer = lazy(async () => {
  const mod = await import('@/viewers/Mesh3dViewer')
  return { default: mod.Mesh3dViewer }
})
const DicomSliceScroller = lazy(async () => {
  const mod = await import('@/viewers/DicomSliceScroller')
  return { default: mod.DicomSliceScroller }
})

interface DiagnosticViewerHostProps {
  item: DiagnosticAid
  encounterItems: DiagnosticAid[]
  onClose: () => void
}

interface LoadedUrls {
  photo?: LightboxImage[]
  glb?: string
  poster?: string | null
  axial?: string[]
  coronal?: string[]
}

export function DiagnosticViewerHost({ item, encounterItems, onClose }: DiagnosticViewerHostProps) {
  const kind = resolveStudyKind(item)
  const status = item.viewerStatus ?? 'idle'
  const [urls, setUrls] = useState<LoadedUrls | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const galleryCandidates = useMemo(
    () =>
      encounterItems.filter((entry) => {
        if (entry.encounterId !== item.encounterId) return false
        const study = resolveStudyKind(entry)
        return study === 'photo' || study === 'dicom2d'
      }),
    [encounterItems, item.encounterId],
  )

  useEffect(() => {
    if (status === 'idle') {
      void enqueueDerivativeJobForEntry(item)
    }
  }, [item, status])

  useEffect(() => {
    let cancelled = false
    const created: string[] = []

    const objectUrl = (data: ArrayBuffer, mimeType: string) => {
      const url = URL.createObjectURL(new Blob([data], { type: mimeType }))
      created.push(url)
      return url
    }

    const load = async () => {
      setLoadError(null)
      try {
        if (kind === 'mesh3d') {
          const glb = await getDerivative(item.id, 'glb')
          if (!glb) return
          const poster = await getDerivative(item.id, 'thumb')
          if (cancelled) return
          setUrls({
            glb: objectUrl(glb.data, glb.mimeType),
            poster: poster ? objectUrl(poster.data, poster.mimeType) : null,
          })
          return
        }

        if (kind === 'dicomSeries') {
          const axial = await listSlices(item.id, 'axial')
          const coronal = await listSlices(item.id, 'coronal')
          if (cancelled) return
          setUrls({
            axial: axial.map((row) => objectUrl(row.data, row.mimeType)),
            coronal: coronal.map((row) => objectUrl(row.data, row.mimeType)),
          })
          return
        }

        const images: LightboxImage[] = []
        for (const entry of galleryCandidates) {
          const derived = await getDerivative(entry.id, 'dicom2d')
          if (derived) {
            images.push({
              id: entry.id,
              fileName: entry.fileName,
              url: objectUrl(derived.data, derived.mimeType),
            })
            continue
          }
          const blob = await getDiagnosticAidBlobByAidId(entry.id)
          if (blob) {
            images.push({
              id: entry.id,
              fileName: entry.fileName,
              url: objectUrl(blob.data, blob.mimeType),
            })
          }
        }
        if (cancelled) return
        if (!images.some((image) => image.id === item.id)) {
          const blob = await getDiagnosticAidBlobByAidId(item.id)
          const derived = await getDerivative(item.id, 'dicom2d')
          const source = derived ?? blob
          if (source) {
            images.unshift({
              id: item.id,
              fileName: item.fileName,
              url: objectUrl(source.data, source.mimeType),
            })
          }
        }
        setUrls({ photo: images })
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'No se pudo abrir el visor.')
        }
      }
    }

    if (status === 'ready' || kind === 'photo') {
      void load()
    }

    return () => {
      cancelled = true
      for (const url of created) URL.revokeObjectURL(url)
    }
  }, [galleryCandidates, item.id, item.fileName, kind, status])

  if (status === 'processing' && kind !== 'photo') {
    return (
      <DiagnosticViewerShell title={item.fileName} subtitle="Optimizando para móvil…" onClose={onClose}>
        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-300">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Generando vista ligera. Puede abrir el archivo original desde el menú.</p>
        </div>
      </DiagnosticViewerShell>
    )
  }

  if (status === 'failed' || loadError) {
    return (
      <DiagnosticViewerShell title={item.fileName} onClose={onClose}>
        <div className="space-y-3 p-6 text-sm text-red-200">
          <p>{loadError || item.viewerError || 'No se pudo preparar el visor.'}</p>
          <button
            type="button"
            className="rounded-lg bg-white/10 px-3 py-2 text-white"
            onClick={() => void enqueueDerivativeJobForEntry(item)}
          >
            Reintentar
          </button>
        </div>
      </DiagnosticViewerShell>
    )
  }

  return (
    <Suspense
      fallback={
        <DiagnosticViewerShell title={item.fileName} onClose={onClose}>
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
          </div>
        </DiagnosticViewerShell>
      }
    >
      {kind === 'mesh3d' && urls?.glb ? (
        <Mesh3dViewer src={urls.glb} poster={urls.poster} fileName={item.fileName} onClose={onClose} />
      ) : kind === 'dicomSeries' && urls?.axial ? (
        <DicomSliceScroller
          fileName={item.fileName}
          axialUrls={urls.axial}
          coronalUrls={urls.coronal ?? []}
          onClose={onClose}
        />
      ) : urls?.photo?.length ? (
        <PhotoLightboxViewer images={urls.photo} activeId={item.id} onClose={onClose} />
      ) : (
        <DiagnosticViewerShell title={item.fileName} onClose={onClose}>
          <p className="p-6 text-sm text-slate-300">Preparando vista previa…</p>
        </DiagnosticViewerShell>
      )}
    </Suspense>
  )
}
