-- Auditoría de cada radicación RIPS ante el MUV/SISPRO.
-- Conserva el payload enviado, la respuesta del ministerio, el CUV o los
-- errores, la fecha y el usuario prestador. No guarda el cuerpo clínico firmado.
-- Idempotente: se puede reejecutar sobre AWS RDS.

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
    WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
        RAISE NOTICE 'pgcrypto no disponible; se usa gen_random_uuid() del núcleo de PostgreSQL';
END
$$;

CREATE TABLE IF NOT EXISTS rips_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    usuario_prestador JSONB NOT NULL DEFAULT '{}'::jsonb,
    usuario_prestador_id TEXT,
    nit_prestador TEXT,
    evolution_id TEXT,
    patient_id TEXT,
    batch_id UUID,
    modo TEXT NOT NULL,
    canal TEXT NOT NULL,
    http_status INTEGER,
    cuv TEXT,
    success BOOLEAN,
    request_payload JSONB,
    response_muv JSONB,
    errors JSONB,
    duration_ms INTEGER
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_rips_logs_modo'
    ) THEN
        ALTER TABLE rips_logs
            ADD CONSTRAINT ck_rips_logs_modo
            CHECK (modo IN ('single', 'batch'));
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_rips_logs_canal'
    ) THEN
        ALTER TABLE rips_logs
            ADD CONSTRAINT ck_rips_logs_canal
            CHECK (canal IN ('fev', 'sin_factura'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_rips_logs_created_at ON rips_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rips_logs_evolution_id ON rips_logs (evolution_id);
CREATE INDEX IF NOT EXISTS idx_rips_logs_usuario_prestador_id ON rips_logs (usuario_prestador_id);
CREATE INDEX IF NOT EXISTS idx_rips_logs_batch_id ON rips_logs (batch_id);

COMMENT ON TABLE rips_logs IS
    'Transacción completa de un envío RIPS al MUV: solicitud, respuesta, CUV o errores.';
COMMENT ON COLUMN rips_logs.usuario_prestador IS
    'Identidad del prestador en sesión (id, email, documento, NIT, nombre). Sin clave SISPRO.';
COMMENT ON COLUMN rips_logs.request_payload IS
    'JSON RIPS enviado. El XML FEV largo se omite y queda solo su tamaño.';
COMMENT ON COLUMN rips_logs.response_muv IS
    'Cuerpo devuelto por CargarFevRips o CargarRipsSinFactura.';
COMMENT ON COLUMN rips_logs.cuv IS
    'Código Único de Validación cuando el ministerio acepta el paquete.';
COMMENT ON COLUMN rips_logs.canal IS
    'fev cuando hay CUFE o XML; sin_factura en caso contrario.';
