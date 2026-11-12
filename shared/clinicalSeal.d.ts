export function unwrapClinicalPayload(record: unknown): Record<string, unknown>
export function canonicalize(value: unknown): string
export function buildEvolutionSealPayload(note: unknown): Record<string, unknown> | null
export function buildClinicalSealPayload(record: unknown): Record<string, unknown>
export function clinicalSealCanonical(record: unknown): string
export function evolutionSealCanonical(note: unknown): string
export function clinicalSealsEqual(left: unknown, right: unknown): boolean
export function evolutionSealsEqual(left: unknown, right: unknown): boolean
export function recordHasSignedAt(record: unknown): boolean
export function mergeEvolutionAdminSidecar(baseNote: unknown, incomingNote: unknown): unknown
