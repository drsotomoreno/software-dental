import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  seedTestClinicalAndBillingData,
  type SeedTestDataResult,
} from '@/db/seed-test-data'

const CASE_LABELS: Record<string, string> = {
  A: 'Atención estándar (2 CUPS)',
  B: 'Control $0 no facturable',
  C: 'Atención mixta CUPS + personalizado',
}

export function SeedTestDataPanel() {
  if (!import.meta.env.DEV) return null

  return <SeedTestDataPanelInner />
}

function SeedTestDataPanelInner() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SeedTestDataResult | null>(null)

  const handleSeed = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const next = await seedTestClinicalAndBillingData({
        replace: true,
        professional: user,
      })
      setResult(next)
      if (next.skipped && next.reason) {
        setError(next.reason)
      }
      if (next.errors?.length) {
        setError(next.errors.join(' · '))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar los datos de prueba.'
      setError(message)
      console.error('[seed-test-data]', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-950">Datos de prueba — clínica y facturación</h2>
      <p className="mt-1 text-sm text-amber-900">
        Inserta 3 pacientes con historias firmadas (Casos A, B y C) en <strong>esta</strong> base
        local para probar facturas, RIPS e impresión. Si limpió IndexedDB, el seed automático ya no
        se ejecuta al recargar; use este botón para volver a cargarlos.
      </p>
      <button
        type="button"
        onClick={() => void handleSeed()}
        disabled={busy}
        className="btn-secondary mt-3 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
      >
        {busy ? 'Cargando…' : 'Cargar Datos de Prueba'}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {result && result.patients.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-amber-950">
          {result.patients.map((patient) => (
            <li key={`${patient.caseId}-${patient.patientId}`}>
              <Link
                to={`/pacientes/${patient.patientId}`}
                state={{ resetHistoryView: true }}
                className="font-medium text-dental-800 underline"
              >
                Caso {patient.caseId}: {patient.document}
              </Link>
              <span className="text-amber-800"> — {CASE_LABELS[patient.caseId]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
