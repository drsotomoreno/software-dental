-- Referencia PostgreSQL — Pacientes + historias clínicas multi-tenant
-- Migración: server/db/migrations/20261102150000_pacientes_historias_clinicas.sql
-- Servicio: server/services/clinicalTenantStore.js
--
-- Aislamiento: clinica_id NOT NULL (Superadmin bypass en middleware/SQL).
-- Offline-first: updated_at + deleted_at (soft delete).
-- Evoluciones: firma solo del odontólogo (firma_rethus + firmado_en). Sin firma de paciente.

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
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paciente_documento_clinica
    ON pacientes (clinica_id, tipo_documento, numero_documento)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS historias_clinicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    odontologo_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha_consulta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo_consulta TEXT NOT NULL,
    notas_clinicas TEXT,
    diagnostico_principal VARCHAR(10) NOT NULL,
    finalidad_consulta VARCHAR(2) NOT NULL,
    causa_externa VARCHAR(2) NOT NULL,
    tipo_usuario VARCHAR(2) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'borrador'
      CHECK (estado IN ('borrador', 'cerrada_firmada')),
    firma_digital_url TEXT,
    firma_rethus VARCHAR(50),
    firmado_en TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT historias_clinicas_firma_cierre_chk CHECK (
      estado <> 'cerrada_firmada'
      OR (
        firma_rethus IS NOT NULL
        AND btrim(firma_rethus) <> ''
        AND firmado_en IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_historias_paciente ON historias_clinicas (paciente_id);
CREATE INDEX IF NOT EXISTS idx_historias_sync
    ON historias_clinicas (clinica_id, updated_at)
    WHERE deleted_at IS NULL;
