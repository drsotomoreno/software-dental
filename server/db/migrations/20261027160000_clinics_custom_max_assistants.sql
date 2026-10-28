-- Topes manuales del plan corporativo.
-- custom_max_assistants cuenta auxiliares. custom_max_rethus cuenta profesionales ReTHUS.
-- En Corporativo un NULL se trata como 0. Nomad, Smart y BioniC usan el catálogo.
-- clinics.id es el id del titular de la clínica.
-- Idempotente: se puede reejecutar sobre AWS RDS.

CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE clinics
    ADD COLUMN IF NOT EXISTS custom_max_assistants INT DEFAULT NULL;

ALTER TABLE clinics
    ADD COLUMN IF NOT EXISTS custom_max_rethus INT DEFAULT NULL;

COMMENT ON COLUMN clinics.custom_max_assistants IS
    'Tope manual de auxiliares (rol recepcion). Solo lo aplica el plan corporativo. NULL se trata como 0.';

COMMENT ON COLUMN clinics.custom_max_rethus IS
    'Tope manual de profesionales ReTHUS. Solo lo aplica el plan corporativo. NULL se trata como 0.';
