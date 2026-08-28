import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { isCompletedPatient } from '@/types/patient'

export function CompletedPatientsPage() {
  const { can } = useAuth()
  const { audit } = useAudit()
  const loggedRef = useRef(false)

  const patients = useLiveQuery(async () => {
    const all = await db.patients.orderBy('lastName').reverse().toArray()
    return all.filter(isCompletedPatient)
  })

  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    audit({
      action: 'VIEW_PATIENT_LIST',
      resourceType: 'patient',
      details: 'Consulta listado Pacientes Terminados',
    })
  }, [audit])

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pacientes Terminados</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pacientes con tratamiento finalizado. Su historia clínica permanece disponible para
            consulta.
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
          <p className="text-slate-500">No hay pacientes con tratamiento terminado.</p>
          <Link to="/pacientes" className="btn-secondary mt-4 inline-flex">
            Ver pacientes activos
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-teal-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-teal-100 bg-teal-50">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600">Documento</th>
                <th className="px-4 py-3 font-medium text-slate-600">Nombre</th>
                <th className="px-4 py-3 font-medium text-slate-600">Teléfono</th>
                <th className="px-4 py-3 font-medium text-slate-600">EPS</th>
                <th className="px-4 py-3 font-medium text-slate-600">Estado</th>
                <th className="px-4 py-3 font-medium text-slate-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((patient) => (
                <tr key={patient.id} className="hover:bg-teal-50/40">
                  <td className="px-4 py-3 font-mono text-xs">
                    {patient.documentType} {patient.documentNumber}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {patient.firstName} {patient.lastName}
                  </td>
                  <td className="px-4 py-3">{patient.phone}</td>
                  <td className="px-4 py-3">{patient.insurer ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-900">
                      Tratamiento terminado
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/pacientes/${patient.id}`}
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
    </div>
  )
}
