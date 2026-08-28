export interface ClientSignatureContext {
  userAgent: string
  timezone: string
  ipAddress: string
  capturedAt: string
}

let cachedIp: string | null = null

export async function resolveClientIpAddress(): Promise<string> {
  if (cachedIp) return cachedIp
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (response.ok) {
      const data = (await response.json()) as { ip?: string }
      if (data.ip) {
        cachedIp = data.ip
        return data.ip
      }
    }
  } catch {
    // Aplicación local: IP pública puede no estar disponible
  }
  return 'no-disponible-aplicacion-local'
}

export async function collectSignatureContext(): Promise<ClientSignatureContext> {
  const ipAddress = await resolveClientIpAddress()
  return {
    userAgent: navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ipAddress,
    capturedAt: new Date().toISOString(),
  }
}
