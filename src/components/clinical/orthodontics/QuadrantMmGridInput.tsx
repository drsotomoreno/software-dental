export interface QuadrantMmValue {
  supDerecha: number
  supIzquierda: number
  infDerecha: number
  infIzquierda: number
}

export interface QuadrantMmGridInputProps {
  title: string
  description: string
  footerLabel: string
  centerLabel?: string
  value: QuadrantMmValue
  onChange: (value: QuadrantMmValue) => void
  disabled?: boolean
}

type QuadrantKey = keyof QuadrantMmValue

const QUADRANTS: {
  key: QuadrantKey
  label: string
  gridClass: string
}[] = [
  { key: 'supDerecha', label: 'Sup. derecha', gridClass: 'col-start-1 row-start-1' },
  { key: 'supIzquierda', label: 'Sup. izquierda', gridClass: 'col-start-3 row-start-1' },
  { key: 'infDerecha', label: 'Inf. derecha', gridClass: 'col-start-1 row-start-3' },
  { key: 'infIzquierda', label: 'Inf. izquierda', gridClass: 'col-start-3 row-start-3' },
]

function parseMmValue(raw: string): number {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-' || trimmed === '+') return 0
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMmValue(value: number): string {
  if (value === 0) return ''
  return String(value)
}

function QuadrantInput({
  label,
  fieldKey,
  value,
  disabled,
  onChange,
}: {
  label: string
  fieldKey: QuadrantKey
  value: QuadrantMmValue
  disabled?: boolean
  onChange: (value: QuadrantMmValue) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium text-slate-500">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step={0.5}
          disabled={disabled}
          value={formatMmValue(value[fieldKey])}
          placeholder="0"
          onChange={(e) =>
            onChange({ ...value, [fieldKey]: parseMmValue(e.target.value) })
          }
          className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm font-semibold text-slate-800 shadow-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-200 disabled:bg-slate-100"
          aria-label={`${label} en milímetros`}
        />
        <span className="text-[10px] text-slate-400">mm</span>
      </div>
    </div>
  )
}

export default function QuadrantMmGridInput({
  title,
  description,
  footerLabel,
  centerLabel = 'LM',
  value,
  onChange,
  disabled = false,
}: QuadrantMmGridInputProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h5 className="mb-3 text-sm font-semibold text-slate-800">{title}</h5>
      <p className="mb-4 text-xs text-slate-500">{description}</p>

      <div className="mx-auto max-w-md">
        <div className="grid grid-cols-3 grid-rows-3 gap-2">
          {QUADRANTS.map((quadrant) => (
            <div key={quadrant.key} className={`${quadrant.gridClass} flex justify-center`}>
              <QuadrantInput
                label={quadrant.label}
                fieldKey={quadrant.key}
                value={value}
                disabled={disabled}
                onChange={onChange}
              />
            </div>
          ))}

          <div className="col-start-2 row-start-1 flex items-end justify-center pb-1">
            <span className="rounded-full bg-dental-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-dental-800">
              SUP
            </span>
          </div>

          <div className="col-start-2 row-start-2 relative flex items-center justify-center">
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-400" />
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-400" />
            <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-dental-500 bg-white text-[9px] font-bold text-dental-700">
              {centerLabel}
            </div>
          </div>

          <div className="col-start-2 row-start-3 flex items-start justify-center pt-1">
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
              INF
            </span>
          </div>
        </div>

        <p className="mt-4 text-center text-xs font-medium text-slate-600">{footerLabel}</p>
      </div>
    </div>
  )
}
