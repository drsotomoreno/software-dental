/**
 * Símbolo internacional de diente ausente (exodoncia, agenesia, traumatismo).
 * Equis grande que cruza completamente la estructura anatómica del diente.
 */
interface AbsentToothSymbolProps {
  size?: number
  /** Ausencia ya establecida → azul/negro; pendiente de extraer → rojo */
  variant?: 'establecida' | 'pendiente'
  className?: string
}

export function AbsentToothSymbol({
  size = 80,
  variant = 'establecida',
  className = '',
}: AbsentToothSymbolProps) {
  const strokeColor = variant === 'establecida' ? '#1e3a8a' : '#b91c1c'
  const strokeWidth = size * 0.045

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      className={className}
      role="img"
      aria-label={variant === 'establecida' ? 'Diente ausente' : 'Exodoncia indicada'}
    >
      {/* Contorno anatómico fantasma (5 superficies) */}
      <rect
        x="4"
        y="4"
        width="72"
        height="72"
        rx="3"
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth="1"
      />
      {/* Líneas de división de superficies — estructura anatómica */}
      <line x1="28" y1="4" x2="28" y2="76" stroke="#e2e8f0" strokeWidth="0.75" />
      <line x1="52" y1="4" x2="52" y2="76" stroke="#e2e8f0" strokeWidth="0.75" />
      <line x1="4" y1="28" x2="76" y2="28" stroke="#e2e8f0" strokeWidth="0.75" />
      <line x1="4" y1="52" x2="76" y2="52" stroke="#e2e8f0" strokeWidth="0.75" />

      {/* Equis universal — diagonal principal */}
      <line
        x1="2"
        y1="2"
        x2="78"
        y2="78"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1="78"
        y1="2"
        x2="2"
        y2="78"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** X compacta para superponer sobre el número FDI */
export function AbsentToothNumberMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      aria-hidden
    >
      <svg width="14" height="14" viewBox="0 0 14 14" className="absolute inset-0 m-auto">
        <line x1="1" y1="1" x2="13" y2="13" stroke="#1e3a8a" strokeWidth="2" strokeLinecap="round" />
        <line x1="13" y1="1" x2="1" y2="13" stroke="#1e3a8a" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  )
}
