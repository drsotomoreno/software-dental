import type { ToothFace, ToothFaceState, AnyToothNumber } from '@/types/odontogram'
import {
  TOOTH_FACE_STATE_LABELS,
  TOOTH_FACE_STATE_STYLES,
  getFaceAbbrev,
} from '@/types/odontogram'

interface ToothFaceSelectorProps {
  face: ToothFace
  toothNumber: AnyToothNumber
  state: ToothFaceState
  activeTool: ToothFaceState
  onChange: (state: ToothFaceState) => void
  disabled?: boolean
  toothAbsent?: boolean
}

const FACE_GRID_POSITION: Record<ToothFace, string> = {
  vestibular: 'col-start-2 row-start-1',
  mesial: 'col-start-1 row-start-2',
  oclusal: 'col-start-2 row-start-2',
  distal: 'col-start-3 row-start-2',
  lingual: 'col-start-2 row-start-3',
}

export function ToothFaceSelector({
  face,
  toothNumber,
  state,
  activeTool,
  onChange,
  disabled = false,
  toothAbsent = false,
}: ToothFaceSelectorProps) {
  const abbrev = getFaceAbbrev(face, toothNumber)
  const style = TOOTH_FACE_STATE_STYLES[state]
  const isActiveTool = activeTool !== 'sano' && state === activeTool

  const handleClick = () => {
    if (disabled || toothAbsent) return
    onChange(activeTool)
  }

  return (
    <button
      type="button"
      title={`${TOOTH_FACE_STATE_LABELS[state]} — ${abbrev}`}
      disabled={disabled || toothAbsent}
      onClick={handleClick}
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        color: style.text,
      }}
      className={`relative flex h-6 w-6 items-center justify-center rounded-sm border-2 text-[8px] font-bold leading-none transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 ${FACE_GRID_POSITION[face]} ${isActiveTool ? 'ring-2 ring-dental-500 ring-offset-1' : ''}`}
      aria-label={`${abbrev} — ${TOOTH_FACE_STATE_LABELS[state]}`}
    >
      {abbrev}
    </button>
  )
}
