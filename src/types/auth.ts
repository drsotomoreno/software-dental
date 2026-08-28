import type { UserProfile } from './user'

export interface UserCredentials {
  userId: string
  passwordHash: string
  passwordSalt: string
  updatedAt: string
}

export interface AuthSession {
  id: string
  userId: string
  createdAt: string
  expiresAt: string
  userAgent: string
}

export interface AuthUser extends UserProfile {
  sessionId: string
}

export const SESSION_STORAGE_KEY = 'dental_emr_session_token'
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000

/** Contraseña inicial del usuario demo (cambiar en producción) */
export const DEMO_DEFAULT_PASSWORD = 'Dental2026!'
