export type EdentulousRehabilitationCategory =
  | 'overdenture'
  | 'fixed_prosthesis'
  | 'extreme_atrophy'
  | ''

export type OverdentureSubtype = 'mandibular_2_implants' | 'maxillary_4_implants' | ''

export type OverdentureAttachment = 'locator' | 'or_ring_sphere' | 'connection_bar' | ''

export type FixedProsthesisSubtype = 'hybrid_all_on' | 'circumferential_bridge' | ''

export type HybridVariant = 'all_on_4' | 'all_on_6' | 'pro_arch' | ''

export type HybridStructureMaterial = 'acrylic_metal' | 'monolithic_zirconia' | ''

export type CircumferentialBridgeImplants = '6_axial' | '8_axial' | ''

export type BridgeRestorationMaterial = 'ceramic_crowns' | 'segmented_zirconia' | ''

export type ExtremeAtrophySubtype = 'zygomatic_pterygoid' | 'subperiosteal_3d' | ''

export type LoadingProtocol = 'immediate' | 'conventional_deferred' | ''

export type EdentulousArchKey = 'maxilla' | 'mandible'

export interface ArchRehabilitationSelection {
  category: EdentulousRehabilitationCategory
  overdenture: {
    subtype: OverdentureSubtype
    attachment: OverdentureAttachment
    maxillaryBarPalateRelief: boolean
  }
  fixedProsthesis: {
    subtype: FixedProsthesisSubtype
    hybridVariant: HybridVariant
    hybridMaterial: HybridStructureMaterial
    angledPosteriorImplants: boolean
    bridgeImplantCount: CircumferentialBridgeImplants
    bridgeMaterial: BridgeRestorationMaterial
  }
  extremeAtrophy: {
    subtype: ExtremeAtrophySubtype
  }
  loadingProtocol: LoadingProtocol
  notes: string
}

export interface EdentulousRehabilitationPlan {
  maxilla: ArchRehabilitationSelection
  mandible: ArchRehabilitationSelection
}

export const EDENTULOUS_ARCH_LABELS: Record<EdentulousArchKey, string> = {
  maxilla: 'Maxilar Superior',
  mandible: 'Mandíbula',
}

export const REHABILITATION_CATEGORY_OPTIONS = [
  {
    id: 'overdenture' as const,
    label: 'Sobredentaduras sobre Implantes (Removibles)',
    description: 'Prótesis removibles apoyadas en mucosa y retenidas por implantes.',
  },
  {
    id: 'fixed_prosthesis' as const,
    label: 'Prótesis Fijas sobre Implantes',
    description: 'Restauraciones no removibles atornilladas o cementadas.',
  },
  {
    id: 'extreme_atrophy' as const,
    label: 'Atrofia Ósea Extrema (Sin Injertos Mayores)',
    description: 'Opciones avanzadas de anclaje sin injertos óseos mayores.',
  },
]

export const OVERDENTURE_SUBTYPE_OPTIONS = [
  {
    id: 'mandibular_2_implants' as const,
    arch: 'mandible' as const,
    label: 'Sobredentadura mandibular con 2 implantes',
    description: 'Estándar de oro funcional para mandíbula edéntula.',
  },
  {
    id: 'maxillary_4_implants' as const,
    arch: 'maxilla' as const,
    label: 'Sobredentadura maxilar con 4 implantes',
    description: 'Retención mejorada con opción de barra y liberación de paladar.',
  },
]

export const OVERDENTURE_ATTACHMENT_OPTIONS = [
  { id: 'locator' as const, label: 'Locator' },
  { id: 'or_ring_sphere' as const, label: 'Esferas O-ring' },
  { id: 'connection_bar' as const, label: 'Barra de unión' },
]

export const HYBRID_VARIANT_OPTIONS = [
  { id: 'all_on_4' as const, label: 'All-on-4' },
  { id: 'all_on_6' as const, label: 'All-on-6' },
  { id: 'pro_arch' as const, label: 'Pro-Arch' },
]

export const HYBRID_MATERIAL_OPTIONS = [
  { id: 'acrylic_metal' as const, label: 'Acrílico reforzado sobre metal' },
  { id: 'monolithic_zirconia' as const, label: 'Zirconia monolítica' },
]

export const BRIDGE_IMPLANT_COUNT_OPTIONS = [
  { id: '6_axial' as const, label: '6 implantes axiales' },
  { id: '8_axial' as const, label: '8 implantes axiales' },
]

export const BRIDGE_MATERIAL_OPTIONS = [
  { id: 'ceramic_crowns' as const, label: 'Coronas cerámicas' },
  { id: 'segmented_zirconia' as const, label: 'Puentes segmentados de zirconia' },
]

export const EXTREME_ATROPHY_OPTIONS = [
  {
    id: 'zygomatic_pterygoid' as const,
    label: 'Implantes cigomáticos y pterigoideos',
    description: 'Anclaje en hueso cigomático o región pterigoidea.',
  },
  {
    id: 'subperiosteal_3d' as const,
    label: 'Implantes subperiósticos personalizados (3D)',
    description: 'Mallas de titanio CAD/CAM.',
  },
]

export const LOADING_PROTOCOL_OPTIONS = [
  {
    id: 'immediate' as const,
    label: 'Carga inmediata',
    description: 'Prótesis fija provisional en 24-48 horas.',
  },
  {
    id: 'conventional_deferred' as const,
    label: 'Carga convencional o diferida',
    description: 'Periodo de cicatrización de 3 a 6 meses.',
  },
]

export function createEmptyArchRehabilitationSelection(): ArchRehabilitationSelection {
  return {
    category: '',
    overdenture: {
      subtype: '',
      attachment: '',
      maxillaryBarPalateRelief: false,
    },
    fixedProsthesis: {
      subtype: '',
      hybridVariant: '',
      hybridMaterial: '',
      angledPosteriorImplants: false,
      bridgeImplantCount: '',
      bridgeMaterial: '',
    },
    extremeAtrophy: {
      subtype: '',
    },
    loadingProtocol: '',
    notes: '',
  }
}

export function createEmptyEdentulousRehabilitationPlan(): EdentulousRehabilitationPlan {
  return {
    maxilla: createEmptyArchRehabilitationSelection(),
    mandible: createEmptyArchRehabilitationSelection(),
  }
}

function isValidOption<T extends string>(value: unknown, options: { id: T }[]): value is T {
  return options.some((item) => item.id === value)
}

function normalizeArchSelection(data?: Partial<ArchRehabilitationSelection>): ArchRehabilitationSelection {
  const empty = createEmptyArchRehabilitationSelection()
  const category = isValidOption(data?.category, REHABILITATION_CATEGORY_OPTIONS)
    ? data.category
    : ''

  return {
    category,
    overdenture: {
      subtype: isValidOption(data?.overdenture?.subtype, OVERDENTURE_SUBTYPE_OPTIONS)
        ? data.overdenture.subtype
        : '',
      attachment: isValidOption(data?.overdenture?.attachment, OVERDENTURE_ATTACHMENT_OPTIONS)
        ? data.overdenture.attachment
        : '',
      maxillaryBarPalateRelief: Boolean(data?.overdenture?.maxillaryBarPalateRelief),
    },
    fixedProsthesis: {
      subtype:
        data?.fixedProsthesis?.subtype === 'hybrid_all_on' ||
        data?.fixedProsthesis?.subtype === 'circumferential_bridge'
          ? data.fixedProsthesis.subtype
          : '',
      hybridVariant: isValidOption(data?.fixedProsthesis?.hybridVariant, HYBRID_VARIANT_OPTIONS)
        ? data.fixedProsthesis.hybridVariant
        : '',
      hybridMaterial: isValidOption(data?.fixedProsthesis?.hybridMaterial, HYBRID_MATERIAL_OPTIONS)
        ? data.fixedProsthesis.hybridMaterial
        : '',
      angledPosteriorImplants: Boolean(data?.fixedProsthesis?.angledPosteriorImplants),
      bridgeImplantCount: isValidOption(
        data?.fixedProsthesis?.bridgeImplantCount,
        BRIDGE_IMPLANT_COUNT_OPTIONS,
      )
        ? data.fixedProsthesis.bridgeImplantCount
        : '',
      bridgeMaterial: isValidOption(data?.fixedProsthesis?.bridgeMaterial, BRIDGE_MATERIAL_OPTIONS)
        ? data.fixedProsthesis.bridgeMaterial
        : '',
    },
    extremeAtrophy: {
      subtype: isValidOption(data?.extremeAtrophy?.subtype, EXTREME_ATROPHY_OPTIONS)
        ? data.extremeAtrophy.subtype
        : '',
    },
    loadingProtocol: isValidOption(data?.loadingProtocol, LOADING_PROTOCOL_OPTIONS)
      ? data.loadingProtocol
      : '',
    notes: typeof data?.notes === 'string' ? data.notes : empty.notes,
  }
}

export function normalizeEdentulousRehabilitationPlan(
  data?: Partial<EdentulousRehabilitationPlan>,
): EdentulousRehabilitationPlan {
  return {
    maxilla: normalizeArchSelection(data?.maxilla),
    mandible: normalizeArchSelection(data?.mandible),
  }
}

function labelFromOptions<T extends string>(
  value: T | '',
  options: { id: T; label: string }[],
): string {
  if (!value) return ''
  return options.find((item) => item.id === value)?.label ?? value
}

export interface ArchRehabilitationSummaryDetails {
  hasContent: boolean
  categoryLabel: string
  details: string[]
}

export function getArchRehabilitationSummaryDetails(
  selection: ArchRehabilitationSelection,
): ArchRehabilitationSummaryDetails {
  const details: string[] = []

  if (selection.category === 'overdenture') {
    const subtype = OVERDENTURE_SUBTYPE_OPTIONS.find((item) => item.id === selection.overdenture.subtype)
    if (subtype) details.push(subtype.label)
    const attachment = labelFromOptions(selection.overdenture.attachment, OVERDENTURE_ATTACHMENT_OPTIONS)
    if (attachment) details.push(`Atache: ${attachment}`)
    if (selection.overdenture.maxillaryBarPalateRelief) {
      details.push('Barra de unión y liberación de paladar')
    }
  }

  if (selection.category === 'fixed_prosthesis') {
    if (selection.fixedProsthesis.subtype === 'hybrid_all_on') {
      details.push('Prótesis híbrida')
      const variant = labelFromOptions(selection.fixedProsthesis.hybridVariant, HYBRID_VARIANT_OPTIONS)
      if (variant) details.push(variant)
      const material = labelFromOptions(selection.fixedProsthesis.hybridMaterial, HYBRID_MATERIAL_OPTIONS)
      if (material) details.push(`Estructura: ${material}`)
      if (selection.fixedProsthesis.angledPosteriorImplants) {
        details.push('Implantes posteriores angulados')
      }
    }
    if (selection.fixedProsthesis.subtype === 'circumferential_bridge') {
      details.push('Puente fijo circunferencial')
      const count = labelFromOptions(
        selection.fixedProsthesis.bridgeImplantCount,
        BRIDGE_IMPLANT_COUNT_OPTIONS,
      )
      if (count) details.push(count)
      const material = labelFromOptions(selection.fixedProsthesis.bridgeMaterial, BRIDGE_MATERIAL_OPTIONS)
      if (material) details.push(`Restauración: ${material}`)
    }
  }

  if (selection.category === 'extreme_atrophy') {
    const subtype = EXTREME_ATROPHY_OPTIONS.find((item) => item.id === selection.extremeAtrophy.subtype)
    if (subtype) details.push(subtype.label)
  }

  const loading = labelFromOptions(selection.loadingProtocol, LOADING_PROTOCOL_OPTIONS)
  if (loading) details.push(`Protocolo de carga: ${loading}`)
  if (selection.notes.trim()) details.push(selection.notes.trim())

  const category = REHABILITATION_CATEGORY_OPTIONS.find((item) => item.id === selection.category)

  return {
    hasContent: Boolean(category) || details.length > 0,
    categoryLabel: category?.label ?? '',
    details,
  }
}

function formatArchRehabilitationSummary(
  archLabel: string,
  selection: ArchRehabilitationSelection,
): string {
  const summary = getArchRehabilitationSummaryDetails(selection)
  if (!summary.hasContent) return ''

  const parts = [summary.categoryLabel, ...summary.details].filter(Boolean)
  return parts.length > 0 ? `${archLabel}: ${parts.join(' · ')}` : ''
}

export function formatEdentulousRehabilitationPlanSummary(plan: EdentulousRehabilitationPlan): string {
  const lines = [
    formatArchRehabilitationSummary(EDENTULOUS_ARCH_LABELS.maxilla, plan.maxilla),
    formatArchRehabilitationSummary(EDENTULOUS_ARCH_LABELS.mandible, plan.mandible),
  ].filter(Boolean)

  return lines.length > 0 ? `Rehabilitación edéntula: ${lines.join(' | ')}` : ''
}
