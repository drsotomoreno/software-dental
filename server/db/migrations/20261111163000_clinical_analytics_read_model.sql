-- Read Model CQRS para analítica / BI / RIPS agregados.
-- Se alimenta en background desde el push del snapshot JSON (clinical-sync).
-- No sustituye app_json_store ni el cuerpo clínico firmado (Res. 1995/1999).
-- Idempotente: se puede reejecutar sobre AWS RDS.

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
    WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
        RAISE NOTICE 'pgcrypto no disponible; se usa gen_random_uuid() del núcleo de PostgreSQL';
END
$$;

-- ---------------------------------------------------------------------------
-- Pacientes indexados (demografía básica por syncId de Dexie)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idx_pacientes (
    clinic_id TEXT NOT NULL,
    patient_sync_id TEXT NOT NULL,
    document_type TEXT,
    document_number TEXT,
    first_name TEXT,
    last_name TEXT,
    birth_date DATE,
    gender TEXT,
    email TEXT,
    phone TEXT,
    municipality_code TEXT,
    regime TEXT,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    indexed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clinic_id, patient_sync_id)
);

CREATE INDEX IF NOT EXISTS idx_pacientes_clinic_doc
    ON idx_pacientes (clinic_id, document_type, document_number);

CREATE INDEX IF NOT EXISTS idx_pacientes_clinic_updated
    ON idx_pacientes (clinic_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Evoluciones / encuentros (una fila por nota de evolución o encuentro)
-- Llave compuesta: patient_sync_id + encounter_id (por clínica)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idx_evoluciones (
    clinic_id TEXT NOT NULL,
    patient_sync_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    clinical_record_sync_id TEXT,
    fecha TIMESTAMP WITH TIME ZONE,
    profesional_id TEXT,
    profesional_nombre TEXT,
    estado_firma TEXT NOT NULL DEFAULT 'borrador',
    firmado_en TIMESTAMP WITH TIME ZONE,
    costo NUMERIC(14, 2),
    is_billable BOOLEAN,
    cups_principal TEXT,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    indexed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clinic_id, patient_sync_id, encounter_id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_idx_evoluciones_estado_firma'
    ) THEN
        ALTER TABLE idx_evoluciones
            ADD CONSTRAINT ck_idx_evoluciones_estado_firma
            CHECK (estado_firma IN ('borrador', 'firmada'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_evoluciones_clinic_fecha
    ON idx_evoluciones (clinic_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_evoluciones_clinic_profesional
    ON idx_evoluciones (clinic_id, profesional_id);

CREATE INDEX IF NOT EXISTS idx_evoluciones_clinic_firma
    ON idx_evoluciones (clinic_id, estado_firma);

-- ---------------------------------------------------------------------------
-- Diagnósticos CIE-10 vinculados a una evolución / encuentro
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idx_diagnosticos (
    clinic_id TEXT NOT NULL,
    patient_sync_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    cie10_code TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'principal',
    description TEXT,
    source TEXT NOT NULL DEFAULT 'evolution',
    clinical_record_sync_id TEXT,
    indexed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clinic_id, patient_sync_id, encounter_id, cie10_code, tipo)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_idx_diagnosticos_tipo'
    ) THEN
        ALTER TABLE idx_diagnosticos
            ADD CONSTRAINT ck_idx_diagnosticos_tipo
            CHECK (tipo IN ('principal', 'relacionado'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_diagnosticos_clinic_cie10
    ON idx_diagnosticos (clinic_id, cie10_code);

CREATE INDEX IF NOT EXISTS idx_diagnosticos_encounter
    ON idx_diagnosticos (clinic_id, patient_sync_id, encounter_id);

-- ---------------------------------------------------------------------------
-- Procedimientos CUPS / líneas financieras (evolución, presupuesto o factura)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idx_procedimientos (
    clinic_id TEXT NOT NULL,
    patient_sync_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    procedure_sync_id TEXT NOT NULL,
    cups_code TEXT,
    description TEXT,
    valor_financiero NUMERIC(14, 2) NOT NULL DEFAULT 0,
    invoice_id TEXT,
    invoice_number TEXT,
    source TEXT NOT NULL DEFAULT 'evolution',
    clinical_record_sync_id TEXT,
    is_billable BOOLEAN,
    indexed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clinic_id, patient_sync_id, encounter_id, procedure_sync_id)
);

CREATE INDEX IF NOT EXISTS idx_procedimientos_clinic_cups
    ON idx_procedimientos (clinic_id, cups_code);

CREATE INDEX IF NOT EXISTS idx_procedimientos_clinic_invoice
    ON idx_procedimientos (clinic_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_procedimientos_encounter
    ON idx_procedimientos (clinic_id, patient_sync_id, encounter_id);

COMMENT ON TABLE idx_pacientes IS
    'Read model demográfico. Fuente: push clinical-sync (app_json_store).';
COMMENT ON TABLE idx_evoluciones IS
    'Read model de encuentros/evoluciones para BI y RIPS agregados.';
COMMENT ON TABLE idx_diagnosticos IS
    'CIE-10 proyectados desde evolutionNotes / diagnoses del snapshot.';
COMMENT ON TABLE idx_procedimientos IS
    'CUPS y valores financieros proyectados desde evoluciones, presupuesto y facturas embebidas.';
