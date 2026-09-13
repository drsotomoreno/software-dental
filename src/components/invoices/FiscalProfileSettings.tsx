import { useEffect, useState } from 'react'
import { FileJson } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { canManageClinicTeam } from '@/utils/permissions'
import { FiscalProfileSelector } from '@/components/onboarding'
import { persistClinicPerfilFiscal } from '@/services/fiscalProfileService'
import { normalizePerfilFiscal, type FiscalProfile } from '@/utils/fiscalProfile'
import type { BillingModalitySettings } from '@/types/billingModality'
import type { TemporaryRipsRecord } from '@/types/ripsTemporal'

const STATUS_LABELS: Record<TemporaryRipsRecord['status'], string> = {
  draft: 'Borrador',
  ready: 'Pendiente',
  pendiente: 'Pendiente',
  submitted: 'Radicado',
  linked_to_invoice: 'Vinculado a FEV',
}

interface FiscalProfileSettingsProps {
  settings: BillingModalitySettings
  onPersist: (next: BillingModalitySettings) => void
}

export function FiscalProfileSettings({ settings, onPersist }: FiscalProfileSettingsProps) {
  const { user, applySessionUser } = useAuth()
  const canEdit = canManageClinicTeam(user)
  const current = normalizePerfilFiscal(settings.perfilFiscal ?? user?.perfilFiscal)

  const selectProfile = async (perfilFiscal: FiscalProfile) => {
    if (!canEdit || perfilFiscal === current) return
    onPersist({ ...settings, perfilFiscal })
    await persistClinicPerfilFiscal(perfilFiscal, {
      user,
      applySessionUser,
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <FiscalProfileSelector
        value={current}
        onChange={(next) => void selectProfile(next)}
        disabled={!canEdit}
        title="Perfil fiscal de la clínica"
        description="Define si el prestador está obligado a factura electrónica de venta. Un profesional independiente por debajo de 3.500 UVT ($183.309.000 COP en 2026) reporta RIPS sin FEV."
      />
    </div>
  )
}

export function TemporaryRipsPanel() {
  const { user } = useAuth()
  const clinicId = user?.clinicId || user?.id
  const records = useLiveQuery(
    () =>
      clinicId
        ? db.ripsTemporales.where('clinicId').equals(clinicId).reverse().sortBy('updatedAt')
        : db.ripsTemporales.orderBy('updatedAt').reverse().toArray(),
    [clinicId],
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  const rows = records ?? []

  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-2">
        <FileJson className="h-5 w-5 text-dental-700" aria-hidden />
        <div>
          <h2 className="text-lg font-bold text-slate-900">RIPS temporales</h2>
          <p className="text-sm text-slate-600">
            Paquetes previos a la FEV o de prestadores no obligados. El campo numFactura admite
            null.
          </p>
        </div>
      </div>

      {!ready || records === undefined ? (
        <p className="text-sm text-slate-500">Cargando RIPS temporales...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No hay RIPS temporales almacenados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Actualizado</th>
                <th className="px-3 py-2">Perfil fiscal</th>
                <th className="px-3 py-2">numFactura</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Usuarios</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-700">
                    {row.updatedAt.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.perfilFiscal}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">
                    {row.numFactura ?? 'null'}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{STATUS_LABELS[row.status]}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.ripsJson?.usuarios?.length ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
