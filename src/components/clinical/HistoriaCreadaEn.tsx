import { textoHistoriaCreadaEn } from '../../../shared/patientOpenedAt.js'

interface HistoriaCreadaEnProps {
  createdAt?: string | null
  className?: string
  /** Alta todavía no guardada: la marca se escribe al confirmar el ingreso. */
  pendiente?: boolean
}

export function HistoriaCreadaEn({
  createdAt,
  className = '',
  pendiente = false,
}: HistoriaCreadaEnProps) {
  return (
    <div
      className={`rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-teal-950 ${className}`}
    >
      <p className="text-base font-semibold leading-snug">
        {pendiente
          ? 'Historia creada en la fecha y hora en que guarde este ingreso.'
          : textoHistoriaCreadaEn(createdAt)}
      </p>
      {pendiente ? (
        <p className="mt-1 text-xs font-medium text-teal-800">
          La marca es automática y queda fija. No se puede editar después.
        </p>
      ) : null}
    </div>
  )
}
