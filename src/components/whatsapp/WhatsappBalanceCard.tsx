type Props = {
  title: string
  balance: number
  unitLabel: string
  maxReference: number
  lowThreshold: number
  accentClass: string
  barClass: string
}

export function WhatsappBalanceCard({
  title,
  balance,
  unitLabel,
  maxReference,
  lowThreshold,
  accentClass,
  barClass,
}: Props) {
  const max = Math.max(maxReference, balance, 1)
  const pct = Math.min(100, Math.round((balance / max) * 100))
  const low = balance <= lowThreshold

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-sm font-semibold ${accentClass}`}>{title}</h3>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {balance.toLocaleString('es-CO')}
          </p>
          <p className="text-xs text-slate-500">{unitLabel} disponibles</p>
        </div>
        {low ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Saldo bajo
          </span>
        ) : null}
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barClass} ${low ? 'bg-amber-400' : ''}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={balance}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Referencia de paquete: {maxReference.toLocaleString('es-CO')} {unitLabel}
      </p>
      {low ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          Quedan {balance} {unitLabel}. Recargue un paquete para no interrumpir los envíos
          automáticos.
        </p>
      ) : null}
    </section>
  )
}
