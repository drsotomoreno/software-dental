import { getStoredApiAuth } from '@/services/apiAuthService'
import { userHasTrialLimits } from '@/utils/subscriptionAccess'

const VOICE_USAGE_KEY = 'doctorSEO_trial_voice_notes'

type VoiceUsage = Record<string, Record<string, boolean>>

function readUsage(): VoiceUsage {
  try {
    const parsed = JSON.parse(localStorage.getItem(VOICE_USAGE_KEY) || '{}') as VoiceUsage
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeUsage(usage: VoiceUsage) {
  localStorage.setItem(VOICE_USAGE_KEY, JSON.stringify(usage))
}

export function isTrialVoiceFieldUsed(userId: string, fieldId: string): boolean {
  return Boolean(readUsage()[userId]?.[fieldId])
}

export function markTrialVoiceFieldUsed(userId: string, fieldId: string) {
  const usage = readUsage()
  usage[userId] = { ...(usage[userId] ?? {}), [fieldId]: true }
  writeUsage(usage)
}

export function trialVoiceFieldMessage(): string {
  return 'En la prueba gratuita solo puede grabar una nota de voz por casilla. Actualice su plan para dictado ilimitado.'
}

export function assertTrialVoiceAllowed(fieldId: string): { ok: true } | { ok: false; error: string } {
  const auth = getStoredApiAuth()
  if (!auth || !userHasTrialLimits(auth.user)) return { ok: true }
  if (isTrialVoiceFieldUsed(auth.user.id, fieldId)) {
    return { ok: false, error: trialVoiceFieldMessage() }
  }
  return { ok: true }
}

export function recordTrialVoiceIfNeeded(fieldId: string) {
  const auth = getStoredApiAuth()
  if (!auth || !userHasTrialLimits(auth.user)) return
  markTrialVoiceFieldUsed(auth.user.id, fieldId)
}

export async function countOwnedPatients(ownerUserId: string): Promise<number> {
  const { db } = await import('@/db/database')
  const patients = await db.patients.toArray()
  return patients.filter((patient) => String(patient.ownerUserId ?? '') === ownerUserId).length
}

export const TRIAL_PATIENT_LIMIT_MESSAGE =
  'La prueba gratuita permite un solo paciente. Actualice su plan para registrar más historias clínicas.'
