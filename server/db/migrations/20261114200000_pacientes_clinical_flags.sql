-- Flags clínicas de listado (Valorados / Activos / Terminados).
-- Antes solo vivían en clinical-sync.json; el espejo demográfico las perdía.
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS valuation_only BOOLEAN;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS phase TEXT;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS treatment_completed BOOLEAN;

COMMENT ON COLUMN pacientes.valuation_only IS 'Espejo de payload.valuationOnly (solo valoración rápida).';
COMMENT ON COLUMN pacientes.phase IS 'Espejo de payload.phase (VALORACION_RAPIDA | TRATAMIENTO_ACEPTADO).';
COMMENT ON COLUMN pacientes.treatment_completed IS 'Espejo de payload.treatmentCompleted.';
