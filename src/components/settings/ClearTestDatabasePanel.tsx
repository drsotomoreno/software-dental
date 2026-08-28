import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { purgeTestIndexedDb } from '@/services/databaseResetService'

const WARNING_TEXT =
  '¿Estás seguro de eliminar todos los pacientes e historias clínicas de prueba? Esta acción vaciará completamente la base de datos y no se puede deshacer.'

export function ClearTestDatabasePanel() {
  const { can } = useAuth()
  const { audit } = useAudit()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!can('backups.manage')) return null

  const handleConfirm = async () => {
    setBusy(true)
    setError('')
    try {
      await audit({
        action: 'PURGE_TEST_DATABASE',
        resourceType: 'database',
        details: 'Purga total de IndexedDB y desactivación del seed automático (has_cleared_test_data)',
      })
      await purgeTestIndexedDb()
      window.location.assign('/')
    } catch {
      setBusy(false)
      setError('No se pudo vaciar IndexedDB. Intente de nuevo.')
    }
  }

  return (
    <div className="card space-y-3 border-red-300 bg-red-50/40">
      <div>
        <h2 className="text-base font-semibold text-red-950">Zona peligrosa</h2>
        <p className="mt-1 text-sm text-slate-700">
          Elimina pacientes, historias, facturas y RIPS de prueba. Tras confirmar, se guarda{' '}
          <code className="rounded bg-white px-1 text-xs">has_cleared_test_data</code> y el seed
          automático no volverá a poblar IndexedDB al recargar.
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setError('')
          setOpen(true)
        }}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        Limpiar Base de Datos de Prueba
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="purge-db-title"
            aria-describedby="purge-db-warning"
            className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-xl"
          >
            <h3 id="purge-db-title" className="text-lg font-semibold text-red-900">
              Confirmar eliminación
            </h3>
            <p id="purge-db-warning" className="mt-2 text-sm text-slate-700">
              {WARNING_TEXT}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirm()}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busy ? 'Borrando…' : 'Sí, borrar todo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
