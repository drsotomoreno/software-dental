import type { CrowdingSpacingValue } from '@/types/orthodonticsAnnex'
import QuadrantMmGridInput from './QuadrantMmGridInput'

export interface CrowdingSpacingInputProps {
  value: CrowdingSpacingValue
  onChange: (value: CrowdingSpacingValue) => void
  disabled?: boolean
}

export default function CrowdingSpacingInput({
  value,
  onChange,
  disabled = false,
}: CrowdingSpacingInputProps) {
  return (
    <QuadrantMmGridInput
      title="Apiñamiento / Espaciamiento"
      description="Registre la discrepancia de espacio por cuadrante en milímetros."
      footerLabel="Apiñamiento"
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
