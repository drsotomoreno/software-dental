import { CIE10_DATA, type Cie10DataEntry } from '../data/cie10Data'

export type { Cie10DataEntry }

export interface Cie10SearchResult {
  code: string
  description: string
}

/**
 * Normaliza texto para búsqueda: minúsculas, sin acentos, espacios colapsados.
 * O(1) respecto al tamaño del catálogo.
 */
export function normalizeCie10SearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
}

function entrySearchBlob(entry: Cie10DataEntry): string {
  const parts = [entry.code, entry.description, ...(entry.keywords ?? [])]
  return normalizeCie10SearchText(parts.join(' '))
}

/**
 * Motor de búsqueda CIE-10 en memoria — sin red ni dependencias externas.
 * Búsqueda lineal O(n) sobre el dataset (n ≈ 100–200 entradas).
 */
export class Cie10SearchEngine {
  private readonly dataset: readonly Cie10DataEntry[]
  private readonly searchIndex: string[]

  constructor(dataset: readonly Cie10DataEntry[] = CIE10_DATA) {
    this.dataset = dataset
    this.searchIndex = dataset.map(entrySearchBlob)
  }

  normalize(value: string): string {
    return normalizeCie10SearchText(value)
  }

  /**
   * Busca por código, descripción o keywords.
   * @param query Texto libre o código parcial
   * @param limit Máximo de resultados (default 12)
   */
  search(query: string, limit = 12): Cie10SearchResult[] {
    const normalizedQuery = this.normalize(query)
    if (!normalizedQuery) return []

    const results: Cie10SearchResult[] = []

    for (let index = 0; index < this.dataset.length; index += 1) {
      const entry = this.dataset[index]
      const blob = this.searchIndex[index]

      const codeMatch = this.normalize(entry.code).includes(normalizedQuery)
      const textMatch = blob.includes(normalizedQuery)

      if (!codeMatch && !textMatch) continue

      results.push({
        code: entry.code,
        description: entry.description,
      })

      if (results.length >= limit) break
    }

    return results
  }
}

let defaultEngine: Cie10SearchEngine | null = null

export function getDefaultCie10SearchEngine(): Cie10SearchEngine {
  if (!defaultEngine) {
    defaultEngine = new Cie10SearchEngine()
  }
  return defaultEngine
}

// ---------------------------------------------------------------------------
// Tests unitarios (ejecutar: npx tsx src/services/Cie10SearchEngine.ts)
// ---------------------------------------------------------------------------

export function runCie10SearchEngineUnitTests(): void {
  const engine = new Cie10SearchEngine()

  const atmResults = engine.search('atm')
  const k076 = atmResults.find((entry) => entry.code === 'K07.6')
  if (!k076) {
    throw new Error(
      `Expected K07.6 when searching "atm". Received: ${atmResults.map((e) => e.code).join(', ') || '(empty)'}`,
    )
  }

  const normalizeChecks: [string, string][] = [
    ['  ATM  ', 'atm'],
    ['Caries', 'caries'],
    ['Artículación', 'articulacion'],
  ]
  for (const [input, expected] of normalizeChecks) {
    if (engine.normalize(input) !== expected) {
      throw new Error(`normalize("${input}") expected "${expected}"`)
    }
  }

  const emptyResults = engine.search('')
  if (emptyResults.length !== 0) {
    throw new Error('Empty query should return no results')
  }

  const cariesResults = engine.search('caries')
  if (cariesResults.length === 0) {
    throw new Error('Expected at least one result for "caries"')
  }
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1]?.replace(/\\/g, '/').endsWith('Cie10SearchEngine.ts'))

if (isDirectExecution) {
  runCie10SearchEngineUnitTests()
  console.log('Cie10SearchEngine: all unit tests passed')
}
