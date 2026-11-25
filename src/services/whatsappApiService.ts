import { getStoredApiAuth } from '@/services/apiAuthService'

export type WhatsappSubscriptionSnapshot = {
  subscription_status: string
  plan_type: string
  paid_subscription_active: boolean
  estado_pago: string | null
  plan: string | null
  fecha_vencimiento: string | null
}

export type WhatsappPackage = {
  id: string
  name: string
  type: 'reminders' | 'chatbot'
  credits: number
  bonusCredits: number
  amountCOP: number
  priceLabel: string
  blurb: string
}

export type WhatsappStatus = {
  clinic_id: string
  whatsapp_connected: boolean
  whatsapp_phone_number_id: string | null
  whatsapp_waba_id: string | null
  has_access_token: boolean
  reminders_balance: number
  chatbot_sessions_balance: number
  chatbot_enabled: boolean
  pending_manual_call: number
  subscription: WhatsappSubscriptionSnapshot
  packages: WhatsappPackage[]
}

export type WhatsappNoShowItem = {
  id: string
  clinic_id: string
  patient_id: string | null
  missed_appointment_id: string | null
  step: number
  next_send_at: string | null
  last_attempt_at: string | null
  status: string
  receptionist_notes: string | null
  created_at?: string
  updated_at?: string
  patient_name?: string | null
  patient_phone?: string | null
  missed_start_time?: string | null
  appointment_sync_id?: string | null
  patient_sync_id?: string | null
}

export type WhatsappCheckoutResult = {
  orderId: string
  amount: string
  currency: string
  integritySignature: string
  apiKey: string
  description: string
  package: {
    id: string
    name: string
    type: string
    credits: number
    amountCOP: number
    priceLabel: string
  }
  clinic_id: string
}

type ApiEnvelope<T> = T & {
  success?: boolean
  ok?: boolean
  error?: string
}

function identityHeaders() {
  const auth = getStoredApiAuth()
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
    ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
  }
}

async function authFetch<T>(url: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...identityHeaders(),
      ...(init?.headers || {}),
    },
  })
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!response.ok || payload.ok === false || payload.success === false) {
    const error = new Error(payload.error || `Error HTTP ${response.status}`)
    ;(error as Error & { status?: number; code?: string }).status = response.status
    throw error
  }
  return payload
}

export async function fetchWhatsappStatus(): Promise<WhatsappStatus> {
  const payload = await authFetch<WhatsappStatus>('/api/whatsapp/status')
  return {
    clinic_id: String(payload.clinic_id || ''),
    whatsapp_connected: payload.whatsapp_connected === true,
    whatsapp_phone_number_id: payload.whatsapp_phone_number_id ?? null,
    whatsapp_waba_id: payload.whatsapp_waba_id ?? null,
    has_access_token: payload.has_access_token === true,
    reminders_balance: Number(payload.reminders_balance) || 0,
    chatbot_sessions_balance: Number(payload.chatbot_sessions_balance) || 0,
    chatbot_enabled: payload.chatbot_enabled === true,
    pending_manual_call: Number(payload.pending_manual_call) || 0,
    subscription: payload.subscription || {
      subscription_status: 'inactive',
      plan_type: 'none',
      paid_subscription_active: false,
      estado_pago: null,
      plan: null,
      fecha_vencimiento: null,
    },
    packages: Array.isArray(payload.packages) ? payload.packages : [],
  }
}

export async function patchWhatsappSettings(patch: {
  chatbot_enabled?: boolean
}): Promise<Partial<WhatsappStatus>> {
  return authFetch('/api/whatsapp/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function createWhatsappCheckout(packageId: string): Promise<WhatsappCheckoutResult> {
  const payload = await authFetch<WhatsappCheckoutResult>('/api/whatsapp/checkout', {
    method: 'POST',
    body: JSON.stringify({ packageId }),
  })
  if (!payload.orderId || !payload.integritySignature || !payload.apiKey) {
    throw new Error('No se pudo preparar el checkout Bold del paquete WhatsApp.')
  }
  return payload
}

export async function fetchWhatsappNoShows(status?: string): Promise<WhatsappNoShowItem[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  const payload = await authFetch<{ items?: WhatsappNoShowItem[] }>(`/api/whatsapp/no-shows${qs}`)
  return Array.isArray(payload.items) ? payload.items : []
}

export async function patchWhatsappNoShow(
  id: string,
  patch: { status?: string; receptionist_notes?: string | null },
): Promise<WhatsappNoShowItem> {
  const payload = await authFetch<{ followup: WhatsappNoShowItem }>(
    `/api/whatsapp/no-shows/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  )
  return payload.followup
}
