import { Link } from 'react-router-dom'
import type { CuvAlerta, CuvEstado, CuvExpediente } from '@/types/cuvExpediente'

const ESTADO_CLASS: Record<CuvEstado, string> = {
  aprobado: 'bg-emerald-100 text-emerald-800',
  notificado: 'bg-amber-100 text-amber-900',
  rechazado: 'bg-red-100 text-red-800',
}

export function CuvEstadoBadge({ estado, etiqueta }: { estado: CuvEstado; etiqueta: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_CLASS[estado]}`}>
      {etiqueta}
    </span>
  )
}

export function CuvAlertas({ alertas }: { alertas: CuvAlerta[] }) {
  if (alertas.length === 0) return null
  return (
    <div className="space-y-3">
      {alertas.map((alerta) => {
        const atencion = alerta.nivel === 'atencion'
        return (
          <div
            key={`${alerta.nivel}-${alerta.titulo}`}
            className={`rounded-lg border p-4 ${
              atencion ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50'
            }`}
            role="alert"
          >
            <p className={`text-sm font-semibold ${atencion ? 'text-amber-950' : 'text-red-950'}`}>
              {alerta.titulo}
            </p>
            <p className={`mt-1 text-sm ${atencion ? 'text-amber-900' : 'text-red-900'}`}>
              {alerta.detalle}
            </p>
            {alerta.reglas.length > 0 && (
              <ul className="mt-3 space-y-2">
                {alerta.reglas.map((regla, index) => (
                  <li key={`${regla.codigo}-${index}`} className="text-sm">
                    <span
                      className={`mr-2 inline-flex rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
                        atencion ? 'bg-amber-200 text-amber-950' : 'bg-red-200 text-red-950'
                      }`}
                    >
                      {regla.codigo || 'MUV'}
                    </span>
                    <span className={atencion ? 'text-amber-950' : 'text-red-950'}>
                      {regla.descripcion}
                    </span>
                    {regla.pathFuente && (
                      <span className="mt-0.5 block font-mono text-xs text-slate-600">{regla.pathFuente}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function CuvAtencionBanner({ expedientes }: { expedientes: CuvExpediente[] }) {
  const pendientes = expedientes.filter((item) => item.estado !== 'aprobado')
  if (pendientes.length === 0) return null
  const notificados = pendientes.filter((item) => item.estado === 'notificado').length
  const rechazados = pendientes.filter((item) => item.estado === 'rechazado').length
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4" role="alert">
      <p className="text-sm font-semibold text-amber-950">
        Hay validaciones del MUV que requieren atención
      </p>
      <p className="mt-1 text-sm text-amber-900">
        {notificados > 0 && `${notificados} con notificación. `}
        {rechazados > 0 && `${rechazados} rechazada${rechazados === 1 ? '' : 's'}. `}
        El CUV de una notificación sigue siendo válido; un rechazo debe corregirse y reenviarse.
      </p>
      <Link to="/cuv" className="mt-2 inline-block text-sm font-medium text-amber-950 underline">
        Abrir validación CUV
      </Link>
    </div>
  )
}
