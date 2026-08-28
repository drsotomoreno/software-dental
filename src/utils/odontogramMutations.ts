import {
  createDefaultTooth,
  ensureOdontogramTeeth,
  getLowerTeethForDentition,
  getUpperTeethForDentition,
  applyToothGlobalState,
  normalizeToothRecord,
  type AnyToothNumber,
  type EdentulismScope,
  type OdontogramData,
  type ToothFace,
  type ToothFaceState,
  type ToothGlobalState,
} from '@/types/odontogram'

const ALL_FACES: ToothFace[] = ['vestibular', 'mesial', 'oclusal', 'distal', 'lingual']

export function applyFaceState(
  data: OdontogramData,
  number: AnyToothNumber,
  face: ToothFace,
  state: ToothFaceState,
): OdontogramData {
  const normalized = ensureOdontogramTeeth(data)
  const defaultTooth = createDefaultTooth(number)
  const teeth = normalized.teeth.some((t) => t.number === number)
    ? normalized.teeth.map((t) =>
        t.number === number
          ? normalizeToothRecord({ ...t, faces: { ...t.faces, [face]: state } })
          : normalizeToothRecord(t),
      )
    : [
        ...normalized.teeth,
        {
          ...defaultTooth,
          faces: { ...defaultTooth.faces, [face]: state },
        },
      ]

  return {
    ...normalized,
    teeth,
    isInitialState: false,
    updatedAt: new Date().toISOString(),
  }
}

export function applyFaceStates(
  data: OdontogramData,
  number: AnyToothNumber,
  faces: ToothFace[],
  state: ToothFaceState,
): OdontogramData {
  return faces.reduce(
    (current, face) => applyFaceState(current, number, face, state),
    data,
  )
}

export function applyGlobalState(
  data: OdontogramData,
  number: AnyToothNumber,
  globalState: ToothGlobalState,
): OdontogramData {
  const normalized = ensureOdontogramTeeth(data)
  const defaultTooth = createDefaultTooth(number)
  const teeth = normalized.teeth.some((t) => t.number === number)
    ? normalized.teeth.map((t) =>
        t.number === number
          ? applyToothGlobalState(t, globalState)
          : normalizeToothRecord(t),
      )
    : [...normalized.teeth, applyToothGlobalState(defaultTooth, globalState)]

  return reconcileEdentulismScope({
    ...normalized,
    teeth,
    isInitialState: false,
    updatedAt: new Date().toISOString(),
  })
}

function getAffectedTeethForEdentulism(
  data: OdontogramData,
  scope: EdentulismScope,
): AnyToothNumber[] {
  const dentitionType = data.dentitionType ?? 'permanente'
  const upper = getUpperTeethForDentition(dentitionType)
  const lower = getLowerTeethForDentition(dentitionType)

  if (scope === 'total') return [...upper, ...lower]
  if (scope === 'superior') return upper
  return lower
}

export function reconcileEdentulismScope(data: OdontogramData): OdontogramData {
  const scope = data.edentulismScope
  if (!scope) return data

  const affected = new Set(getAffectedTeethForEdentulism(data, scope))
  const allAbsent = [...affected].every((number) => {
    const tooth = data.teeth.find((item) => item.number === number)
    return tooth?.globalState === 'ausente'
  })

  if (allAbsent) return data
  return { ...data, edentulismScope: null }
}

export function applyEdentulismScope(
  data: OdontogramData,
  scope: EdentulismScope | null,
): OdontogramData {
  const normalized = ensureOdontogramTeeth(data)

  if (!scope) {
    return {
      ...normalized,
      edentulismScope: null,
      updatedAt: new Date().toISOString(),
    }
  }

  const affected = new Set(getAffectedTeethForEdentulism(normalized, scope))
  const teeth = normalized.teeth.map((tooth) =>
    affected.has(tooth.number)
      ? applyToothGlobalState(tooth, 'ausente')
      : normalizeToothRecord(tooth),
  )

  return {
    ...normalized,
    edentulismScope: scope,
    teeth,
    isInitialState: false,
    updatedAt: new Date().toISOString(),
  }
}

export function getAllToothFaces(): ToothFace[] {
  return [...ALL_FACES]
}
