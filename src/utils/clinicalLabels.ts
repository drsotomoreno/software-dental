/** Primera letra de cada palabra en mayúscula (etiquetas de historia clínica). */
export function toClinicalTitleCase(text: string): string {
  return text
    .split(/(\s+|—)/)
    .map((part) => {
      if (!part || part === '—' || /^\s+$/.test(part)) return part
      if (/^[A-Z0-9]{2,}$/.test(part) || part.includes('/')) return part
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('')
}
