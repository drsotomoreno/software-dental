export const PROVIDER_TYPE_INSTITUCION = 'institucion'
export const PROVIDER_TYPE_INDEPENDIENTE = 'profesional_independiente'

export const PROVIDER_TYPES = [
  {
    id: PROVIDER_TYPE_INSTITUCION,
    label: 'Institución / Persona jurídica (IPS)',
    hint: 'Dueño no profesional. El REPS de la sede y el NIT identifican la entidad. Los odontólogos se vinculan con su ReTHUS.',
  },
  {
    id: PROVIDER_TYPE_INDEPENDIENTE,
    label: 'Profesional independiente',
    hint: 'Consultorio unipersonal. La cédula y el ReTHUS validan al profesional que habilita y factura.',
  },
]

export function normalizeProviderType(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === PROVIDER_TYPE_INSTITUCION || raw === 'ips' || raw === 'juridica' || raw === 'persona_juridica') {
    return PROVIDER_TYPE_INSTITUCION
  }
  return PROVIDER_TYPE_INDEPENDIENTE
}

export function isInstitutionProvider(value) {
  return normalizeProviderType(value) === PROVIDER_TYPE_INSTITUCION
}
