import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { formatDate } from '@/utils'

interface SignatureAuditTrailProps {
  recordId: string
}

export function SignatureAuditTrail({ recordId }: SignatureAuditTrailProps) {
  const signatures = useLiveQuery(
    () => db.signatures.where('recordId').equals(recordId).toArray(),
    [recordId],
  )

  if (!signatures?.length) return null

  return (
    <div className="card bg-slate-50 text-sm">
      <h4 className="font-semibold text-slate-800">Trazabilidad de firmas</h4>
      <ul className="mt-3 space-y-3">
        {signatures.map((sig) => (
          <li key={String(sig.id)} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="font-medium text-slate-800">
              {sig.recordType === 'clinical_record'
                ? 'Firma profesional'
                : sig.recordType === 'consent'
                  ? 'Firma paciente (consentimiento)'
                  : 'Firma adenda/aclaratoria'}
            </p>
            <dl className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-500">Firmante</dt>
                <dd>{sig.signedBy} ({sig.signedByDocument})</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Usuario sistema</dt>
                <dd>{sig.authorEmail ?? '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Fecha y hora</dt>
                <dd>{formatDate(sig.signedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Método</dt>
                <dd>{sig.signatureMethod === 'canvas_biometric' ? 'Canvas biométrico' : '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">IP / dispositivo</dt>
                <dd>
                  {sig.ipAddress ?? '—'} · {sig.timezone ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Trazos / sesión</dt>
                <dd>
                  {sig.strokeCount ?? '—'} trazos · sesión {sig.sessionId?.slice(0, 8)}…
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-slate-500">Hash vinculado</dt>
                <dd className="font-mono break-all">{sig.contentHash}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
