import { useEffect, useState } from 'react'
import {
  emptyListLooksLikeSyncFailure,
  getClinicalSyncHealth,
  subscribeClinicalSyncHealth,
  type ClinicalSyncHealth,
} from '@/services/clinicalSyncHealth'
import { forzarSincronizacionLocal } from '@/services/clinicalSyncService'

type Props = {
  /** true cuando el listado filtrado de esta clínica está vacío */
  listEmpty: boolean
}

/**
 * Multi-tenant: no confundir “sin pacientes” con fallo de sync (caso Isabel).
 */
export function ClinicalSyncHealthBanner({ listEmpty }: Props) {
  const [health, setHealth] = useState<ClinicalSyncHealth>(() => getClinicalSyncHealth())
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribeClinicalSyncHealth(() => setHealth(getClinicalSyncHealth())), [])

  if (!listEmpty || !emptyListLooksLikeSyncFailure(health)) return null

  const title =
    health.status === 'meta_missing'
      ? 'No se pudo cargar el índice de pacientes del servidor'
      : 'La sincronización clínica falló'

  return (
    <div
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="alert"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-amber-900">
        Esta clínica puede tener historias en el servidor que aún no están en este equipo. No asuma
        que no hay pacientes. {health.error ? `(${health.error})` : null}
      </p>
      <button
        type="button"
        className="btn-secondary mt-3"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void forzarSincronizacionLocal()
            .then((result) => {
              if (result.ok) {
                setHealth(getClinicalSyncHealth())
                window.location.reload()
              }
            })
            .finally(() => setBusy(false))
        }}
      >
        {busy ? 'Reintentando…' : 'Reintentar sincronización'}
      </button>
    </div>
  )
}
