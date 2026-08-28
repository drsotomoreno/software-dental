export const VALUATION_CONSENT_TITLE =
  'Consentimiento Informado para Valoración y Diagnóstico Integral'

export const VALUATION_CONSENT_SUMMARY =
  'Autorización para valoración clínica odontológica, registro de datos personales y elaboración de diagnóstico presuntivo conforme a la normativa colombiana.'

export const VALUATION_CONSENT_KEY_POINTS = [
  {
    title: 'Alcance del diagnóstico',
    text: 'La valoración incluye examen clínico, registro de hallazgos y formulación de diagnósticos presuntivos CIE-10. Pueden requerirse exámenes complementarios para confirmación.',
  },
  {
    title: 'Naturaleza de la valoración',
    text: 'La valoración rápida es un proceso inicial orientativo. No sustituye la historia clínica completa ni constituye inicio de tratamiento sin su aceptación expresa.',
  },
  {
    title: 'Habeas data (Ley 1581 de 2012)',
    text: 'Autorizo el tratamiento de mis datos personales y clínicos para fines de atención, facturación, auditoría y cumplimiento normativo. Conozco mis derechos de conocer, actualizar, rectificar y suprimir datos.',
  },
  {
    title: 'Libertad de elección',
    text: 'Puedo negarme, revocar este consentimiento o solicitar aclaraciones sin que ello afecte la atención de urgencias. La decisión quedará registrada.',
  },
] as const

export const VALUATION_CONSENT_CHECKBOX_LABEL =
  'He leído, comprendo y acepto el Consentimiento para Valoración y el Aviso de Privacidad.'

export function buildValuationConsentTextSnapshot(): string {
  const points = VALUATION_CONSENT_KEY_POINTS.map(
    (point) => `${point.title}: ${point.text}`,
  ).join('\n')
  return `${VALUATION_CONSENT_TITLE}\n${VALUATION_CONSENT_SUMMARY}\n\n${points}`
}
