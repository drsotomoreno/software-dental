import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { usePatientListFilter } from '@/hooks/usePatientsList'

import { isActivePatient } from '@/types/patient'
import { PatientListNoMatches, PatientListSearch } from '@/components/patients/PatientListSearch'
import { SeedTestDataPanel } from '@/components/dev/SeedTestDataPanel'
import { forzarSincronizacionLocal } from '@/services/clinicalSyncService'

export function PatientListPage() {
  const { can } = useAuth()
  const { audit } = useAudit()
  const loggedRef = useRef(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const patients = useLiveQuery(async () => {
    const all = await db.patients.orderBy('lastName').reverse().toArray()
    return all.filter(isActivePatient)
  })
  const { query, setQuery, debouncedQuery, filteredPatients } = usePatientListFilter(patients)

  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    audit({
      action: 'VIEW_PATIENT_LIST',
      resourceType: 'patient',
      details: 'Consulta listado de pacientes',
    })
  }, [audit])

  const handleForceSync = async () => {
    setSyncing(true)
    setSyncMessage('')
    const result = await forzarSincronizacionLocal()
    setSyncing(false)
    if (result.ok) {
      setSyncMessage(
        `Sincronizados ${result.patients} pacientes y ${result.appointments} citas (${result.clinicId}).`,
      )
    } else {
      setSyncMessage(result.error || 'No se pudo forzar la sincronización.')
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Pacientes Activos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void handleForceSync()}
            disabled={syncing}
          >
            {syncing ? 'Sincronizando…' : 'Forzar Sincronización Local'}
          </button>
          {can('patients.write') && (
            <Link to="/pacientes/nuevo" className="btn-primary">
              + Nuevo Paciente
            </Link>
          )}
        </div>
      </div>

      {syncMessage ? <p className="mb-4 text-sm text-slate-600">{syncMessage}</p> : null}

      {can('patients.write') && <SeedTestDataPanel />}

      {!patients || !filteredPatients ? (
        <p className="text-slate-500">Cargando...</p>
      ) : patients.length === 0 ? (
        <div className="card text-center">
          <p className="text-slate-500">No hay pacientes registrados.</p>
          {can('patients.write') && (
            <Link to="/pacientes/nuevo" className="btn-primary mt-4 inline-flex">
              Registrar primer paciente
            </Link>
          )}
        </div>
      ) : (
        <>
          <PatientListSearch value={query} onChange={setQuery} />
          {filteredPatients.length === 0 ? (
            <PatientListNoMatches query={debouncedQuery} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-600">Documento</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Nombre</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Teléfono</th>
                    <th className="px-4 py-3 font-medium text-slate-600">EPS</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPatients.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs">
                        {p.documentType} {p.documentNumber}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {p.firstName} {p.lastName}
                      </td>
                      <td className="px-4 py-3">{p.phone}</td>
                      <td className="px-4 py-3">{p.insurer ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/pacientes/${p.id}`}
                          state={{ resetHistoryView: true }}
                          className="text-dental-600 hover:underline"
                        >
                          Ver historia
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
