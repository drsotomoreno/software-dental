import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { PatientListSearch } from '@/components/patients/PatientListSearch'
import { belongsToCurrentClinic } from '@/services/clinicLocalIsolation'
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

  const patients = useLiveQuery(async () => {
    const all = await db.patients.orderBy('lastName').reverse().toArray()
    return all.filter((patient) => belongsToCurrentClinic(patient) && isValuatedOnlyPatient(patient))
  })

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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pacientes Valorados</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ordenados por fecha de apertura, del más nuevo al más antiguo, para las tareas de
            mercadeo. Puede abrir la ficha o pasarlos a historia completa desde Nuevo Paciente.
          </p>
        </div>
        {can('patients.write') && (
          <Link to="/pacientes/nuevo" className="btn-primary">
            + Nuevo Paciente
          </Link>
        )}
      </div>

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
            <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-amber-100 bg-amber-50">
              <tr>
                <th className="px-4 py-2.5 font-medium text-slate-600">Historia creada en</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">Documento</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">Nombre</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">Teléfono</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">EPS</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">Estado</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">WhatsApp</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPatients.map((patient) => {
                const whatsappUrl = buildWhatsAppUrl(
                  patient.phone,
                  buildValuationFollowUpMessage(resolveAccountHolderTitle(user)),
                )
                return (
                  <tr key={patient.id} className="hover:bg-amber-50/40">
                    <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-teal-950">
                      {etiquetaAperturaPaciente(patient.createdAt) || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {patient.documentType} {patient.documentNumber}
                    </td>
                    <td className="px-4 py-2.5 font-medium">
                      {patient.firstName} {patient.lastName}
                    </td>
                    <td className="px-4 py-2.5">{patient.phone}</td>
                    <td className="px-4 py-2.5">{patient.insurer ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                        Solo valoración
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {whatsappUrl ? (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center whitespace-nowrap rounded-md bg-[#25D366] px-2.5 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-[#1ebe57]"
                          aria-label={`Enviar WhatsApp a ${patient.firstName} ${patient.lastName}`}
                        >
                          Enviar WhatsApp
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Este paciente no tiene un celular válido para WhatsApp"
                          className="inline-flex cursor-not-allowed items-center whitespace-nowrap rounded-md bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500"
                        >
                          Enviar WhatsApp
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/pacientes/${patient.id}`}
                        state={{ resetHistoryView: true }}
                        className="text-dental-600 hover:underline"
                      >
                        Ver valoración
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
