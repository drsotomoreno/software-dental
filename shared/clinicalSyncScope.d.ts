export const SUPERADMIN_SYNC_EMAIL: string
export const SUPERADMIN_CLINIC_SYNC_ID: string

export function resolveClinicSyncId(user?: object | null): string
export function clinicSyncAliasIds(user?: object | null): {
  canonical: string
  aliases: string[]
}
