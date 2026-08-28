import type { Cie10Diagnosis } from '@/types/clinicalRecord'
import type { OdontogramData, ToothFace, ToothRecord } from '@/types/odontogram'
import {
  ODONTOGRAM_SUPPLEMENTARY_KEYS,
  ODONTOGRAM_SUPPLEMENTARY_LABELS,
  ODONTOGRAM_SUPPLEMENTARY_CIE10,
  EDENTULISM_SCOPE_LABELS,
} from '@/types/odontogram'

const FACES: ToothFace[] = ['vestibular', 'mesial', 'oclusal', 'distal', 'lingual']

const ODONTOGRAM_CIE10_MAP: {
  key: string
  code: string
  description: string
  match: (tooth: ToothRecord) => boolean
}[] = [
  {
    key: 'caries',
    code: 'K02.1',
    description: 'Caries de la dentina',
    match: (t) => FACES.some((f) => t.faces[f] === 'caries'),
  },
  {
    key: 'ausente',
    code: 'K08.1',
    description: 'Pérdida de dientes debida a accidente',
    match: (t) => t.globalState === 'ausente',
  },
  {
    key: 'exodoncia_indicada',
    code: 'K08.8',
    description: 'Exodoncia indicada',
    match: (t) => t.globalState === 'exodoncia_indicada',
  },
  {
    key: 'endodoncia',
    code: 'K04.5',
    description: 'Periodontitis apical crónica',
    match: (t) => t.globalState === 'endodoncia',
  },
  {
    key: 'implante',
    code: 'K08.8',
    description: 'Otros trastornos especificados de los dientes estructuras de sostén',
    match: (t) => t.globalState === 'implante',
  },
]

interface DiagnosisBucket {
  code: string
  description: string
  teeth: number[]
}

function collectBuckets(odontogram: OdontogramData): DiagnosisBucket[] {
  const buckets = new Map<string, DiagnosisBucket>()

  for (const tooth of odontogram.teeth) {
    for (const rule of ODONTOGRAM_CIE10_MAP) {
      if (!rule.match(tooth)) continue
      const existing = buckets.get(rule.key) ?? {
        code: rule.code,
        description: rule.description,
        teeth: [],
      }
      if (!existing.teeth.includes(tooth.number)) {
        existing.teeth.push(tooth.number)
      }
      buckets.set(rule.key, existing)
    }
  }

  return [...buckets.values()].map((b) => ({
    ...b,
    teeth: [...b.teeth].sort((a, b) => a - b),
  }))
}

export function deriveDiagnosesFromOdontogram(odontogram: OdontogramData): Cie10Diagnosis[] {
  const buckets = collectBuckets(odontogram)

  return buckets.map((bucket, index) => ({
    code: bucket.code,
    description: bucket.description,
    type: index === 0 ? 'principal' : 'relacionado',
    certainty: 'impresion' as const,
    source: 'odontograma' as const,
    affectedTeeth: bucket.teeth,
  }))
}

export function deriveSupplementaryDiagnoses(odontogram: OdontogramData): Cie10Diagnosis[] {
  const findings = odontogram.supplementaryFindings
  if (!findings) return []

  return ODONTOGRAM_SUPPLEMENTARY_KEYS.flatMap((key) => {
    if (!findings[key]?.present) return []
    const cie10 = ODONTOGRAM_SUPPLEMENTARY_CIE10[key]
    return [
      {
        code: cie10.code,
        description: cie10.description,
        type: 'relacionado' as const,
        certainty: 'impresion' as const,
        source: 'odontograma_suplementario' as const,
      },
    ]
  })
}

export function formatOdontogramFindings(odontogram: OdontogramData): string {
  const lines: string[] = []

  if (odontogram.edentulismScope) {
    lines.push(EDENTULISM_SCOPE_LABELS[odontogram.edentulismScope])
  }

  for (const tooth of odontogram.teeth) {
    const cariesFaces = FACES.filter((f) => tooth.faces[f] === 'caries')
    if (cariesFaces.length > 0) {
      lines.push(
        `Pieza ${tooth.number}: patología o restauración defectuosa (${cariesFaces.map((f) => f.charAt(0).toUpperCase()).join(', ')})`,
      )
    }
    if (tooth.globalState === 'ausente') {
      lines.push(`Pieza ${tooth.number}: diente ausente`)
    }
    if (tooth.globalState === 'exodoncia_indicada') {
      lines.push(`Pieza ${tooth.number}: exodoncia indicada`)
    }
    if (tooth.globalState === 'endodoncia') {
      lines.push(`Pieza ${tooth.number}: tratamiento endodóntico`)
    }
    if (tooth.globalState === 'implante') {
      lines.push(`Pieza ${tooth.number}: implante`)
    }
    if (tooth.globalState === 'corona') {
      lines.push(`Pieza ${tooth.number}: corona`)
    }
    const restoredFaces = FACES.filter((f) => tooth.faces[f] === 'obturado')
    if (restoredFaces.length > 0) {
      lines.push(
        `Pieza ${tooth.number}: sano o restauración en buen estado (${restoredFaces.map((f) => f.charAt(0).toUpperCase()).join(', ')})`,
      )
    }
  }

  for (const key of ODONTOGRAM_SUPPLEMENTARY_KEYS) {
    const finding = odontogram.supplementaryFindings?.[key]
    if (!finding?.present) continue
    const label = ODONTOGRAM_SUPPLEMENTARY_LABELS[key]
    const code = ODONTOGRAM_SUPPLEMENTARY_CIE10[key].code
    const detail = finding.description.trim()
    lines.push(detail ? `${label} (${code}): ${detail}` : `${label} (${code})`)
  }

  if (lines.length === 0) return ''
  return ['Hallazgos del odontograma (FDI):', ...lines.map((l) => `• ${l}`)].join('\n')
}

const MANUAL_FINDINGS_MARKER = '\n\n--- Hallazgos adicionales ---\n'

export function extractManualFindings(findings: string): string {
  const idx = findings.indexOf(MANUAL_FINDINGS_MARKER)
  if (idx >= 0) return findings.slice(idx + MANUAL_FINDINGS_MARKER.length).trim()
  if (findings.startsWith('Hallazgos del odontograma')) return ''
  return findings.trim()
}

export function mergeFindingsWithOdontogram(
  odontogramFindings: string,
  existingFindings: string,
): string {
  const manual = extractManualFindings(existingFindings)
  if (!odontogramFindings) return manual
  if (!manual) return odontogramFindings
  return `${odontogramFindings}${MANUAL_FINDINGS_MARKER}${manual}`
}

/** Combina diagnósticos del odontograma con los añadidos manualmente */
export function mergeDiagnosesWithOdontogram(
  derived: Cie10Diagnosis[],
  supplementaryDerived: Cie10Diagnosis[],
  current: Cie10Diagnosis[],
): Cie10Diagnosis[] {
  const manual = current.filter((d) => d.source === 'manual')
  const manualCodes = new Set(manual.map((d) => d.code))

  const fromOdontogram = derived.filter((d) => !manualCodes.has(d.code))
  const fromSupplementary = supplementaryDerived.filter((d) => !manualCodes.has(d.code))
  const combined = [...fromOdontogram, ...fromSupplementary, ...manual]

  if (combined.length === 0) return []

  const hasPrincipal = combined.some((d) => d.type === 'principal')
  return combined.map((d, i) => ({
    ...d,
    type: hasPrincipal ? d.type : i === 0 ? 'principal' : 'relacionado',
  }))
}

export function syncClinicalDataFromOdontogram(
  clinical: { diagnoses: Cie10Diagnosis[]; findings: string },
  odontogram: OdontogramData,
): { diagnoses: Cie10Diagnosis[]; findings: string } {
  const odontogramFindings = formatOdontogramFindings(odontogram)

  // Los diagnósticos CIE-10 se registran solo en la sección 4 (búsqueda manual).
  // El odontograma alimenta únicamente el texto de hallazgos clínicos.
  const manualDiagnoses = clinical.diagnoses.filter(
    (diagnosis) =>
      diagnosis.source !== 'odontograma' && diagnosis.source !== 'odontograma_suplementario',
  )

  return {
    diagnoses: manualDiagnoses,
    findings: mergeFindingsWithOdontogram(odontogramFindings, clinical.findings),
  }
}
