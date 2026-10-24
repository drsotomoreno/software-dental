export function unwrapClinicalPayload(record: unknown): Record<string, unknown>
export function evolutionNotesHaveContent(notes: unknown): boolean
export function mergeSignedEvolutionNotes(baseNotes: unknown, incomingNotes: unknown): unknown
export function anamnesisHasContent(anamnesis: unknown): boolean
export function stomatologicalExamHasContent(exam: unknown): boolean
export function informedConsentHasContent(consent: unknown): boolean
export function treatmentPlanHasContent(plan: unknown): boolean
export function specializedAnnexesHaveContent(annexes: unknown): boolean
export function clinicalFormHasContent(form: unknown): boolean
export function clinicalDocumentRichness(record: unknown): number
export function clinicalBodyHasContent(record: unknown): boolean
export function isSignedClinicalDocument(record: unknown): boolean
export function isBlankClinicalShell(record: unknown): boolean
export function shouldPersistClinicalDraft(existing: unknown, incoming: unknown): boolean
export function shouldReplaceClinicalDocument(prev: unknown, next: unknown): boolean
