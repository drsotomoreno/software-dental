-- EMR v2 — esquema relacional ACID + inmutabilidad legal (Res. 1995/1999).
-- Idempotente: seguro re-ejecutar en AWS RDS. No DROP de tablas / TRUNCATE.

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'pgcrypto no disponible; se usa gen_random_uuid() del núcleo de PostgreSQL';
END $$;

-- 1. Pacientes v2 (multi-tenant TEXT clinica_id; bridge a syncId legacy)
CREATE TABLE IF NOT EXISTS emr_v2_patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id TEXT NOT NULL,
    legacy_sync_id TEXT,
    tipo_documento TEXT NOT NULL,
    numero_documento TEXT NOT NULL,
    nombre_completo TEXT NOT NULL,
    datos_demograficos JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT emr_v2_patients_doc_uq UNIQUE (clinica_id, tipo_documento, numero_documento),
    CONSTRAINT emr_v2_patients_legacy_sync_uq UNIQUE (clinica_id, legacy_sync_id)
);

CREATE INDEX IF NOT EXISTS emr_v2_patients_clinica_idx
    ON emr_v2_patients (clinica_id);

CREATE INDEX IF NOT EXISTS emr_v2_patients_clinica_doc_idx
    ON emr_v2_patients (clinica_id, numero_documento);

-- 2. Ficha clínica viva (secciones JSONB granulares + version optimista)
CREATE TABLE IF NOT EXISTS emr_v2_clinical_base (
    patient_id UUID PRIMARY KEY REFERENCES emr_v2_patients(id),
    clinica_id TEXT NOT NULL,
    anamnesis JSONB NOT NULL DEFAULT '{}'::jsonb,
    examen_estomatologico JSONB NOT NULL DEFAULT '{}'::jsonb,
    odontograma JSONB NOT NULL DEFAULT '{}'::jsonb,
    diagnosticos JSONB NOT NULL DEFAULT '[]'::jsonb,
    plan_tratamiento JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    content_hash TEXT NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emr_v2_clinical_base_clinica_patient_idx
    ON emr_v2_clinical_base (clinica_id, patient_id);

-- 3. Evoluciones append-only con bloqueo legal
CREATE TABLE IF NOT EXISTS emr_v2_evolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES emr_v2_patients(id),
    clinica_id TEXT NOT NULL,
    fecha_atencion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    profesional_id TEXT NOT NULL,
    profesional_nombre TEXT NOT NULL,
    rethus TEXT NOT NULL,
    contenido JSONB NOT NULL,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    seal_hash_sha256 TEXT,
    parent_evolution_id UUID REFERENCES emr_v2_evolutions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emr_v2_evolutions_patient_fecha_idx
    ON emr_v2_evolutions (patient_id, fecha_atencion DESC);

CREATE INDEX IF NOT EXISTS emr_v2_evolutions_clinica_patient_idx
    ON emr_v2_evolutions (clinica_id, patient_id);

CREATE INDEX IF NOT EXISTS emr_v2_evolutions_parent_idx
    ON emr_v2_evolutions (parent_evolution_id)
    WHERE parent_evolution_id IS NOT NULL;

-- 4. Bitácora forense encadenada (hash-chain)
CREATE TABLE IF NOT EXISTS emr_v2_forensic_audit_trail (
    seq BIGSERIAL PRIMARY KEY,
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    clinica_id TEXT NOT NULL,
    patient_id UUID,
    entity_table TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_email TEXT,
    actor_rethus TEXT,
    before_state JSONB,
    after_state JSONB,
    prev_chain_hash TEXT NOT NULL,
    chain_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emr_v2_forensic_audit_clinica_created_idx
    ON emr_v2_forensic_audit_trail (clinica_id, created_at DESC);

CREATE INDEX IF NOT EXISTS emr_v2_forensic_audit_patient_idx
    ON emr_v2_forensic_audit_trail (clinica_id, patient_id, created_at DESC)
    WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS emr_v2_forensic_audit_entity_idx
    ON emr_v2_forensic_audit_trail (entity_table, entity_id);

COMMENT ON TABLE emr_v2_patients IS
    'EMR v2 patients. Source of truth demographics per tenant (clinica_id TEXT).';
COMMENT ON TABLE emr_v2_clinical_base IS
    'EMR v2 living chart. Granular JSONB sections with optimistic version.';
COMMENT ON TABLE emr_v2_evolutions IS
    'EMR v2 evolutions. Locked rows are immutable (Res. 1995/1999).';
COMMENT ON TABLE emr_v2_forensic_audit_trail IS
    'Append-only forensic hash-chain audit trail for EMR v2 mutations.';

-- 5. Trigger de inmutabilidad legal: no UPDATE/DELETE si is_locked = true
CREATE OR REPLACE FUNCTION prevent_locked_evolution_mutation()
RETURNS trigger AS $$
BEGIN
    IF OLD.is_locked IS TRUE THEN
        RAISE EXCEPTION 'LEGAL_IMMUTABILITY_VIOLATION: No se permite modificar ni eliminar una evolución clínica cerrada/firmada (Res. 1995/1999)';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emr_v2_evolutions_immutable ON emr_v2_evolutions;
CREATE TRIGGER trg_emr_v2_evolutions_immutable
    BEFORE UPDATE OR DELETE ON emr_v2_evolutions
    FOR EACH ROW
    EXECUTE PROCEDURE prevent_locked_evolution_mutation();
