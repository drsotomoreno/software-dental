import type {
  ToothRecord,
  ToothFace,
  ToothFaceState,
  ToothGlobalState,
} from '@/types/odontogram'
import {
  TOOTH_GLOBAL_STATE_LABELS,
  normalizeGlobalState,
} from '@/types/odontogram'
import { ToothFaceSelector } from './ToothFaceSelector'
import { AbsentToothSymbol } from './AbsentToothSymbol'

interface ToothProps {
  tooth: ToothRecord
  activeTool: ToothFaceState
  activeGlobalTool?: ToothGlobalState | null
  onFaceChange: (face: ToothFace, state: ToothFaceState) => void
  onGlobalStateChange: (state: ToothGlobalState) => void
  disabled?: boolean
  row: 'upper' | 'lower'
}

const GLOBAL_STATE_CYCLE: ToothGlobalState[] = [
  'presente',
  'ausente',
  'exodoncia_indicada',
  'endodoncia',
  'corona',
  'implante',
  'protesis_fija',
  'protesis_removible',
]

const GLOBAL_STATE_COLORS: Record<ToothGlobalState, string> = {
  presente: 'text-slate-500',
  ausente: 'text-blue-900',
  exodoncia_indicada: 'text-red-700',
  endodoncia: 'text-purple-600',
  corona: 'text-amber-600',
  implante: 'text-teal-600',
  protesis_fija: 'text-blue-600',
  protesis_removible: 'text-indigo-600',
}

const ABSENT_TOOLTIP =
  'Diente ausente. Clic para restaurar o cambiar estado.'

const EXTRACTION_INDICATED_TOOLTIP =
  'Exodoncia indicada. Clic para restaurar o cambiar estado.'

function resolveNextGlobalState(
  current: ToothGlobalState,
  preferred?: ToothGlobalState | null,
): ToothGlobalState {
  if (preferred) {
    return current === preferred ? 'presente' : preferred
  }

  const normalized = normalizeGlobalState(current)
  if (normalized === 'ausente' || normalized === 'exodoncia_indicada') return 'presente'

  const idx = GLOBAL_STATE_CYCLE.indexOf(normalized)
  const safeIdx = idx >= 0 ? idx : 0
  return GLOBAL_STATE_CYCLE[(safeIdx + 1) % GLOBAL_STATE_CYCLE.length]
}

export function Tooth({
  tooth,
  activeTool,
  activeGlobalTool = null,
  onFaceChange,
  onGlobalStateChange,
  disabled = false,
  row,
}: ToothProps) {
  const faces: ToothFace[] = ['vestibular', 'mesial', 'oclusal', 'distal', 'lingual']
  const globalState = normalizeGlobalState(tooth.globalState)
  const isAbsent = globalState === 'ausente'
  const isExtractionIndicated = globalState === 'exodoncia_indicada'
  const showMarkedTooth = isAbsent || isExtractionIndicated
  const markedVariant = isExtractionIndicated ? 'pendiente' : 'establecida'
  const markedTooltip = isExtractionIndicated ? EXTRACTION_INDICATED_TOOLTIP : ABSENT_TOOLTIP
  const markedStroke = isExtractionIndicated ? '#b91c1c' : '#1e3a8a'

  const applyGlobalState = (preferred?: ToothGlobalState | null) => {
    if (disabled) return
    onGlobalStateChange(resolveNextGlobalState(globalState, preferred))
  }

  const handleFaceChange = (face: ToothFace, state: ToothFaceState) => {
    if (disabled) return
    if (activeGlobalTool) {
      applyGlobalState(activeGlobalTool)
      return
    }
    onFaceChange(face, state)
  }

  const numberButton = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => applyGlobalState(activeGlobalTool)}
      title={showMarkedTooth ? markedTooltip : TOOTH_GLOBAL_STATE_LABELS[globalState]}
      className={`relative z-10 min-w-[28px] text-[10px] font-semibold hover:opacity-70 disabled:cursor-not-allowed ${
        showMarkedTooth
          ? isExtractionIndicated
            ? 'text-red-700 line-through decoration-red-700 decoration-2'
            : 'text-blue-900 line-through decoration-blue-900 decoration-2'
          : GLOBAL_STATE_COLORS[globalState]
      }`}
    >
      {tooth.number}
      {showMarkedTooth && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
            <line x1="2" y1="2" x2="20" y2="20" stroke={markedStroke} strokeWidth="2.5" strokeLinecap="round" />
            <line x1="20" y1="2" x2="2" y2="20" stroke={markedStroke} strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </span>
      )}
    </button>
  )

  return (
    <div className="flex flex-col items-center gap-1">
      {row === 'upper' && numberButton}

      {showMarkedTooth ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => applyGlobalState(activeGlobalTool ?? globalState)}
          title={markedTooltip}
          className="rounded transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <AbsentToothSymbol size={80} variant={markedVariant} />
        </button>
      ) : (
        <div className="grid grid-cols-3 grid-rows-3 gap-0.5 rounded border border-slate-200 bg-slate-50 p-0.5">
          {faces.map((face) => (
            <ToothFaceSelector
              key={face}
              face={face}
              toothNumber={tooth.number}
              state={tooth.faces[face]}
              activeTool={activeTool}
              onChange={(state) => handleFaceChange(face, state)}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      {row === 'lower' && numberButton}
    </div>
  )
}
