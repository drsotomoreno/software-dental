export function stableStringify(value: unknown): string
export function hashStringFnv1a(input: string): string
export function clinicalEditableSnapshot(clinicalData: unknown): Record<string, unknown> | null
export function computeClinicalFormHash(clinicalData: unknown): string
export function detectChangedClinicalSections(previous: unknown, next: unknown): string[]
