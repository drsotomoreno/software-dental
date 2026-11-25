/**
 * Meta Cloud API — envío multi-tenant por clínica (phone_number_id + token cifrado).
 * DRY_RUN: sin excepción si la sede no está conectada o faltan credenciales en desarrollo.
 */
import { config } from '../config.js'
import { decryptSecret } from '../utils/tokenEncryption.js'
import { ensureWhatsappClinicSchema, getClinicWhatsappRow } from './whatsappClinicStore.js'

const GRAPH_VERSION = 'v21.0'
const LOG_PREFIX = '[MetaWhatsApp]'

export function normalizeMetaRecipient(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`
  if (digits.startsWith('57') && digits.length >= 12) return digits
  return digits
}

function forceDryRunEnv() {
  const raw = String(process.env.WHATSAPP_DRY_RUN ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

function isDevEnv() {
  return process.env.NODE_ENV !== 'production' && process.env.RENDER !== 'true'
}

/**
 * @param {object|null} row fila clinicas WhatsApp
 */
export function resolveSendMode(row) {
  if (forceDryRunEnv()) {
    return { dryRun: true, reason: 'WHATSAPP_DRY_RUN' }
  }
  const phoneNumberId = String(row?.whatsapp_phone_number_id || '').trim()
  const tokenEnc = String(row?.whatsapp_access_token || '').trim()
  const connected = row?.whatsapp_connected === true
  if (!connected) {
    return { dryRun: true, reason: 'whatsapp_connected=false' }
  }
  if (!phoneNumberId || !tokenEnc) {
    if (isDevEnv()) {
      return { dryRun: true, reason: 'missing_credentials_dev' }
    }
    return { dryRun: true, reason: 'missing_credentials' }
  }
  return { dryRun: false, phoneNumberId, tokenEnc }
}

function decryptClinicToken(tokenEnc) {
  try {
    return decryptSecret(tokenEnc)
  } catch (error) {
    // Fallback: token global de entorno (OTP legacy) solo si el ciphertext falla.
    const fallback = String(config.metaWhatsapp?.accessToken || process.env.META_WHATSAPP_TOKEN || '').trim()
    if (fallback) return fallback
    throw error
  }
}

function graphMessagesUrl(phoneNumberId) {
  const version = String(
    process.env.META_GRAPH_API_VERSION || config.metaWhatsapp?.graphVersion || GRAPH_VERSION,
  ).replace(/^\/+|\/+$/g, '')
  return `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`
}

async function postGraphMessage({ phoneNumberId, accessToken, payload, fetchImpl }) {
  const response = await fetchImpl(graphMessagesUrl(phoneNumberId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  })
  const raw = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err = raw && typeof raw === 'object' ? raw.error || {} : {}
    return {
      ok: false,
      status: response.status,
      error: String(err.message || `Meta HTTP ${response.status}`),
      code: err.code,
      raw,
    }
  }
  const messageId =
    raw && Array.isArray(raw.messages) && raw.messages[0]?.id ? String(raw.messages[0].id) : null
  return { ok: true, status: response.status, messageId, raw }
}

async function loadClinicCredentials(clinicId) {
  await ensureWhatsappClinicSchema()
  const row = await getClinicWhatsappRow(clinicId)
  if (!row) {
    return { row: null, mode: { dryRun: true, reason: 'clinic_not_found' } }
  }
  return { row, mode: resolveSendMode(row) }
}

function logDryRun(kind, meta) {
  console.info(
    LOG_PREFIX,
    'DRY_RUN',
    JSON.stringify({
      kind,
      clinicId: meta.clinicId,
      to: meta.to ? `${String(meta.to).slice(0, 4)}…${String(meta.to).slice(-2)}` : null,
      templateName: meta.templateName || undefined,
      reason: meta.reason,
    }),
  )
}

/**
 * Envía plantilla HSM (recordatorios / inasistencias).
 * @param {{ clinicId: string, toPhone: string, templateName: string, languageCode?: string, components?: object[] }} args
 */
export async function sendTemplateMessage(
  { clinicId, toPhone, templateName, languageCode = 'es', components = [] },
  deps = {},
) {
  const fetchImpl = deps.fetch || globalThis.fetch
  const to = normalizeMetaRecipient(toPhone)
  if (!to) {
    return { ok: false, status: 400, error: 'Número de destino inválido.', dryRun: false }
  }
  if (!templateName) {
    return { ok: false, status: 400, error: 'templateName requerido.', dryRun: false }
  }

  const { mode } = deps.credentials
    ? { mode: deps.credentials }
    : await loadClinicCredentials(clinicId)

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: String(templateName),
      language: { code: languageCode || 'es' },
      ...(Array.isArray(components) && components.length ? { components } : {}),
    },
  }

  if (mode.dryRun) {
    logDryRun('template', {
      clinicId,
      to,
      templateName,
      reason: mode.reason,
    })
    return {
      ok: true,
      dryRun: true,
      reason: mode.reason,
      to,
      templateName,
      messageId: `dryrun-tpl-${Date.now()}`,
    }
  }

  let accessToken
  try {
    accessToken = decryptClinicToken(mode.tokenEnc)
  } catch (error) {
    if (isDevEnv()) {
      logDryRun('template', {
        clinicId,
        to,
        templateName,
        reason: 'decrypt_failed_dev',
      })
      return {
        ok: true,
        dryRun: true,
        reason: 'decrypt_failed_dev',
        to,
        templateName,
        messageId: `dryrun-tpl-${Date.now()}`,
      }
    }
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'No se pudo descifrar el token WhatsApp.',
      dryRun: false,
    }
  }

  try {
    const result = await postGraphMessage({
      phoneNumberId: mode.phoneNumberId,
      accessToken,
      payload,
      fetchImpl,
    })
    if (!result.ok) {
      console.error(LOG_PREFIX, 'template rejected', {
        clinicId,
        templateName,
        status: result.status,
        code: result.code,
      })
    }
    return { ...result, dryRun: false, to, templateName }
  } catch (error) {
    console.error(LOG_PREFIX, 'template network', error instanceof Error ? error.message : error)
    return {
      ok: false,
      status: 502,
      error: 'No se pudo contactar Graph API.',
      dryRun: false,
    }
  }
}

/**
 * Envía mensaje interactivo (botones / lista) dentro de la ventana 24h.
 * @param {{ clinicId: string, toPhone: string, interactivePayload: object }} args
 */
export async function sendInteractiveMessage(
  { clinicId, toPhone, interactivePayload },
  deps = {},
) {
  const fetchImpl = deps.fetch || globalThis.fetch
  const to = normalizeMetaRecipient(toPhone)
  if (!to) {
    return { ok: false, status: 400, error: 'Número de destino inválido.', dryRun: false }
  }
  if (!interactivePayload || typeof interactivePayload !== 'object') {
    return { ok: false, status: 400, error: 'interactivePayload requerido.', dryRun: false }
  }

  const { mode } = deps.credentials
    ? { mode: deps.credentials }
    : await loadClinicCredentials(clinicId)

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: interactivePayload,
  }

  if (mode.dryRun) {
    logDryRun('interactive', {
      clinicId,
      to,
      reason: mode.reason,
    })
    return {
      ok: true,
      dryRun: true,
      reason: mode.reason,
      to,
      messageId: `dryrun-int-${Date.now()}`,
    }
  }

  let accessToken
  try {
    accessToken = decryptClinicToken(mode.tokenEnc)
  } catch (error) {
    if (isDevEnv()) {
      logDryRun('interactive', { clinicId, to, reason: 'decrypt_failed_dev' })
      return {
        ok: true,
        dryRun: true,
        reason: 'decrypt_failed_dev',
        to,
        messageId: `dryrun-int-${Date.now()}`,
      }
    }
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'No se pudo descifrar el token WhatsApp.',
      dryRun: false,
    }
  }

  try {
    const result = await postGraphMessage({
      phoneNumberId: mode.phoneNumberId,
      accessToken,
      payload,
      fetchImpl,
    })
    return { ...result, dryRun: false, to }
  } catch (error) {
    console.error(LOG_PREFIX, 'interactive network', error instanceof Error ? error.message : error)
    return {
      ok: false,
      status: 502,
      error: 'No se pudo contactar Graph API.',
      dryRun: false,
    }
  }
}

/** Texto libre dentro de ventana abierta (confirmaciones cortas). */
export async function sendTextMessage({ clinicId, toPhone, body }, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch
  const to = normalizeMetaRecipient(toPhone)
  const text = String(body || '').trim()
  if (!to || !text) {
    return { ok: false, status: 400, error: 'toPhone y body requeridos.', dryRun: false }
  }

  const { mode } = deps.credentials
    ? { mode: deps.credentials }
    : await loadClinicCredentials(clinicId)

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text.slice(0, 4096) },
  }

  if (mode.dryRun) {
    logDryRun('text', { clinicId, to, reason: mode.reason })
    return { ok: true, dryRun: true, reason: mode.reason, to, messageId: `dryrun-txt-${Date.now()}` }
  }

  let accessToken
  try {
    accessToken = decryptClinicToken(mode.tokenEnc)
  } catch (error) {
    if (isDevEnv()) {
      return { ok: true, dryRun: true, reason: 'decrypt_failed_dev', to, messageId: `dryrun-txt-${Date.now()}` }
    }
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'No se pudo descifrar el token WhatsApp.',
      dryRun: false,
    }
  }

  try {
    const result = await postGraphMessage({
      phoneNumberId: mode.phoneNumberId,
      accessToken,
      payload,
      fetchImpl,
    })
    return { ...result, dryRun: false, to }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: 'No se pudo contactar Graph API.',
      dryRun: false,
    }
  }
}
