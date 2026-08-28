import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'

import { isActivePatient } from '@/types/patient'
import { SeedTestDataPanel } from '@/components/dev/SeedTestDataPanel'

export function PatientListPage() {
  const { can } = useAuth()
  const { audit } = useAudit()
  const loggedRef = useRef(false)

  const patients = useLiveQuery(async () => {
    const all = await db.patients.orderBy('lastName').reverse().toArray()
    return all.filter(isActivePatient)
  })

  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    audit({
      action: 'VIEW_PATIENT_LIST',
      resourceType: 'patient',
      details: 'Consulta listado de pacientes',
    })
  }, [audit])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Pacientes Activos</h1>
        {can('patients.write') && (
          <Link to="/pacientes/nuevo" className="btn-primary">
            + Nuevo Paciente
          </Link>
        )}
      </div>

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
              {patients.map((p) => (
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
    </div>
  )
}
