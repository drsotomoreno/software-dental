import { getStoredApiAuth } from '@/services/apiAuthService'
import { resolveClinicSyncId } from '../../shared/clinicalSyncScope.js'

let applyingRemotePull = 0
let suppressClinicalSyncStamp = 0
let dirtyListener: (() => void) | null = null

export function isApplyingRemotePull(): boolean {
  return applyingRemotePull > 0
}

export async function withRemotePullLock<T>(fn: () => Promise<T>): Promise<T> {
  applyingRemotePull += 1
  try {
    return await fn()
  } finally {
    applyingRemotePull -= 1
  }
}

export function isClinicalSyncSuppressed(): boolean {
  return suppressClinicalSyncStamp > 0
}

export async function withClinicalSyncSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  suppressClinicalSyncStamp += 1
  try {
    return await fn()
  } finally {
    suppressClinicalSyncStamp -= 1
  }
}

export function getCurrentClinicId(): string {
  try {
    const auth = getStoredApiAuth()
    return resolveClinicSyncId(auth?.user)
  } catch {
    return ''
  }
}

export function setClinicalSyncDirtyListener(listener: (() => void) | null): void {
  dirtyListener = listener
}

export function notifyClinicalRecordDirty(): void {
  dirtyListener?.()
}
