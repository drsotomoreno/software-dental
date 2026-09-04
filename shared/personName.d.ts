export function stripHonorific(value?: string | null): string
export function cleanPersonNamePart(value?: string | null): string
export function cleanPersonNameInput(value?: string | null): string
export function splitPersonName(input?: {
  nombre?: string
  firstName?: string
  lastName?: string
}): { firstName: string; lastName: string }
export function composeLegalName(firstName?: string | null, lastName?: string | null): string
