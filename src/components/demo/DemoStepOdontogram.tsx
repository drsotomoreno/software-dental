import { useState } from 'react'
import { Mic, Sparkles } from 'lucide-react'
import {
  createEmptyDemoToothMark,
  demoMarkedToothIds,
  type DemoFaceState,
  type DemoOdontogramMarks,
  type DemoOdontogramToolId,
  type DemoToothFace,
  type DemoToothGlobalState,
  type DemoToothMark,
} from './demoTypes'

interface DemoStepOdontogramProps {
  marks: DemoOdontogramMarks
  onChange: (marks: DemoOdontogramMarks) => void
}

/** Cuadrantes FDI adultos: superior der./izq. e inferior der./izq. */
const UPPER_RIGHT = ['18', '17', '16', '15', '14', '13', '12', '11']
const UPPER_LEFT = ['21', '22', '23', '24', '25', '26', '27', '28']
const LOWER_RIGHT = ['48', '47', '46', '45', '44', '43', '42', '41']
const LOWER_LEFT = ['31', '32', '33', '34', '35', '36', '37', '38']

const FACES: DemoToothFace[] = ['vestibular', 'mesial', 'oclusal', 'distal', 'lingual']

const FACE_GRID_POSITION: Record<DemoToothFace, string> = {
  vestibular: 'col-start-2 row-start-1',
  mesial: 'col-start-1 row-start-2',
  oclusal: 'col-start-2 row-start-2',
  distal: 'col-start-3 row-start-2',
  lingual: 'col-start-2 row-start-3',
}

const FACE_ABBREV: Record<DemoToothFace, string> = {
  vestibular: 'V',
  mesial: 'M',
  oclusal: 'O',
  distal: 'D',
  lingual: 'L',
}

const FACE_STYLES: Record<DemoFaceState, { bg: string; border: string; text: string }> = {
  sano: { bg: '#ffffff', border: '#cbd5e1', text: '#64748b' },
  obturado: { bg: '#2563eb', border: '#1e3a8a', text: '#ffffff' },
  caries: { bg: '#ef4444', border: '#b91c1c', text: '#ffffff' },
}

interface DemoTool {
  id: DemoOdontogramToolId
  label: string
  description: string
  kind: 'face' | 'global'
  faceState?: DemoFaceState
  globalState?: DemoToothGlobalState
  style: { bg: string; border: string; text: string }
  prefix?: string
}

/** Misma leyenda del odontograma clínico (imagen adjunta). */
const DEMO_TOOLS: DemoTool[] = [
  {
    id: 'buen_estado',
    label: 'Azul',
    description: 'Diente Sano o Restauración en Buen Estado',
    kind: 'face',
    faceState: 'obturado',
    style: { bg: '#2563eb', border: '#1e3a8a', text: '#ffffff' },
  },
  {
    id: 'diente_ausente',
    label: 'X Azul',
    description: 'Diente Ausente',
    kind: 'global',
    globalState: 'ausente',
    style: { bg: '#ffffff', border: '#1e3a8a', text: '#1e3a8a' },
    prefix: '✕ ',
  },
  {
    id: 'exodoncia_indicada',
    label: 'X Roja',
    description: 'Exodoncia Indicada',
    kind: 'global',
    globalState: 'exodoncia_indicada',
    style: { bg: '#ffffff', border: '#b91c1c', text: '#b91c1c' },
    prefix: '✕ ',
  },
  {
    id: 'patologia',
    label: 'Rojo',
    description: 'Diente con Patología o Restauración Defectuosa',
    kind: 'face',
    faceState: 'caries',
    style: { bg: '#ef4444', border: '#b91c1c', text: '#ffffff' },
  },
]

function getTool(id: DemoOdontogramToolId): DemoTool {
  return DEMO_TOOLS.find((tool) => tool.id === id) ?? DEMO_TOOLS[3]
}

function CrossMark({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 22 22" aria-hidden className="mx-auto">
      <line
        x1="2"
        y1="2"
        x2="20"
        y2="20"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="2"
        x2="2"
        y2="20"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function DemoTooth({
  toothId,
  mark,
  activeToolId,
  row,
  onPaintFace,
  onPaintGlobal,
}: {
  toothId: string
  mark: DemoToothMark
  activeToolId: DemoOdontogramToolId
  row: 'upper' | 'lower'
  onPaintFace: (face: DemoToothFace) => void
  onPaintGlobal: () => void
}) {
  const tool = getTool(activeToolId)
  const isAbsent = mark.globalState === 'ausente'
  const isExtraction = mark.globalState === 'exodoncia_indicada'
  const showX = isAbsent || isExtraction
  const xColor = isExtraction ? '#b91c1c' : '#1e3a8a'

  const numberButton = (
    <button
      type="button"
      onClick={onPaintGlobal}
      title={
        showX
          ? isExtraction
            ? 'Exodoncia indicada — clic para quitar'
            : 'Diente ausente — clic para quitar'
          : `Pieza ${toothId}`
      }
      className={[
        'relative z-10 min-w-[1.75rem] text-[10px] font-semibold',
        showX
          ? isExtraction
            ? 'text-red-700 line-through decoration-red-700 decoration-2'
            : 'text-blue-900 line-through decoration-blue-900 decoration-2'
          : 'text-slate-500 hover:text-dental-700',
      ].join(' ')}
    >
      {toothId}
    </button>
  )

  return (
    <div className="flex flex-col items-center gap-1">
      {row === 'upper' && numberButton}

      {showX ? (
        <button
          type="button"
          onClick={onPaintGlobal}
          title={isExtraction ? 'Exodoncia indicada' : 'Diente ausente'}
          className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded border-2 border-slate-200 bg-white hover:bg-slate-50"
        >
          <CrossMark color={xColor} />
        </button>
      ) : (
        <div className="grid grid-cols-3 grid-rows-3 gap-0.5 rounded border border-slate-200 bg-slate-50 p-0.5">
          {FACES.map((face) => {
            const state = mark.faces[face]
            const style = FACE_STYLES[state]
            return (
              <button
                key={face}
                type="button"
                onClick={() => {
                  if (tool.kind === 'global') {
                    onPaintGlobal()
                    return
                  }
                  onPaintFace(face)
                }}
                title={`${FACE_ABBREV[face]} — ${
                  state === 'obturado'
                    ? 'Azul (buen estado)'
                    : state === 'caries'
                      ? 'Rojo (patología)'
                      : 'Sin marcar'
                }`}
                style={{
                  backgroundColor: style.bg,
                  borderColor: style.border,
                  color: style.text,
                }}
                className={`flex h-6 w-6 items-center justify-center rounded-sm border-2 text-[8px] font-bold leading-none transition hover:brightness-90 ${FACE_GRID_POSITION[face]}`}
              >
                {FACE_ABBREV[face]}
              </button>
            )
          })}
        </div>
      )}

      {row === 'lower' && numberButton}
    </div>
  )
}

function QuadrantBlock({
  title,
  teeth,
  row,
  marks,
  activeToolId,
  onPaintFace,
  onPaintGlobal,
}: {
  title: string
  teeth: string[]
  row: 'upper' | 'lower'
  marks: DemoOdontogramMarks
  activeToolId: DemoOdontogramToolId
  onPaintFace: (toothId: string, face: DemoToothFace) => void
  onPaintGlobal: (toothId: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {teeth.map((toothId) => (
          <DemoTooth
            key={toothId}
            toothId={toothId}
            mark={marks[toothId] ?? createEmptyDemoToothMark()}
            activeToolId={activeToolId}
            row={row}
            onPaintFace={(face) => onPaintFace(toothId, face)}
            onPaintGlobal={() => onPaintGlobal(toothId)}
          />
        ))}
      </div>
    </div>
  )
}

/** Paso 3 — Odontograma demo con paleta azul/rojo y X azul/roja. */
export function DemoStepOdontogram({ marks, onChange }: DemoStepOdontogramProps) {
  const [activeToolId, setActiveToolId] = useState<DemoOdontogramToolId>('patologia')
  const markedIds = demoMarkedToothIds(marks)
  const activeTool = getTool(activeToolId)

  const upsert = (toothId: string, next: DemoToothMark) => {
    const isDefault =
      next.globalState === 'presente' && Object.values(next.faces).every((face) => face === 'sano')
    if (isDefault) {
      const { [toothId]: _removed, ...rest } = marks
      onChange(rest)
      return
    }
    onChange({ ...marks, [toothId]: next })
  }

  const paintFace = (toothId: string, face: DemoToothFace) => {
    if (activeTool.kind !== 'face' || !activeTool.faceState) return
    const current = marks[toothId] ?? createEmptyDemoToothMark()
    const nextState =
      current.faces[face] === activeTool.faceState ? 'sano' : activeTool.faceState
    upsert(toothId, {
      globalState: 'presente',
      faces: { ...current.faces, [face]: nextState },
    })
  }

  const paintGlobal = (toothId: string) => {
    const current = marks[toothId] ?? createEmptyDemoToothMark()
    const target = activeTool.kind === 'global' ? activeTool.globalState : null
    if (!target) {
      // Con herramienta de color, el número restaura el diente si tenía X.
      if (current.globalState !== 'presente') {
        upsert(toothId, { globalState: 'presente', faces: { ...current.faces } })
      }
      return
    }
    const nextGlobal = current.globalState === target ? 'presente' : target
    upsert(toothId, {
      globalState: nextGlobal,
      faces: nextGlobal === 'presente' ? { ...current.faces } : { ...createEmptyDemoToothMark().faces },
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 3 de 9</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Odontograma</h2>
      <p className="mt-2 text-sm text-slate-500">
        Elija una herramienta y marque la superficie (V, M, O, D, L). Use X Azul o X Roja para el
        diente completo.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Odontograma básico
        </p>
        <div className="flex flex-wrap gap-2">
          {DEMO_TOOLS.map((tool) => {
            const isActive = activeToolId === tool.id
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveToolId(tool.id)}
                title={tool.description}
                style={{
                  backgroundColor: tool.style.bg,
                  borderColor: tool.style.border,
                  color: tool.style.text,
                }}
                className={[
                  'flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition',
                  isActive ? 'ring-2 ring-dental-500 ring-offset-2' : 'hover:brightness-95',
                ].join(' ')}
              >
                <span
                  className="inline-block h-4 w-4 rounded-sm border"
                  style={{ backgroundColor: tool.style.bg, borderColor: tool.style.border }}
                  aria-hidden
                />
                {tool.prefix ?? ''}
                {tool.label} ({tool.description})
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto grid min-w-[40rem] max-w-5xl gap-6">
          <div className="grid grid-cols-2 gap-4 border-b border-slate-300 pb-4">
            <QuadrantBlock
              title="Superior derecho"
              teeth={UPPER_RIGHT}
              row="upper"
              marks={marks}
              activeToolId={activeToolId}
              onPaintFace={paintFace}
              onPaintGlobal={paintGlobal}
            />
            <QuadrantBlock
              title="Superior izquierdo"
              teeth={UPPER_LEFT}
              row="upper"
              marks={marks}
              activeToolId={activeToolId}
              onPaintFace={paintFace}
              onPaintGlobal={paintGlobal}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <QuadrantBlock
              title="Inferior derecho"
              teeth={LOWER_RIGHT}
              row="lower"
              marks={marks}
              activeToolId={activeToolId}
              onPaintFace={paintFace}
              onPaintGlobal={paintGlobal}
            />
            <QuadrantBlock
              title="Inferior izquierdo"
              teeth={LOWER_LEFT}
              row="lower"
              marks={marks}
              activeToolId={activeToolId}
              onPaintFace={paintFace}
              onPaintGlobal={paintGlobal}
            />
          </div>
        </div>

        {markedIds.length > 0 && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Piezas con hallazgos: {markedIds.join(', ')}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-dental-300 bg-gradient-to-r from-dental-50 via-sky-50 to-dental-100 px-4 py-3 shadow-sm">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dental-600 text-white">
          <Mic className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-dental-900">
            <Sparkles className="h-4 w-4 shrink-0 text-dental-600" aria-hidden />
            Versión paga
          </p>
          <p className="mt-0.5 text-sm text-dental-800">
            ¡En la versión paga podrás dictar todos los hallazgos del odontograma por voz!
          </p>
        </div>
      </div>
    </div>
  )
}
