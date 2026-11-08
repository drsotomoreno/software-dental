/**
 * Pasos de la demo interactiva (versión de prueba reducida).
 */
export interface DemoStep {
  id: number
  title: string
  shortTitle: string
  description: string
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: 1,
    title: 'Nombre del paciente',
    shortTitle: 'Nombre',
    description: 'Identifique al paciente por su nombre completo.',
  },
  {
    id: 2,
    title: 'Motivo de consulta',
    shortTitle: 'Motivo',
    description: 'Registre por qué acude el paciente a la consulta.',
  },
  {
    id: 3,
    title: 'Odontograma',
    shortTitle: 'Odontograma',
    description: 'Registro dental por pieza (sistema FDI / ISO 3950).',
  },
  {
    id: 4,
    title: 'Diagnóstico CIE-10',
    shortTitle: 'CIE-10',
    description: 'Busque en el catálogo CIE odontológico y seleccione un solo código.',
  },
  {
    id: 5,
    title: 'Plan de tratamiento',
    shortTitle: 'Plan',
    description: 'Elija un procedimiento CUPS odontológico y calcule su costo (solo uno).',
  },
  {
    id: 6,
    title: 'Consentimiento y firma digital',
    shortTitle: 'Firma',
    description: 'Lienzo de firma táctil/mouse como en la tablet de recepción.',
  },
  {
    id: 7,
    title: 'Pagos',
    shortTitle: 'Pagos',
    description: 'Registre un abono al presupuesto del plan de tratamiento.',
  },
  {
    id: 8,
    title: 'Notas de evolución',
    shortTitle: 'Evolución',
    description: 'Redacte una nota de evolución clínica.',
  },
  {
    id: 9,
    title: 'Generación de RIPS',
    shortTitle: 'RIPS',
    description: 'Genere y descargue el JSON RIPS (simulación Res. 2275).',
  },
]

export const DEMO_STEP_COUNT = DEMO_STEPS.length

export function getDemoStep(stepId: number): DemoStep | undefined {
  return DEMO_STEPS.find((step) => step.id === stepId)
}
