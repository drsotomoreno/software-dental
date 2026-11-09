const FLAG_KEY = 'mhd_express_register'

/** Marca registro express: el Dashboard no debe bloquearse por welcome-trial. */
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

export function hasExpressRegisterBypass(): boolean {
  try {
    return sessionStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}
