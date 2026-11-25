import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'

import { isActivePatient } from '@/types/patient'
import { SeedTestDataPanel } from '@/components/dev/SeedTestDataPanel'
import { PatientListSearch } from '@/components/patients/PatientListSearch'
import { ClinicalSyncHealthBanner } from '@/components/patients/ClinicalSyncHealthBanner'
import { ClinicHydrationBanner } from '@/components/patients/ClinicHydrationBanner'
import { forzarSincronizacionLocal } from '@/services/clinicalSyncService'
import { belongsToCurrentClinic } from '@/services/clinicLocalIsolation'
import { resolveActiveClinicSyncId } from '@/services/clinicalSyncState'
import { patientMatchesQuery } from '@/utils/patientListSearch'
import { useDentalEmrDbEpoch } from '@/hooks/useDentalEmrDbEpoch'
import { useClinicHydration } from '@/hooks/useClinicHydration'

export function PatientListPage() {
  const { can, user } = useAuth()
  const { audit } = useAudit()
  const loggedRef = useRef(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [query, setQuery] = useState('')
  const clinicId = resolveActiveClinicSyncId(user)
  const { epoch: dentalDbEpoch, dbName: dentalDbName } = useDentalEmrDbEpoch()
  const { isHydrating } = useClinicHydration()

  const patients = useLiveQuery(async () => {
    if (!clinicId) return []
    try {
      const all = await db.patients.orderBy('lastName').reverse().toArray()
      return (all ?? []).filter(
        (patient) =>
          patient && belongsToCurrentClinic(patient, clinicId) && isActivePatient(patient),
      )
    } catch (error) {
      console.warn('[PatientListPage] Dexie aún no listo:', error)
      return []
    }
  }, [clinicId, dentalDbEpoch, dentalDbName])

  const pendingSyncCount = useLiveQuery(async () => {
    if (!clinicId) return 0
    try {
      const all = await db.patients.toArray()
      return (all ?? []).filter(
        (patient) =>
          patient &&
          belongsToCurrentClinic(patient, clinicId) &&
          (patient.pendingSync === true || !patient.lastSyncedAt),
      ).length
    } catch {
      return 0
    }
  }, [clinicId])

  const safePatients = patients ?? []
  const dexieReady = patients !== undefined
  const showHydration =
    Boolean(clinicId) && isHydrating && (!dexieReady || safePatients.length === 0)

  const filteredPatients = useMemo(
    () => safePatients.filter((patient) => patient && patientMatchesQuery(patient, query)),
    [safePatients, query],
  )

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
        `Servidor: ${result.patients} pacientes de esta clínica. Aceptó ${result.acceptedPatients} en esta subida. En este equipo quedan ${result.pending} pendientes.`,
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
            disabled={syncing || showHydration}
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

      <ClinicHydrationBanner visible={showHydration} />

      {pendingSyncCount ? (
        <p className="mb-4 text-sm text-amber-800">
          {pendingSyncCount} paciente{pendingSyncCount === 1 ? '' : 's'} de esta cuenta aún no tienen
          acuse del servidor. Los otros dispositivos no los ven hasta que esta subida termine.
        </p>
      ) : null}

      {syncMessage ? <p className="mb-4 text-sm text-slate-600">{syncMessage}</p> : null}

      <ClinicalSyncHealthBanner listEmpty={dexieReady && safePatients.length === 0 && !isHydrating} />

      {can('patients.write') && <SeedTestDataPanel />}

      {showHydration || !dexieReady ? (
        <p className="text-slate-500">Sincronizando datos de la clínica…</p>
      ) : safePatients.length === 0 ? (
        <div className="card text-center">
          <p className="text-slate-500">
            No hay pacientes activos en este equipo. Si espera ver historias, use «Forzar
            Sincronización Local» o revise Valorados / Terminados.
          </p>
          {can('patients.write') && (
            <Link to="/pacientes/nuevo" className="btn-primary mt-4 inline-flex">
              Registrar primer paciente
            </Link>
          )}
        </div>
      ) : (
        <>
          <PatientListSearch
            id="active-patient-search"
            label="Buscar pacientes activos"
            query={query}
            onQueryChange={setQuery}
            shown={filteredPatients.length}
            total={safePatients.length}
          />

          {filteredPatients.length === 0 ? (
            <div className="card text-center">
              <p className="text-slate-500">
                Ningún paciente coincide con «{query.trim()}».
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="btn-secondary mt-4"
              >
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 font-medium text-slate-600">Documento</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600">Nombre</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600">Teléfono</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600">EPS</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPatients.map((p) => {
                    const rowKey = String(p?.syncId || p?.id || '')
                    if (!rowKey) return null
                    return (
                      <tr key={rowKey} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {p?.documentType ?? ''} {p?.documentNumber ?? ''}
                        </td>
                        <td className="px-4 py-2.5 font-medium">
                          {p?.firstName ?? ''} {p?.lastName ?? ''}
                        </td>
                        <td className="px-4 py-2.5">{p?.phone ?? '—'}</td>
                        <td className="px-4 py-2.5">{p?.insurer ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <Link
                            to={`/pacientes/${encodeURIComponent(rowKey)}`}
                            state={{ resetHistoryView: true }}
                            className="text-dental-600 hover:underline"
                          >
                            Ver historia
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
