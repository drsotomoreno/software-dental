/**
 * Odontograma FDI (32 piezas) — subcomponente del anexo de implantes.
 * Máquina de estados por clic: vacío → implante (gris) → póntico (naranja) → vacío.
 */

export type OdontogramaFdiToothState = 'vacio' | 'implante' | 'pontico'

export type OdontogramaFdiArcada = 'superior' | 'inferior' | 'ambas'

export interface OdontogramaFDIProps {
  /** Estado controlado por pieza FDI (11–48). Piezas omitidas = vacío. */
  toothStates?: Partial<Record<number, OdontogramaFdiToothState>>
  /** Pieza resaltada (panel de configuración del planner). */
  selectedPiezaFDI?: number | null
  /** Qué arcadas renderizar. */
  arcada?: OdontogramaFdiArcada
  disabled?: boolean
  className?: string
  /**
   * Notifica al estado principal (UnifiedImplantPlanner) tras cada transición.
   * `nuevoEstado`: 'vacio' | 'implante' | 'pontico'
   */
  onToothStateChange: (piezaFDI: number, nuevoEstado: OdontogramaFdiToothState) => void
}

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11] as const
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28] as const
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41] as const
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38] as const

const STATE_COLORS: Record<
  OdontogramaFdiToothState,
  { fill: string; stroke: string; label: string }
> = {
  vacio: { fill: '#FFFFFF', stroke: '#94A3B8', label: 'vacío' },
  implante: { fill: '#E5E7EB', stroke: '#6B7280', label: 'implante' },
  pontico: { fill: '#FFEDD5', stroke: '#F97316', label: 'póntico' },
}

/** Máquina de estados: 1º implante → 2º póntico → 3º vacío */
export function nextOdontogramaFdiState(
  current: OdontogramaFdiToothState = 'vacio',
): OdontogramaFdiToothState {
  if (current === 'vacio') return 'implante'
  if (current === 'implante') return 'pontico'
  return 'vacio'
}

function ToothButton({
  fdi,
  state,
  selected,
  disabled,
  onCycle,
}: {
  fdi: number
  state: OdontogramaFdiToothState
  selected: boolean
  disabled?: boolean
  onCycle: () => void
}) {
  const colors = STATE_COLORS[state]

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`Pieza ${fdi}, estado ${colors.label}`}
      title={`Pieza ${fdi} — ${colors.label}`}
      onClick={onCycle}
      className={`flex w-9 flex-col items-center gap-1 rounded-md px-0.5 py-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 sm:w-10 ${
        selected ? 'bg-teal-50 ring-1 ring-teal-300' : 'hover:bg-slate-50'
      }`}
    >
      <span
        className={`text-[10px] font-bold leading-none ${
          selected ? 'text-teal-700' : 'text-slate-600'
        }`}
      >
        {fdi}
      </span>
      <svg
        viewBox="0 0 28 36"
        className="h-9 w-7 sm:h-10 sm:w-8"
        aria-hidden
      >
        {/* Óvalo representativo de la corona clínica */}
        <ellipse
          cx="14"
          cy="14"
          rx="9"
          ry="11"
          fill={colors.fill}
          stroke={selected ? '#0D9488' : colors.stroke}
          strokeWidth={selected ? 2.25 : 1.6}
        />
        {/* Cuello / raíz sugerida */}
        <path
          d="M9 24 Q14 34 19 24"
          fill="none"
          stroke={selected ? '#0D9488' : colors.stroke}
          strokeWidth={1.4}
          strokeLinecap="round"
          opacity={state === 'vacio' ? 0.45 : 0.9}
        />
        {state === 'implante' && (
          <g stroke="#6B7280" strokeWidth="1.3" fill="none">
            <line x1="14" y1="8" x2="14" y2="28" />
            <line x1="11" y1="12" x2="17" y2="12" />
            <line x1="11" y1="16" x2="17" y2="16" />
            <line x1="11" y1="20" x2="17" y2="20" />
          </g>
        )}
        {state === 'pontico' && (
          <rect
            x="8"
            y="9"
            width="12"
            height="9"
            rx="1.5"
            fill="#F9731640"
            stroke="#F97316"
            strokeWidth="1.2"
            strokeDasharray="2 1.5"
          />
        )}
      </svg>
    </button>
  )
}

function QuadrantGrid({
  label,
  teeth,
  toothStates,
  selectedPiezaFDI,
  disabled,
  onToothStateChange,
}: {
  label: string
  teeth: readonly number[]
  toothStates: Partial<Record<number, OdontogramaFdiToothState>>
  selectedPiezaFDI?: number | null
  disabled?: boolean
  onToothStateChange: (piezaFDI: number, nuevoEstado: OdontogramaFdiToothState) => void
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/70 p-2">
      <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div
        role="group"
        aria-label={label}
        className="grid grid-flow-col grid-rows-1 justify-center gap-0.5 overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${teeth.length}, minmax(2rem, 1fr))` }}
      >
        {teeth.map((fdi) => {
          const state = toothStates[fdi] ?? 'vacio'
          return (
            <ToothButton
              key={fdi}
              fdi={fdi}
              state={state}
              selected={selectedPiezaFDI === fdi}
              disabled={disabled}
              onCycle={() => {
                if (disabled) return
                onToothStateChange(fdi, nextOdontogramaFdiState(state))
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

export function OdontogramaFDI({
  toothStates = {},
  selectedPiezaFDI = null,
  arcada = 'ambas',
  disabled = false,
  className = '',
  onToothStateChange,
}: OdontogramaFDIProps) {
  const showUpper = arcada === 'superior' || arcada === 'ambas'
  const showLower = arcada === 'inferior' || arcada === 'ambas'

  return (
    <div
      className={`space-y-3 ${className}`}
      role="region"
      aria-label="Odontograma FDI de implantes"
    >
      {showUpper && (
        <div className="grid gap-2 sm:grid-cols-2">
          <QuadrantGrid
            label="Superior derecho (18–11)"
            teeth={UPPER_RIGHT}
            toothStates={toothStates}
            selectedPiezaFDI={selectedPiezaFDI}
            disabled={disabled}
            onToothStateChange={onToothStateChange}
          />
          <QuadrantGrid
            label="Superior izquierdo (21–28)"
            teeth={UPPER_LEFT}
            toothStates={toothStates}
            selectedPiezaFDI={selectedPiezaFDI}
            disabled={disabled}
            onToothStateChange={onToothStateChange}
          />
        </div>
      )}

      {showUpper && showLower && (
        <div className="flex items-center justify-center" aria-hidden>
          <div className="h-px w-full max-w-3xl border-t-2 border-dashed border-slate-300" />
        </div>
      )}

      {showLower && (
        <div className="grid gap-2 sm:grid-cols-2">
          <QuadrantGrid
            label="Inferior derecho (48–41)"
            teeth={LOWER_RIGHT}
            toothStates={toothStates}
            selectedPiezaFDI={selectedPiezaFDI}
            disabled={disabled}
            onToothStateChange={onToothStateChange}
          />
          <QuadrantGrid
            label="Inferior izquierdo (31–38)"
            teeth={LOWER_LEFT}
            toothStates={toothStates}
            selectedPiezaFDI={selectedPiezaFDI}
            disabled={disabled}
            onToothStateChange={onToothStateChange}
          />
        </div>
      )}
    </div>
  )
}
