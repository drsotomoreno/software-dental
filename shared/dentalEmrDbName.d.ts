export function sanitizeDentalDbSegment(value?: string | null): string

export function resolveDentalEmrDbNameFromUser(
  user?: { id?: string; clinicId?: string; email?: string } | null,
  overrides?: { userId?: string | null; clinicaId?: string | null },
): string

export function orphanUuidDentalEmrDbName(userId?: string | null): string

export function isOrphanUuidDentalEmrDb(
  dbName?: string | null,
  userId?: string | null,
  canonicalDbName?: string | null,
): boolean
