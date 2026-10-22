-- Fase 1 — Consecutivos de cobro interno (RC-) y vínculo de la atención con el pago.
-- Cada usuario titular controla en forma atómica su consecutivo (RECIBO_CAJA | CUENTA_COBRO).
-- La atención registrada en la evolución clínica (Sección 11) puede apuntar a un recibo
-- o quedar como atención sin costo / pendiente de pago.
-- Idempotente: se puede reejecutar sobre AWS RDS.

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
    WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
        RAISE NOTICE 'pgcrypto no disponible; se usa gen_random_uuid() del núcleo de PostgreSQL';
END
$$;

-- Titular dueño del consecutivo. Si la tabla ya existe en RDS, no se toca.
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Recibo de caja / cuenta de cobro. Las columnas se reaseguran por si la tabla ya existía.
CREATE TABLE IF NOT EXISTS recibos_caja (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_titular_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo_documento VARCHAR(50) NOT NULL,
    consecutivo INT NOT NULL,
    prefijo VARCHAR(10) NOT NULL DEFAULT 'RC-',
    numero_soporte VARCHAR(50),
    concepto TEXT,
    valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE recibos_caja ADD COLUMN IF NOT EXISTS usuario_titular_id UUID;
ALTER TABLE recibos_caja ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(50);
ALTER TABLE recibos_caja ADD COLUMN IF NOT EXISTS consecutivo INT;
ALTER TABLE recibos_caja ADD COLUMN IF NOT EXISTS prefijo VARCHAR(10) DEFAULT 'RC-';
ALTER TABLE recibos_caja ADD COLUMN IF NOT EXISTS numero_soporte VARCHAR(50);
ALTER TABLE recibos_caja ADD COLUMN IF NOT EXISTS concepto TEXT;
ALTER TABLE recibos_caja ADD COLUMN IF NOT EXISTS valor NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE recibos_caja ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Atención clínica. Las columnas de pago se agregan en el ALTER de la Sección 11.
CREATE TABLE IF NOT EXISTS atenciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE atenciones ADD COLUMN IF NOT EXISTS evolution_note_id TEXT;
ALTER TABLE atenciones ADD COLUMN IF NOT EXISTS clinical_record_id TEXT;
ALTER TABLE atenciones ADD COLUMN IF NOT EXISTS usuario_titular_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE atenciones ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE atenciones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 1. Tabla de control atómico de consecutivos por prestador
CREATE TABLE IF NOT EXISTS consecutivos_prestador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_titular_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo_documento VARCHAR(50) NOT NULL, -- 'RECIBO_CAJA' | 'CUENTA_COBRO'
    prefijo VARCHAR(10) NOT NULL DEFAULT 'RC-',
    ultimo_consecutivo INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_usuario_tipo_doc UNIQUE (usuario_titular_id, tipo_documento)
);

ALTER TABLE consecutivos_prestador ADD COLUMN IF NOT EXISTS usuario_titular_id UUID;
ALTER TABLE consecutivos_prestador ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(50);
ALTER TABLE consecutivos_prestador ADD COLUMN IF NOT EXISTS prefijo VARCHAR(10) DEFAULT 'RC-';
ALTER TABLE consecutivos_prestador ADD COLUMN IF NOT EXISTS ultimo_consecutivo INT DEFAULT 0;
ALTER TABLE consecutivos_prestador ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_usuario_tipo_doc'
    ) THEN
        ALTER TABLE consecutivos_prestador
            ADD CONSTRAINT uq_usuario_tipo_doc
            UNIQUE (usuario_titular_id, tipo_documento);
    END IF;
END
$$;

-- 2. Asegurar la unicidad de consecutivos en recibos de caja por titular
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_recibo_titular_consecutivo'
    ) THEN
        ALTER TABLE recibos_caja
            ADD CONSTRAINT uq_recibo_titular_consecutivo
            UNIQUE (usuario_titular_id, tipo_documento, consecutivo);
    END IF;
END
$$;

-- 3. Extensión de la tabla de atenciones (Módulo de Evolución Clínica - Sección 11)
ALTER TABLE atenciones
    ADD COLUMN IF NOT EXISTS pago_id UUID REFERENCES recibos_caja(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS numero_soporte_pago VARCHAR(50),
    ADD COLUMN IF NOT EXISTS concepto_pago TEXT,
    ADD COLUMN IF NOT EXISTS valor_procedimiento NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estado_rips VARCHAR(30) DEFAULT 'PENDIENTE_PAGO';

CREATE INDEX IF NOT EXISTS idx_atenciones_pago_id ON atenciones (pago_id);
CREATE INDEX IF NOT EXISTS idx_atenciones_estado_rips ON atenciones (estado_rips);
CREATE INDEX IF NOT EXISTS idx_atenciones_clinical_record ON atenciones (clinical_record_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_atenciones_evolution_note
    ON atenciones (evolution_note_id)
    WHERE evolution_note_id IS NOT NULL AND btrim(evolution_note_id) <> '';

-- Si se borra el recibo, el pago queda en NULL. Una atención que figuraba pagada
-- vuelve a pendiente de pago; sin costo y pendiente explícito no se pisan.
CREATE OR REPLACE FUNCTION sync_estado_rips_sin_pago()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.pago_id IS NULL
       AND OLD.pago_id IS NOT NULL
       AND NEW.estado_rips = 'PAGADO' THEN
        NEW.estado_rips := 'PENDIENTE_PAGO';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atenciones_pago_estado ON atenciones;
CREATE TRIGGER trg_atenciones_pago_estado
    BEFORE UPDATE OF pago_id, estado_rips ON atenciones
    FOR EACH ROW
    EXECUTE PROCEDURE sync_estado_rips_sin_pago();

-- Reserva atómica del siguiente consecutivo del titular.
-- Quien emita el recibo debe insertarlo en la misma transacción: si esa
-- transacción revierte, el incremento también revierte y no queda un hueco.
CREATE OR REPLACE FUNCTION reservar_consecutivo_prestador(
    p_usuario_titular_id UUID,
    p_tipo_documento VARCHAR,
    p_prefijo VARCHAR DEFAULT 'RC-'
) RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_consecutivo INT;
BEGIN
    IF p_usuario_titular_id IS NULL THEN
        RAISE EXCEPTION 'usuario_titular_id es obligatorio';
    END IF;
    IF p_tipo_documento IS NULL OR btrim(p_tipo_documento) = '' THEN
        RAISE EXCEPTION 'tipo_documento es obligatorio';
    END IF;

    INSERT INTO consecutivos_prestador (
        usuario_titular_id,
        tipo_documento,
        prefijo,
        ultimo_consecutivo,
        updated_at
    ) VALUES (
        p_usuario_titular_id,
        btrim(p_tipo_documento),
        COALESCE(NULLIF(btrim(p_prefijo), ''), 'RC-'),
        1,
        NOW()
    )
    ON CONFLICT (usuario_titular_id, tipo_documento)
    DO UPDATE SET
        ultimo_consecutivo = consecutivos_prestador.ultimo_consecutivo + 1,
        prefijo = COALESCE(NULLIF(btrim(EXCLUDED.prefijo), ''), consecutivos_prestador.prefijo),
        updated_at = NOW()
    RETURNING ultimo_consecutivo INTO v_consecutivo;

    RETURN v_consecutivo;
END;
$$;
