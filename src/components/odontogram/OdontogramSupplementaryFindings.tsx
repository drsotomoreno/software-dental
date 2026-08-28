import type {
  OdontogramSupplementaryFinding,
  OdontogramSupplementaryFindingKey,
  OdontogramSupplementaryFindings,
} from '@/types/odontogram'
import {
  ODONTOGRAM_SUPPLEMENTARY_KEYS,
  ODONTOGRAM_SUPPLEMENTARY_LABELS,
  ODONTOGRAM_SUPPLEMENTARY_CIE10,
} from '@/types/odontogram'

interface OdontogramSupplementaryFindingsProps {
  findings: OdontogramSupplementaryFindings
  onChange: (findings: OdontogramSupplementaryFindings) => void
  disabled?: boolean
}

function FindingRow({
  label,
  finding,
  onChange,
  disabled = false,
  placeholder,
}: {
  label: string
  finding: OdontogramSupplementaryFinding
  onChange: (finding: OdontogramSupplementaryFinding) => void
  disabled?: boolean
  placeholder: string
}) {
  const handlePresentToggle = (checked: boolean) => {
    onChange({
      present: checked,
      description: checked ? finding.description : '',
    })
  }

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        finding.present ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-white'
      }`}
    >
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          disabled={disabled}
          checked={finding.present}
          onChange={(e) => handlePresentToggle(e.target.checked)}
          className="rounded border-slate-300 text-dental-600 focus:ring-dental-500"
        />
        {label}
      </label>

      {finding.present && (
        <div className="mt-2 pl-6">
          <label className="mb-1 block text-[10px] text-slate-500">Descripción (opcional)</label>
          <input
            disabled={disabled}
            value={finding.description}
            onChange={(e) => onChange({ ...finding, description: e.target.value })}
            placeholder={placeholder}
            className="input-field text-sm"
          />
        </div>
      )}
    </div>
  )
}

const PLACEHOLDERS: Record<OdontogramSupplementaryFindingKey, string> = {
  dientesIncluidos: 'Ej.: pieza 48 incluida mesioangular, pieza 38 retenida...',
  dientesSupernumerarios: 'Ej.: mesiodens en zona 11-21, supernumerario en 85...',
  agenesias: 'Ej.: agenesia de 35 y 45, ausencia congénita de incisivos laterales...',
  defectosEsmalte: 'Ej.: hipoplasia en 11, mancha blanca en 36, fluorosis leve...',
}

export function OdontogramSupplementaryFindingsForm({
  findings,
  onChange,
  disabled = false,
}: OdontogramSupplementaryFindingsProps) {
  const updateFinding = (
    key: OdontogramSupplementaryFindingKey,
    patch: OdontogramSupplementaryFinding,
  ) => {
    onChange({ ...findings, [key]: patch })
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-4">
      <h4 className="mb-1 text-sm font-semibold text-slate-700">
        Hallazgos Adicionales al Odontograma
      </h4>
      <p className="mb-3 text-xs text-slate-500">
        Marque solo si el hallazgo está presente. Registre el código CIE-10 correspondiente en la
        sección 4 (Diagnósticos) si aplica clínicamente.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ODONTOGRAM_SUPPLEMENTARY_KEYS.map((key) => {
          const cie10 = ODONTOGRAM_SUPPLEMENTARY_CIE10[key]
          return (
          <FindingRow
            key={key}
            label={`${ODONTOGRAM_SUPPLEMENTARY_LABELS[key]} · ${cie10.code}`}
            finding={findings[key]}
            onChange={(patch) => updateFinding(key, patch)}
            disabled={disabled}
            placeholder={PLACEHOLDERS[key]}
          />
          )
        })}
      </div>
    </div>
  )
}
