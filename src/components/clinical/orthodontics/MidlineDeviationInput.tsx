import type { MidlineDeviationValue } from '@/types/orthodonticsAnnex'
import QuadrantMmGridInput from './QuadrantMmGridInput'

export interface MidlineDeviationInputProps {
  value: MidlineDeviationValue
  onChange: (value: MidlineDeviationValue) => void
  disabled?: boolean
}

export default function MidlineDeviationInput({
  value,
  onChange,
  disabled = false,
}: MidlineDeviationInputProps) {
  return (
    <QuadrantMmGridInput
      title="Desviacion de Lineas Medias Dentales"
      description="Registre la desviación de las líneas medias dentales respecto a la línea media facial. Valores positivos o negativos en milímetros."
      footerLabel="Línea media facial"
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
