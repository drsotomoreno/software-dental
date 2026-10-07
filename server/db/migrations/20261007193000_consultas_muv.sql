-- Consultas / atenciones de mihistoriadental.
-- Agrega el CUV del MUV, el estado de radicación y el detalle de validación.
-- Idempotente: crea la tabla si no existe y añade las columnas si ya existía.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_muv') THEN
    CREATE TYPE estado_muv AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS consultas (
  id text PRIMARY KEY,
  clinic_id text,
  patient_id text,
  professional_id text,
  clinical_record_id text,
  cuv text,
  estado_muv estado_muv NOT NULL DEFAULT 'PENDIENTE',
  resultado_validacion jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE consultas ADD COLUMN IF NOT EXISTS cuv text;
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS resultado_validacion jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'consultas'
      AND column_name = 'estado_muv'
  ) THEN
    ALTER TABLE consultas
      ADD COLUMN estado_muv estado_muv NOT NULL DEFAULT 'PENDIENTE';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_consultas_estado_muv ON consultas (estado_muv);
CREATE INDEX IF NOT EXISTS idx_consultas_clinical_record ON consultas (clinical_record_id);
