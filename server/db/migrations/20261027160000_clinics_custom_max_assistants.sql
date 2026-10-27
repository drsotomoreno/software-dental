-- Límite manual de auxiliares, exclusivo del plan corporativo.
-- La aplicación solo lo aplica si el titular tiene plan = corporativo.
-- NULL no impone tope adicional. Nomad, Smart y BioniC ignoran la columna.
-- clinics.id es el id del titular de la clínica.
-- Idempotente: se puede reejecutar sobre AWS RDS.

CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE clinics
    ADD COLUMN IF NOT EXISTS custom_max_assistants INT DEFAULT NULL;

COMMENT ON COLUMN clinics.custom_max_assistants IS
    'Tope manual de auxiliares (rol recepcion). Solo lo aplica el plan corporativo. NULL = sin tope manual.';
