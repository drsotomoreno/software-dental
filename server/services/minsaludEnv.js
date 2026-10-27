/**
 * Lectura común de las variables del MUV.
 * MINSALUD_SANDBOX=false (también FALSE, "false", 0, no) usa el host de producción.
 * Sin bandera, las credenciales SISPRO también salen del stage: no se fuerza el sandbox
 * si el usuario, la clave y el NIT ya están presentes.
 */

export function readMinsaludEnv(source, name) {
  const raw = source?.[name]
  if (typeof raw !== 'string') return ''
  let value = raw.trim()
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim()
  }
  return value
}

export function hasSisproCredentials(source = process.env) {
  const username = readMinsaludEnv(source, 'MINSALUD_USERNAME')
  const password = readMinsaludEnv(source, 'MINSALUD_PASSWORD')
  const nit = readMinsaludEnv(source, 'MINSALUD_NIT').replace(/\D/g, '')
  return Boolean(username && password && nit)
}

const SANDBOX_OFF = new Set(['false', '0', 'no', 'off'])
const SANDBOX_ON = new Set(['true', '1', 'yes', 'on'])

export function isMinsaludSandbox(source = process.env) {
  const flag = readMinsaludEnv(source, 'MINSALUD_SANDBOX').toLowerCase()
  if (SANDBOX_OFF.has(flag)) return false
  if (SANDBOX_ON.has(flag)) return true
  return !hasSisproCredentials(source)
}
