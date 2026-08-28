import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { isValuatedOnlyPatient } from '@/types/patient'

export function ValuatedPatientsPage() {
  const { can } = useAuth()
  const { audit } = useAudit()
  const loggedRef = useRef(false)

  const patients = useLiveQuery(async () => {
    const all = await db.patients.orderBy('lastName').reverse().toArray()
    return all.filter(isValuatedOnlyPatient)
  })

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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pacientes Valorados</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pacientes registrados con solo valoración. Puede abrir su ficha o pasarlos a historia
            completa desde Nuevo Paciente.
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
        <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-amber-100 bg-amber-50">
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
                <tr key={patient.id} className="hover:bg-amber-50/40">
                  <td className="px-4 py-3 font-mono text-xs">
                    {patient.documentType} {patient.documentNumber}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {patient.firstName} {patient.lastName}
                  </td>
                  <td className="px-4 py-3">{patient.phone}</td>
                  <td className="px-4 py-3">{patient.insurer ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                      Solo valoración
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/pacientes/${patient.id}`}
                      state={{ resetHistoryView: true }}
                      className="text-dental-600 hover:underline"
                    >
                      Ver valoración
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
