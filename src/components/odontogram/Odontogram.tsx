import { useCallback, useState } from 'react'
import type {
  OdontogramData,
  ToothFace,
  ToothFaceState,
  ToothGlobalState,
  AnyToothNumber,
  DentitionType,
} from '@/types/odontogram'
import {
  TOOTH_FACE_STATE_DESCRIPTIONS,
  TOOTH_GLOBAL_STATE_LABELS,
  ODONTOGRAM_ACTIVE_TOOLS,
  getActiveFaceTool,
  getActiveGlobalToolFromPalette,
  EDENTULISM_SCOPE_LABELS,
  EDENTULISM_SCOPE_OPTIONS,
  createDefaultTooth,
  normalizeToothRecord,
  ensureOdontogramTeeth,
  getTeethNumbersForDentition,
  type EdentulismScope,
  type OdontogramActiveToolId,
} from '@/types/odontogram'
import { applyEdentulismScope, applyGlobalState } from '@/utils/odontogramMutations'
import {
  UPPER_RIGHT,
  UPPER_LEFT,
  LOWER_LEFT,
  LOWER_RIGHT,
  DECIDUOUS_UPPER_RIGHT,
  DECIDUOUS_UPPER_LEFT,
  DECIDUOUS_LOWER_LEFT,
  DECIDUOUS_LOWER_RIGHT,
} from '@/constants/dental'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { OdontogramArch } from './OdontogramArch'
import { OdontogramSupplementaryFindingsForm } from './OdontogramSupplementaryFindings'

interface OdontogramProps {
  data: OdontogramData
  onChange: (data: OdontogramData) => void
  disabled?: boolean
}

export function Odontogram({ data, onChange, disabled = false }: OdontogramProps) {
  const [activeTool, setActiveTool] = useState<OdontogramActiveToolId>('patologia')

  const activeFaceTool = getActiveFaceTool(activeTool)
  const activeGlobalTool = getActiveGlobalToolFromPalette(activeTool)

  const dentitionType = data.dentitionType ?? 'permanente'
  const normalizedData = ensureOdontogramTeeth(data)

  const getTooth = useCallback(
    (number: AnyToothNumber) => {
      const existing = normalizedData.teeth.find((t) => t.number === number)
      if (existing) return normalizeToothRecord(existing)
      return createDefaultTooth(number)
    },
    [normalizedData.teeth],
  )

  const updateData = (patch: Partial<OdontogramData>) => {
    onChange({ ...normalizedData, ...patch, updatedAt: new Date().toISOString() })
  }

  const handleFaceChange = (
    number: AnyToothNumber,
    face: ToothFace,
    state: ToothFaceState,
  ) => {
    const defaultTooth = createDefaultTooth(number)
    const teeth = normalizedData.teeth.some((t) => t.number === number)
      ? normalizedData.teeth.map((t) =>
          t.number === number
            ? normalizeToothRecord({ ...t, faces: { ...t.faces, [face]: state } })
            : normalizeToothRecord(t),
        )
      : [
          ...normalizedData.teeth,
          { ...defaultTooth, faces: { ...defaultTooth.faces, [face]: state } },
        ]
    updateData({ teeth })
  }

  const handleGlobalStateChange = (number: AnyToothNumber, globalState: ToothGlobalState) => {
    updateData(applyGlobalState(normalizedData, number, globalState))
  }

  const handleDentitionChange = (newType: DentitionType) => {
    const numbers = getTeethNumbersForDentition(newType)
    const existingMap = new Map(normalizedData.teeth.map((t) => [t.number, normalizeToothRecord(t)]))
    const teeth = numbers.map((n) => existingMap.get(n) ?? createDefaultTooth(n))
    const base = { ...normalizedData, dentitionType: newType, teeth }
    const next = normalizedData.edentulismScope
      ? applyEdentulismScope(base, normalizedData.edentulismScope)
      : base
    updateData(next)
  }

  const handleEdentulismChange = (scope: EdentulismScope) => {
    const nextScope = normalizedData.edentulismScope === scope ? null : scope
    updateData(applyEdentulismScope(normalizedData, nextScope))
  }

  const showPermanent = dentitionType === 'permanente' || dentitionType === 'mixta'
  const showDeciduous = dentitionType === 'temporal' || dentitionType === 'mixta'

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={CLINICAL_SECTION_TITLE_CLASS}>
            {clinicalSectionTitle(
              CLINICAL_HISTORY_SECTION_NUMBERS.odontograma,
              'Odontograma (Sistema FDI / ISO 3950)',
            )}
          </h3>
          <p className="text-sm text-slate-500">
            Seleccione herramienta de color y haga clic en la superficie (V, M, O/I, D, L)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            disabled={disabled}
            value={dentitionType}
            onChange={(e) => handleDentitionChange(e.target.value as DentitionType)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="permanente">Permanente — Cuadrantes 1-4 (32 dientes)</option>
            <option value="temporal">Temporal — Cuadrantes 5-8 (20 dientes)</option>
            <option value="mixta">Mixta — Permanente + Temporal (52 dientes)</option>
          </select>

          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              disabled={disabled}
              checked={normalizedData.isInitialState ?? true}
              onChange={(e) => updateData({ isInitialState: e.target.checked })}
              className="rounded border-slate-300 text-dental-600"
            />
            Estado inicial al ingreso
          </label>
        </div>
      </div>

      {!disabled && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Edentulismo — marcar ausencia total por arco
          </p>
          <div className="flex flex-wrap gap-2">
            {EDENTULISM_SCOPE_OPTIONS.map((scope) => {
              const isActive = normalizedData.edentulismScope === scope
              return (
                <button
                  key={scope}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleEdentulismChange(scope)}
                  className={`nav-pill ${
                    isActive ? 'nav-pill-active' : 'nav-pill-inactive'
                  }`}
                  title="Marca todas las piezas del arco como ausentes (símbolo X)"
                >
                  {EDENTULISM_SCOPE_LABELS[scope]}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Al seleccionar una opción, todas las piezas del arco correspondiente se marcan como
            ausentes. Vuelva a hacer clic para quitar la marca de edentulismo (las piezas no se
            restauran automáticamente).
          </p>
        </div>
      )}

      {/* Paleta de herramientas */}
      {!disabled && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Odontograma Básico
          </p>
          <div className="flex flex-wrap gap-2">
            {ODONTOGRAM_ACTIVE_TOOLS.map((tool) => {
              const isActive = activeTool === tool.id
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveTool(tool.id)}
                  title={tool.description}
                  style={{
                    backgroundColor: tool.style.bg,
                    borderColor: tool.style.border,
                    color: tool.style.text,
                  }}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition ${
                    isActive ? 'ring-2 ring-dental-500 ring-offset-2' : 'hover:brightness-95'
                  }`}
                >
                  <span
                    className="inline-block h-4 w-4 rounded-sm border"
                    style={{ backgroundColor: tool.style.bg, borderColor: tool.style.border }}
                  />
                  {tool.prefix ?? ''}
                  {tool.label} ({tool.description})
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Leyenda */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {ODONTOGRAM_ACTIVE_TOOLS.map((tool) => (
          <div key={tool.id} className="flex items-start gap-2 text-xs">
            <span
              className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded-sm border-2"
              style={{ backgroundColor: tool.style.bg, borderColor: tool.style.border }}
            />
            <div>
              <span className="font-medium text-slate-700">
                {tool.prefix ?? ''}
                {tool.label} ({tool.description})
              </span>
              <p className="text-slate-500">
                {tool.kind === 'face' && tool.faceState
                  ? TOOTH_FACE_STATE_DESCRIPTIONS[tool.faceState]
                  : tool.globalState
                    ? TOOTH_GLOBAL_STATE_LABELS[tool.globalState]
                    : ''}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <span className="font-medium">Superficies:</span>
        <span><strong>V</strong> Vestibular</span>
        <span><strong>M</strong> Mesial</span>
        <span><strong>O</strong> Oclusal</span>
        <span><strong>I</strong> Incisal</span>
        <span><strong>D</strong> Distal</span>
        <span><strong>L</strong> Lingual</span>
        <span className="border-l border-slate-300 pl-3 text-slate-700">
          Use <strong>X Azul</strong> o <strong>X Roja</strong> en Odontograma Básico para marcar el diente completo.
        </span>
      </div>

      {/* Arcadas */}
      <div className="space-y-6">
        {showPermanent && (
          <OdontogramArch
            title="Dentición permanente"
            subtitle="Cuadrantes 1 (sup. der.) · 2 (sup. izq.) · 3 (inf. izq.) · 4 (inf. der.) — Dientes 11-48"
            upperRight={UPPER_RIGHT}
            upperLeft={UPPER_LEFT}
            lowerLeft={LOWER_LEFT}
            lowerRight={LOWER_RIGHT}
            getTooth={getTooth}
            activeTool={activeFaceTool}
            activeGlobalTool={activeGlobalTool}
            disabled={disabled}
            onFaceChange={handleFaceChange}
            onGlobalStateChange={handleGlobalStateChange}
          />
        )}

        {showDeciduous && (
          <OdontogramArch
            title="Dentición temporal (decidua)"
            subtitle="Cuadrantes 5 (sup. der.) · 6 (sup. izq.) · 7 (inf. izq.) · 8 (inf. der.) — Dientes 51-85"
            upperRight={DECIDUOUS_UPPER_RIGHT}
            upperLeft={DECIDUOUS_UPPER_LEFT}
            lowerLeft={DECIDUOUS_LOWER_LEFT}
            lowerRight={DECIDUOUS_LOWER_RIGHT}
            getTooth={getTooth}
            activeTool={activeFaceTool}
            activeGlobalTool={activeGlobalTool}
            disabled={disabled}
            onFaceChange={handleFaceChange}
            onGlobalStateChange={handleGlobalStateChange}
          />
        )}
      </div>

      <OdontogramSupplementaryFindingsForm
        findings={normalizedData.supplementaryFindings!}
        disabled={disabled}
        onChange={(supplementaryFindings) => updateData({ supplementaryFindings })}
      />
    </div>
  )
}
