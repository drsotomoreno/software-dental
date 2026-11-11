-- Referencia PostgreSQL — Espejo demográfico de pacientes (multi-tenant)
-- Migración: server/db/migrations/20261102150000_pacientes_historias_clinicas.sql
-- Cleanup: server/db/migrations/20261111170000_cleanup_ghost_tables.sql
-- Servicio: server/services/clinicPatientMirror.js
--
-- Aislamiento: clinica_id NOT NULL.
-- Offline-first: updated_at + deleted_at (soft delete).
-- El cuerpo clínico firmado vive en app_json_store (clinical-sync).
-- Analítica / BI: idx_pacientes, idx_evoluciones, idx_diagnosticos, idx_procedimientos.
-- historias_clinicas fue eliminada (tabla fantasma sin writers).

CREATE TABLE IF NOT EXISTS pacientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    tipo_documento VARCHAR(5) NOT NULL,
    numero_documento VARCHAR(50) NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    sexo VARCHAR(2) NOT NULL CHECK (sexo IN ('F', 'M', 'O')),
    email VARCHAR(255),
    telefono VARCHAR(50),
    direccion TEXT,
    sync_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paciente_documento_clinica
    ON pacientes (clinica_id, tipo_documento, numero_documento)
    WHERE deleted_at IS NULL;
