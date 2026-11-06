-- Referencia PostgreSQL — Multi-tenant RBAC (clínicas + usuarios)
-- Migración operativa: server/db/migrations/20261102143000_clinicas_usuarios_rbac.sql
-- Servicio: server/services/tenantRbacStore.js
--
-- is_superadmin: llave maestra exclusiva de doctormauriciosoto@gmail.com
-- clinica_id NULL: el Superadmin flota sobre todos los tenants

CREATE TABLE IF NOT EXISTS clinicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    codigo_reps VARCHAR(50),
    direccion TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id UUID REFERENCES clinicas(id) ON DELETE SET NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    registro_rethus VARCHAR(50),
    is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
    rol VARCHAR(50) NOT NULL DEFAULT 'odontologo',
    estado VARCHAR(20) NOT NULL DEFAULT 'activo',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT usuarios_superadmin_email_chk CHECK (
      is_superadmin = FALSE
      OR lower(email) = 'doctormauriciosoto@gmail.com'
    )
);

CREATE INDEX IF NOT EXISTS idx_usuarios_clinica ON usuarios (clinica_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);
