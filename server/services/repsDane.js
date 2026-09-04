import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRepsCode, VERIFIED_REPS_EXAMPLE_DISPLAY } from '../../shared/repsCode.js'

const CITIES_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../src/data/dane-cities.json')

let daneCodes

function loadDaneCodes() {
  if (daneCodes) return daneCodes
  const json = JSON.parse(readFileSync(CITIES_PATH, 'utf8'))
  daneCodes = new Set((json.data ?? []).map((city) => String(city.id).padStart(5, '0')))
  return daneCodes
}

/** REPS de 12 dígitos cuyo DANE (5 primeros) existe en el catálogo municipal vigente. */
export function parseRepsCodeWithDane(value) {
  const parsed = parseRepsCode(value)
  if (!parsed.valid) return parsed
  if (!loadDaneCodes().has(parsed.daneMunicipality)) {
    return {
      ...parsed,
      valid: false,
      message:
        `El código DANE ${parsed.daneMunicipality} del REPS no corresponde a un municipio vigente. ` +
        `Verifique departamento y municipio (ej. ${VERIFIED_REPS_EXAMPLE_DISPLAY} = Santander / Bucaramanga).`,
    }
  }
  return parsed
}
