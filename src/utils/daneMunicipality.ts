import citiesJson from '@/data/dane-cities.json'
import departmentsJson from '@/data/dane-departments.json'

export interface DaneMunicipality {
  code: string
  name: string
  departmentId: number
  departmentName: string
}

interface DaneCityRecord {
  id: number
  name: string
  departmentId: number
}

interface DaneDepartmentRecord {
  id: number
  name: string
}

const CITY_ALIASES: Record<string, string> = {
  bogota: 'Bogotá D.C.',
  'santa fe de bogota': 'Bogotá D.C.',
  medellin: 'Medellín',
  cali: 'Cali',
  barranquilla: 'Barranquilla',
  cartagena: 'Cartagena',
  bucaramanga: 'Bucaramanga',
  cucuta: 'Cúcuta',
  pereira: 'Pereira',
  manizales: 'Manizales',
  ibague: 'Ibagué',
  villavicencio: 'Villavicencio',
  pasto: 'Pasto',
  monteria: 'Montería',
  neiva: 'Neiva',
  armenia: 'Armenia',
  popayan: 'Popayán',
  valledupar: 'Valledupar',
  sincelejo: 'Sincelejo',
}

const departmentNameById = new Map<number, string>(
  (departmentsJson.data as DaneDepartmentRecord[]).map((department) => [
    department.id,
    department.name,
  ]),
)

const municipalities: DaneMunicipality[] = (citiesJson.data as DaneCityRecord[]).map(
  (city) => ({
    code: String(city.id).padStart(5, '0'),
    name: city.name,
    departmentId: city.departmentId,
    departmentName: departmentNameById.get(city.departmentId) ?? '',
  }),
)

const municipalitiesByNormalizedName = new Map<string, DaneMunicipality[]>()

for (const municipality of municipalities) {
  const key = normalizeDaneSearchText(municipality.name)
  const bucket = municipalitiesByNormalizedName.get(key) ?? []
  bucket.push(municipality)
  municipalitiesByNormalizedName.set(key, bucket)
}

export function normalizeDaneSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

function resolveAlias(query: string): string | null {
  const normalized = normalizeDaneSearchText(query)
  return CITY_ALIASES[normalized] ?? null
}

export function searchDaneMunicipalities(query: string, limit = 8): DaneMunicipality[] {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const aliasTarget = resolveAlias(trimmed)
  if (aliasTarget) {
    const aliasMatches = municipalitiesByNormalizedName.get(normalizeDaneSearchText(aliasTarget))
    if (aliasMatches?.length) return aliasMatches.slice(0, limit)
  }

  const normalized = normalizeDaneSearchText(trimmed)
  const exact = municipalitiesByNormalizedName.get(normalized)
  if (exact?.length) return exact.slice(0, limit)

  const matches: DaneMunicipality[] = []
  for (const municipality of municipalities) {
    const municipalityName = normalizeDaneSearchText(municipality.name)
    if (municipalityName.startsWith(normalized) || municipalityName.includes(normalized)) {
      matches.push(municipality)
      if (matches.length >= limit) break
    }
  }

  return matches
}

export function resolveDaneMunicipality(query: string): DaneMunicipality | null {
  const matches = searchDaneMunicipalities(query, 12)
  if (matches.length === 0) return null

  const normalized = normalizeDaneSearchText(query)
  const aliasTarget = resolveAlias(query)
  const exactName = aliasTarget ? normalizeDaneSearchText(aliasTarget) : normalized

  const exactMatches = matches.filter(
    (municipality) => normalizeDaneSearchText(municipality.name) === exactName,
  )
  if (exactMatches.length === 1) return exactMatches[0]

  const startsWithMatches = matches.filter((municipality) =>
    normalizeDaneSearchText(municipality.name).startsWith(normalized),
  )
  if (startsWithMatches.length === 1) return startsWithMatches[0]

  return null
}

export function findDaneMunicipalityByCode(code: string): DaneMunicipality | null {
  const normalizedCode = code.trim().padStart(5, '0')
  if (!/^\d{5}$/.test(normalizedCode)) return null
  return municipalities.find((municipality) => municipality.code === normalizedCode) ?? null
}

export function formatDaneMunicipalityLabel(municipality: DaneMunicipality): string {
  return `${municipality.name} (${municipality.departmentName}) — DANE ${municipality.code}`
}
