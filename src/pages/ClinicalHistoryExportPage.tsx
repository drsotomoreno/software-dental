import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { ClinicalHistoryExportPanel } from '@/components/portability'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import type { ClinicalHistoryExportFormat } from '@/types/portability'
import { EXPORT_FORMAT_LABELS } from '@/types/portability'
import type { Patient } from '@/types/patient'
import { CLINICAL_HISTORY_PAGE_TITLE_CLASS } from '@/constants/clinicalHistorySections'

export function ClinicalHistoryExportPage() {
  const { user } = useAuth()
  const { audit } = useAudit()
  const patients = useLiveQuery(() => db.patients.toArray())
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!patients) return []
    const q = search.trim().toLowerCase()
    if (!q) return patients
    return patients.filter(
      (p) =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.documentNumber.includes(q),
    )
  }, [patients, search])

  const selectedPatient = useMemo(() => {
    if (!selectedId || !patients) return null
    return patients.find((p) => String(p.id ?? '') === selectedId) ?? null
  }, [selectedId, patients])

  const patientRouteId = selectedPatient ? String(selectedPatient.id ?? '') : ''

  const handleExported = async (format: ClinicalHistoryExportFormat, recordCount: number) => {
    if (!selectedPatient) return
    await audit({
      action: 'EXPORT_PORTABILITY',
      resourceType: 'portability',
      resourceId: String(selectedPatient.id ?? ''),
      details: `${EXPORT_FORMAT_LABELS[format]} — ${recordCount} atención(es) — ${selectedPatient.documentType} ${selectedPatient.documentNumber}`,
    })
  }

  if (!user) {
    return <p className="text-slate-500">Cargando perfil del prestador...</p>
  }

  return (
    <RequirePermission permission="export.portability">
      <div className="space-y-6">
        <div>
          <h1 className={CLINICAL_HISTORY_PAGE_TITLE_CLASS}>
            Historia Clínica
          </h1>
          <p className="mt-1 max-w-3xl text-slate-600">
            Cumplimiento del derecho de acceso y portabilidad del paciente. Genere el Resumen
            Digital de Atención (RDA) en formatos estándar para entrega al paciente o transferencia
            a otro prestador, sin vendor lock-in.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card lg:col-span-1">
            <h2 className="mb-3 text-base font-semibold text-slate-800">Seleccionar paciente</h2>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o documento…"
              className="input-field mb-3"
            />
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {filtered.map((patient: Patient) => {
                const id = String(patient.id ?? '')
                const active = selectedId === id
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        active
                          ? 'bg-dental-100 font-medium text-dental-800'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {patient.firstName} {patient.lastName}
                      <span className="block text-xs text-slate-500">
                        {patient.documentType} {patient.documentNumber}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {filtered.length === 0 && (
              <p className="text-sm text-slate-500">No hay pacientes que coincidan.</p>
            )}
          </div>

          <div className="lg:col-span-2">
            {selectedPatient && patientRouteId ? (
              <ClinicalHistoryExportPanel
                patientRouteId={patientRouteId}
                patient={selectedPatient}
                professional={user}
                onExported={handleExported}
              />
            ) : (
              <div className="card text-center text-sm text-slate-500">
                Seleccione un paciente para generar su historia clínica exportable.
                <p className="mt-2">
                  También puede exportar desde la{' '}
                  <Link to="/pacientes" className="text-dental-600 hover:underline">
                    ficha individual del paciente
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </RequirePermission>
  )
}
