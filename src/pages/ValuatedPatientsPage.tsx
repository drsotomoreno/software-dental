import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { PatientListSearch } from '@/components/patients/PatientListSearch'
import { ClinicalSyncHealthBanner } from '@/components/patients/ClinicalSyncHealthBanner'
import { belongsToCurrentClinic } from '@/services/clinicLocalIsolation'
import { resolveActiveClinicSyncId } from '@/services/clinicalSyncState'
import { isValuatedOnlyPatient } from '@/types/patient'
import { patientMatchesQuery } from '@/utils/patientListSearch'
import {
  etiquetaAperturaPaciente,
  ordenarPorAperturaDesc,
} from '../../shared/patientOpenedAt.js'
import { resolveAccountHolderTitle } from '@/utils/quickBudgetPrint'
import { buildValuationFollowUpMessage, buildWhatsAppUrl } from '@/utils/whatsapp'

export function ValuatedPatientsPage() {
  const { can, user } = useAuth()
  const { audit } = useAudit()
  const loggedRef = useRef(false)
  const [query, setQuery] = useState('')
  const clinicId = resolveActiveClinicSyncId(user)

  const patients = useLiveQuery(async () => {
    if (!clinicId) return []
    const all = await db.patients.orderBy('lastName').reverse().toArray()
    return all.filter(
      (patient) => belongsToCurrentClinic(patient, clinicId) && isValuatedOnlyPatient(patient),
    )
  }, [clinicId])

  const filteredPatients = useMemo(
    () =>
      ordenarPorAperturaDesc(
        (patients ?? []).filter((patient) => patientMatchesQuery(patient, query)),
      ),
    [patients, query],
  )

  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    audit({
      action: 'VIEW_PATIENT_LIST',
      resourceType: 'patient',
      details: 'Consulta listado Pacientes Valorados',
    })
  }, [audit])

  // Rehidrata valuationDraft faltantes (pull slim no trae drafts).
  useEffect(() => {
    if (!clinicId || !patients?.length) return
    let cancelled = false
    void (async () => {
      const { prefetchMissingValuationDrafts } = await import('@/services/clinicalSyncService')
      if (cancelled) return
      await prefetchMissingValuationDrafts({ limit: 40, concurrency: 2 }).catch(() => undefined)
    })()
    return () => {
      cancelled = true
    }
  }, [clinicId, patients?.length])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pacientes Valorados</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ordenados por fecha de apertura, del más nuevo al más antiguo. Pulse{' '}
            <strong>Abrir valoración</strong> para ver la historia abreviada completa.
          </p>
        </div>
        {can('patients.write') && (
          <Link to="/pacientes/nuevo" className="btn-primary">
            + Nuevo Paciente
          </Link>
        )}
      </div>

      <ClinicalSyncHealthBanner listEmpty={Boolean(patients && patients.length === 0)} />

      {!patients ? (
        <p className="text-slate-500">Cargando...</p>
      ) : patients.length === 0 ? (
        <div className="card text-center">
          <p className="text-slate-500">No hay pacientes en valoración registrados.</p>
          {can('patients.write') && (
            <Link to="/pacientes/nuevo" className="btn-primary mt-4 inline-flex">
              Registrar valoración
            </Link>
          )}
        </div>
      ) : (
        <>
          <PatientListSearch
            id="valuated-patient-search"
            label="Buscar pacientes valorados"
            query={query}
            onQueryChange={setQuery}
            shown={filteredPatients.length}
            total={patients.length}
          />

          {filteredPatients.length === 0 ? (
            <div className="card text-center">
              <p className="text-slate-500">
                Ningún paciente coincide con «{query.trim()}».
              </p>
              <button type="button" onClick={() => setQuery('')} className="btn-secondary mt-4">
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {filteredPatients.map((patient) => {
                const whatsappUrl = buildWhatsAppUrl(
                  patient.phone,
                  buildValuationFollowUpMessage(resolveAccountHolderTitle(user)),
                )
                const valuationPath = `/pacientes/${patient.id}`
                const fullName = `${patient.firstName} ${patient.lastName}`.trim()
                return (
                  <li
                    key={patient.id}
                    className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={valuationPath}
                            state={{ resetHistoryView: true }}
                            className="text-base font-semibold text-dental-800 hover:underline"
                          >
                            {fullName}
                          </Link>
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                            Solo valoración
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">
                          <span className="font-mono text-xs">
                            {patient.documentType} {patient.documentNumber}
                          </span>
                          <span className="mx-2 text-slate-300">·</span>
                          <span>{patient.phone || 'Sin teléfono'}</span>
                          <span className="mx-2 text-slate-300">·</span>
                          <span>{patient.insurer || 'Sin EPS'}</span>
                        </p>
                        <p className="text-xs font-medium text-teal-900">
                          Historia creada:{' '}
                          {etiquetaAperturaPaciente(patient.createdAt) || '—'}
                        </p>
                      </div>

                      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                        <Link
                          to={valuationPath}
                          state={{ resetHistoryView: true }}
                          className="inline-flex items-center justify-center rounded-md bg-dental-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-dental-700"
                          aria-label={`Abrir valoración de ${fullName}`}
                        >
                          Abrir valoración
                        </Link>
                        {whatsappUrl ? (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-md bg-[#25D366] px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#1ebe57]"
                            aria-label={`Enviar WhatsApp a ${fullName}`}
                          >
                            Enviar WhatsApp
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            title="Este paciente no tiene un celular válido para WhatsApp"
                            className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-500"
                          >
                            Enviar WhatsApp
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
