export type ImplantFdiQuadrant = 'Q1' | 'Q2' | 'Q3' | 'Q4'

export type ImplantFixtureType = 'standard' | 'narrow' | 'wide' | 'short' | 'mini'

export const IMPLANT_FIXTURE_SPECS = [
  { length: 6.0, diameter: 4.0 },
  { length: 6.0, diameter: 4.5 },
  { length: 6.0, diameter: 5.0 },
  { length: 8.0, diameter: 3.75 },
  { length: 8.0, diameter: 4.0 },
  { length: 8.0, diameter: 4.5 },
  { length: 8.0, diameter: 5.0 },
  { length: 10.0, diameter: 3.5 },
  { length: 10.0, diameter: 3.75 },
  { length: 10.0, diameter: 4.1 },
  { length: 10.0, diameter: 4.5 },
  { length: 10.0, diameter: 5.0 },
  { length: 11.5, diameter: 3.5 },
  { length: 11.5, diameter: 3.75 },
  { length: 11.5, diameter: 4.1 },
  { length: 11.5, diameter: 4.5 },
  { length: 13.0, diameter: 3.3 },
  { length: 13.0, diameter: 3.5 },
  { length: 13.0, diameter: 3.75 },
  { length: 13.0, diameter: 4.0 },
  { length: 14.0, diameter: 3.0 },
  { length: 14.0, diameter: 3.3 },
  { length: 14.0, diameter: 3.5 },
] as const

function formatDimension(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value)
}

function buildFixtureSizeId(diameter: number, length: number): string {
  return `${formatDimension(diameter)}x${formatDimension(length)}`
}

function buildFixtureSizeLabel(diameter: number, length: number): string {
  return `Ø${formatDimension(diameter)} × ${formatDimension(length)} mm`
}

export const IMPLANT_FIXTURE_SIZE_OPTIONS = IMPLANT_FIXTURE_SPECS.map((spec) => ({
  id: buildFixtureSizeId(spec.diameter, spec.length),
  label: buildFixtureSizeLabel(spec.diameter, spec.length),
  diameter: spec.diameter,
  length: spec.length,
}))

export type ImplantFixtureSize = (typeof IMPLANT_FIXTURE_SIZE_OPTIONS)[number]['id']

export const DEFAULT_IMPLANT_FIXTURE_SIZE =
  buildFixtureSizeId(4.0, 10.0) as ImplantFixtureSize

export const IMPLANT_FIXTURE_TYPE_OPTIONS: { id: ImplantFixtureType; label: string }[] = [
  { id: 'standard', label: 'Estándar' },
  { id: 'narrow', label: 'Estrecho' },
  { id: 'wide', label: 'Ancho' },
  { id: 'short', label: 'Corto' },
  { id: 'mini', label: 'Mini' },
]

export const FDI_QUADRANT_LABELS: Record<ImplantFdiQuadrant, string> = {
  Q1: 'Q1 — Superior derecho (11–18)',
  Q2: 'Q2 — Superior izquierdo (21–28)',
  Q3: 'Q3 — Inferior izquierdo (31–38)',
  Q4: 'Q4 — Inferior derecho (41–48)',
}

export const FDI_QUADRANT_ORDER: ImplantFdiQuadrant[] = ['Q1', 'Q2', 'Q3', 'Q4']

export function implantFixtureTypeLabel(type: ImplantFixtureType): string {
  return IMPLANT_FIXTURE_TYPE_OPTIONS.find((item) => item.id === type)?.label ?? type
}

export function implantFixtureSizeLabel(size: ImplantFixtureSize): string {
  return IMPLANT_FIXTURE_SIZE_OPTIONS.find((item) => item.id === size)?.label ?? size
}

export function parseImplantFixtureDimensions(
  size: ImplantFixtureSize,
): { diameter: number; length: number } {
  const option = IMPLANT_FIXTURE_SIZE_OPTIONS.find((item) => item.id === size)
  if (option) {
    return { diameter: option.diameter, length: option.length }
  }

  const match = size.match(/^([\d.]+)x([\d.]+)$/)
  return {
    diameter: match ? Number.parseFloat(match[1]) : 4,
    length: match ? Number.parseFloat(match[2]) : 10,
  }
}
