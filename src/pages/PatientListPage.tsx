import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, X } from 'lucide-react'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'

import { isActivePatient, type Patient } from '@/types/patient'
import { SeedTestDataPanel } from '@/components/dev/SeedTestDataPanel'
import { forzarSincronizacionLocal } from '@/services/clinicalSyncService'

function foldSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function compactDocument(value: string): string {
  return foldSearchText(value).replace(/[.\s]/g, '')
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function patientMatchesQuery(
  patient: Pick<Patient, 'firstName' | 'lastName' | 'documentNumber'>,
  query: string,
): boolean {
  const normalized = foldSearchText(query).trim()
  if (!normalized) return true

  const name = foldSearchText(`${patient.firstName} ${patient.lastName}`)
  const document = compactDocument(patient.documentNumber)
  const documentDigits = digitsOnly(patient.documentNumber)

  return normalized.split(/\s+/).every((token) => {
    if (name.includes(token)) return true
    const compactToken = token.replace(/[.\s]/g, '')
    if (compactToken && document.includes(compactToken)) return true
    const tokenDigits = digitsOnly(token)
    return tokenDigits.length > 0 && documentDigits.includes(tokenDigits)
  })
}

function formatShownCount(shown: number, total: number): string {
  const noun = total === 1 ? 'paciente' : 'pacientes'
  return `Mostrando ${shown} de ${total} ${noun}`
}

export function PatientListPage() {
  const { can } = useAuth()
  const { audit } = useAudit()
  const loggedRef = useRef(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [query, setQuery] = useState('')

  const patients = useLiveQuery(async () => {
    const all = await db.patients.orderBy('lastName').reverse().toArray()
    return all.filter(isActivePatient)
  })

  const filteredPatients = useMemo(
    () => (patients ?? []).filter((patient) => patientMatchesQuery(patient, query)),
    [patients, query],
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

      {!patients ? (
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
          <div className="mb-4">
            <label htmlFor="active-patient-search" className="sr-only">
              Buscar pacientes activos
            </label>
            <div className="relative max-w-xl">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="active-patient-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, apellido o documento"
                autoComplete="off"
                className="input-field w-full py-2.5 pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-dental-500"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500" aria-live="polite">
              {formatShownCount(filteredPatients.length, patients.length)}
            </p>
          </div>

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
