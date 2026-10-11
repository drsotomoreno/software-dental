import { db } from '@/db/database'
import type { AuthUser } from '@/types/auth'
import {
  getStoredApiAuth,
  mapApiUserToAuthUser,
  setStoredApiAuth,
  type ApiSubscriptionUser,
} from '@/services/apiAuthService'
import { upsertProfessionalFromUser } from '@/services/dentalServiceCatalogService'
import { rememberOwnProfessionalDocument } from '@/services/subscriptionService'
import type { UserRole } from '@/types/user'
import {
  dominantProfessionalDocument,
  professionalDocumentCandidatesForSigner,
  validateProfessionalDocumentNumber,
} from '@/utils/professionalDocument'
import { resolveSignerDocumentNumber } from '@/utils/professionalSignGate'

function canOwnProfessionalDocument(role: UserRole | undefined): boolean {
  return role === 'odontologo' || role === 'admin' || role === 'superadmin'
}

async function writeDocumentLocally(user: AuthUser, documentNumber: string): Promise<void> {
  const documentType = user.documentType || 'CC'
  const local = await db.users.get(user.id)
  if (local) {
    await db.users.update(user.id, { documentNumber, documentType })
  }
  await upsertProfessionalFromUser({ ...user, documentNumber, documentType })
}

function overlaySessionDocument(user: AuthUser, documentNumber: string): AuthUser {
  const documentType = user.documentType || 'CC'
  const stored = getStoredApiAuth()
  if (stored?.user) {
    const patched: ApiSubscriptionUser = { ...stored.user, documentNumber, documentType }
    setStoredApiAuth(stored.token, patched)
    return mapApiUserToAuthUser(patched, stored.token)
  }
  return { ...user, documentNumber, documentType }
}

/**
 * Deja la cédula en el perfil (servidor y este equipo) cuando la atención
 * ya la tiene y la cuenta no. No reemplaza una cédula distinta ya guardada.
 */
export async function ensureProfessionalDocument(
  user: AuthUser,
  clinical: unknown,
  applySessionUser?: (user: ApiSubscriptionUser) => void,
): Promise<AuthUser> {
  const documentType = user.documentType || 'CC'
  const resolved = resolveSignerDocumentNumber(user, clinical)
  if (!resolved) return user

  const current = validateProfessionalDocumentNumber(user.documentNumber, documentType)
  if (current.valid) return user
  if (!canOwnProfessionalDocument(user.role)) return { ...user, documentNumber: resolved }

  let next = overlaySessionDocument(user, resolved)
  try {
    await writeDocumentLocally(next, resolved)
  } catch (error) {
    console.error('[perfil] No se pudo guardar la cédula en este equipo:', error)
  }

  try {
    const remote = await rememberOwnProfessionalDocument(resolved, documentType)
    if (remote.ok) {
      const token = getStoredApiAuth()?.token || user.sessionId
      setStoredApiAuth(token, remote.user)
      applySessionUser?.(remote.user)
      next = mapApiUserToAuthUser(remote.user, token)
    } else {
      const storedUser = getStoredApiAuth()?.user
      if (storedUser) applySessionUser?.(storedUser)
    }
  } catch (error) {
    console.error('[perfil] No se pudo guardar la cédula en la cuenta:', error)
    const storedUser = getStoredApiAuth()?.user
    if (storedUser) applySessionUser?.(storedUser)
  }

  return next.documentNumber ? next : { ...next, documentNumber: resolved }
}

async function collectClinicDocumentCandidates(user: AuthUser): Promise<Array<string | null | undefined>> {
  const candidates: Array<string | null | undefined> = []
  const drafts = await db.patientClinicalDrafts.toArray()
  for (const draft of drafts) {
    candidates.push(
      ...professionalDocumentCandidatesForSigner(draft.clinicalDraft, user),
      ...professionalDocumentCandidatesForSigner(draft.valuationDraft, user),
      ...professionalDocumentCandidatesForSigner({ evolutionNotes: draft.evolutionNotes }, user),
    )
  }
  const records = await db.clinicalRecords.toArray()
  for (const record of records) {
    candidates.push(...professionalDocumentCandidatesForSigner(record, user))
  }
  const professional = await db.professionals.where('userId').equals(user.id).first()
  if (professional?.documentNumber) candidates.push(professional.documentNumber)
  return candidates
}

/**
 * Al entrar, si el perfil no tiene cédula pero todas las atenciones guardaron
 * la misma, la recupera. Así el cierre no vuelve a pedirla.
 */
export async function recoverMissingProfessionalDocument(user: AuthUser): Promise<AuthUser> {
  if (!canOwnProfessionalDocument(user.role)) return user
  const current = validateProfessionalDocumentNumber(user.documentNumber, user.documentType || 'CC')
  if (current.valid) return user

  let dominant = ''
  try {
    dominant = dominantProfessionalDocument(
      await collectClinicDocumentCandidates(user),
      user.documentType || 'CC',
    )
  } catch (error) {
    console.error('[perfil] No se pudo revisar la cédula guardada en las atenciones:', error)
    return user
  }
  if (!dominant) return user
  return ensureProfessionalDocument(user, {
    informedConsent: { professionalLicense: dominant, professionalRegistry: dominant },
  })
}
