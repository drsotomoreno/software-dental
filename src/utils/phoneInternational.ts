export type PhoneCountry = {
  iso: string
  name: string
  /** Indicativo sin signo +. */
  dial: string
  flag: string
}

/** Colombia primero; después los destinos más frecuentes de la región y la diáspora. */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'CO', name: 'Colombia', dial: '57', flag: '🇨🇴' },
  { iso: 'VE', name: 'Venezuela', dial: '58', flag: '🇻🇪' },
  { iso: 'US', name: 'Estados Unidos', dial: '1', flag: '🇺🇸' },
  { iso: 'EC', name: 'Ecuador', dial: '593', flag: '🇪🇨' },
  { iso: 'PE', name: 'Perú', dial: '51', flag: '🇵🇪' },
  { iso: 'ES', name: 'España', dial: '34', flag: '🇪🇸' },
  { iso: 'MX', name: 'México', dial: '52', flag: '🇲🇽' },
  { iso: 'AR', name: 'Argentina', dial: '54', flag: '🇦🇷' },
  { iso: 'CL', name: 'Chile', dial: '56', flag: '🇨🇱' },
  { iso: 'BR', name: 'Brasil', dial: '55', flag: '🇧🇷' },
  { iso: 'PA', name: 'Panamá', dial: '507', flag: '🇵🇦' },
  { iso: 'CR', name: 'Costa Rica', dial: '506', flag: '🇨🇷' },
  { iso: 'GT', name: 'Guatemala', dial: '502', flag: '🇬🇹' },
  { iso: 'HN', name: 'Honduras', dial: '504', flag: '🇭🇳' },
  { iso: 'SV', name: 'El Salvador', dial: '503', flag: '🇸🇻' },
  { iso: 'NI', name: 'Nicaragua', dial: '505', flag: '🇳🇮' },
  { iso: 'BO', name: 'Bolivia', dial: '591', flag: '🇧🇴' },
  { iso: 'PY', name: 'Paraguay', dial: '595', flag: '🇵🇾' },
  { iso: 'UY', name: 'Uruguay', dial: '598', flag: '🇺🇾' },
  { iso: 'CU', name: 'Cuba', dial: '53', flag: '🇨🇺' },
  { iso: 'CA', name: 'Canadá', dial: '1', flag: '🇨🇦' },
  { iso: 'DE', name: 'Alemania', dial: '49', flag: '🇩🇪' },
  { iso: 'FR', name: 'Francia', dial: '33', flag: '🇫🇷' },
  { iso: 'IT', name: 'Italia', dial: '39', flag: '🇮🇹' },
  { iso: 'GB', name: 'Reino Unido', dial: '44', flag: '🇬🇧' },
  { iso: 'PT', name: 'Portugal', dial: '351', flag: '🇵🇹' },
]

export const COLOMBIA_PHONE_COUNTRY = PHONE_COUNTRIES[0]

const DIAL_MATCHES = [...PHONE_COUNTRIES].sort(
  (a, b) => b.dial.length - a.dial.length || PHONE_COUNTRIES.indexOf(a) - PHONE_COUNTRIES.indexOf(b),
)

export function splitInternationalPhone(raw: string): { country: PhoneCountry; national: string } {
  const trimmed = String(raw ?? '').trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return { country: COLOMBIA_PHONE_COUNTRY, national: '' }

  const explicit = trimmed.startsWith('+') || trimmed.startsWith('00')
  const internationalDigits = trimmed.startsWith('00') ? digits.replace(/^00/, '') : digits
  if (explicit || internationalDigits.length > 10) {
    for (const country of DIAL_MATCHES) {
      if (!internationalDigits.startsWith(country.dial)) continue
      const national = internationalDigits.slice(country.dial.length)
      if (national.length >= 6 && national.length <= 14) {
        return { country, national }
      }
    }
  }

  return { country: COLOMBIA_PHONE_COUNTRY, national: digits }
}

export function composeInternationalPhone(country: PhoneCountry, nationalRaw: string): string {
  const national = String(nationalRaw ?? '').replace(/\D/g, '')
  if (!national) return ''
  return `+${country.dial}${national}`
}

/** Valor listo para IndexedDB y el backend: E.164, por ejemplo +573001234567. */
export function toStoredInternationalPhone(raw: string): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  const { country, national } = splitInternationalPhone(trimmed)
  return composeInternationalPhone(country, national)
}

export function phonesEquivalent(left: string, right: string): boolean {
  const a = String(left ?? '').replace(/\D/g, '')
  const b = String(right ?? '').replace(/\D/g, '')
  if (!a || !b) return false
  if (a === b) return true
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a]
  if (shorter.length < 7 || !longer.endsWith(shorter)) return false
  const prefix = longer.slice(0, longer.length - shorter.length)
  return PHONE_COUNTRIES.some((country) => country.dial === prefix)
}
