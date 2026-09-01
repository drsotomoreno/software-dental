import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../config.js'

const SETTINGS_FILE = join(config.dataDir, 'mail-settings.json')

function emptySettings() {
  return {
    resendApiKey: '',
    sendgridApiKey: '',
    brevoApiKey: '',
    from: '',
  }
}

export async function loadMailSettings() {
  try {
    const parsed = JSON.parse(await readFile(SETTINGS_FILE, 'utf8'))
    return {
      ...emptySettings(),
      resendApiKey: String(parsed.resendApiKey ?? '').trim(),
      sendgridApiKey: String(parsed.sendgridApiKey ?? '').trim(),
      brevoApiKey: String(parsed.brevoApiKey ?? '').trim(),
      from: String(parsed.from ?? '').trim(),
    }
  } catch {
    return emptySettings()
  }
}

export async function saveMailSettings(input) {
  const current = await loadMailSettings()
  const next = {
    resendApiKey:
      input.resendApiKey === undefined ? current.resendApiKey : String(input.resendApiKey ?? '').trim(),
    sendgridApiKey:
      input.sendgridApiKey === undefined
        ? current.sendgridApiKey
        : String(input.sendgridApiKey ?? '').trim(),
    brevoApiKey:
      input.brevoApiKey === undefined ? current.brevoApiKey : String(input.brevoApiKey ?? '').trim(),
    from: input.from === undefined ? current.from : String(input.from ?? '').trim(),
  }
  await mkdir(config.dataDir, { recursive: true })
  await writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function publicMailStatus(settings, envConfigured) {
  const hasStoredKey = Boolean(settings.resendApiKey || settings.sendgridApiKey || settings.brevoApiKey)
  return {
    configured: Boolean(envConfigured || hasStoredKey),
    from: settings.from,
    hasBrevoKey: Boolean(process.env.BREVO_API_KEY || settings.brevoApiKey),
    hasResendKey: Boolean(process.env.RESEND_API_KEY || settings.resendApiKey),
    hasSendgridKey: Boolean(process.env.SENDGRID_API_KEY || settings.sendgridApiKey),
  }
}
