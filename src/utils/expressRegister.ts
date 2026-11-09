/**
 * Registro express sin plan: el usuario solo puede usar /demo hasta activar
 * prueba o comprar. Ya no existe bypass hacia /app.
 */

const FLAG_KEY = 'mhd_express_register'

/** Marca que acaba de registrarse; la UI puede orientar a la demo. */
export function markExpressRegisterComplete(): void {
  try {
    sessionStorage.setItem(FLAG_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function clearExpressRegisterFlag(): void {
  try {
    sessionStorage.removeItem(FLAG_KEY)
  } catch {
    /* ignore */
  }
}

/** @deprecated No abre el consultorio. Conservado por compatibilidad de imports. */
export function hasExpressRegisterBypass(): boolean {
  return false
}

export function justFinishedExpressRegister(): boolean {
  try {
    return sessionStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}
