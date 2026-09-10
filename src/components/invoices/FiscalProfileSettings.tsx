import { useEffect, useState } from 'react'
import { FileJson, Landmark } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { canManageClinicTeam } from '@/utils/permissions'
import {
  PERFIL_FISCAL_OPTIONS,
  isNoObligadoFev,
  normalizePerfilFiscal,
  type FiscalProfile,
} from '@/utils/fiscalProfile'
import type { BillingModalitySettings } from '@/types/billingModality'
import { updateOwnProfile } from '@/services/subscriptionService'
import { getStoredApiAuth, setStoredApiAuth } from '@/services/apiAuthService'
import type { TemporaryRipsRecord } from '@/types/ripsTemporal'

const STATUS_LABELS: Record<TemporaryRipsRecord['status'], string> = {
  draft: 'Borrador',
  ready: 'Listo',
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
    if (user?.id) {
      try {
        await db.users.update(user.id, { perfilFiscal })
      } catch {
        /* sesión API sin fila local en IndexedDB */
      }
      const remote = await updateOwnProfile({
        firstName: user.firstName,
        lastName: user.lastName,
        legalName: user.legalName,
        documentType: user.documentType,
        documentNumber: user.documentNumber,
        clinicName: user.clinicName,
        providerNit: user.providerNit,
        repsCode: user.repsCode,
        providerType: user.providerType,
        rethusNumber: user.rethusNumber,
        perfilFiscal,
        clientEmail: getStoredApiAuth()?.user?.email,
        clientUserId: getStoredApiAuth()?.user?.id,
      })
      if (remote.ok) {
        const latestAuth = getStoredApiAuth()
        setStoredApiAuth(latestAuth?.token ?? `session-${remote.user.id}`, remote.user)
        applySessionUser(remote.user)
      }
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <Landmark className="mt-0.5 h-5 w-5 text-dental-700" aria-hidden />
        <div>
          <h3 className="text-base font-semibold text-slate-900">Perfil fiscal de la clínica</h3>
          <p className="mt-1 text-sm text-slate-600">
            Define si el prestador está obligado a factura electrónica de venta. Los no obligados
            almacenan RIPS temporales con <span className="font-mono">numFactura</span> en null
            (Res. 2275).
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PERFIL_FISCAL_OPTIONS.map((option) => {
          const selected = current === option.id
          return (
            <button
              key={option.id}
              type="button"
              disabled={!canEdit}
              onClick={() => void selectProfile(option.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                selected
                  ? 'border-dental-500 bg-dental-50 ring-2 ring-dental-200'
                  : 'border-slate-200 bg-white hover:border-dental-200'
              } ${canEdit ? '' : 'cursor-not-allowed opacity-80'}`}
            >
              <p className="text-sm font-semibold text-slate-900">{option.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{option.hint}</p>
            </button>
          )
        })}
      </div>

      {isNoObligadoFev(current) && (
        <p className="text-sm text-amber-900">
          Esta clínica no emite FEV DIAN. Los RIPS de atención se guardan como registros temporales
          con numFactura nulo.
        </p>
      )}
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
