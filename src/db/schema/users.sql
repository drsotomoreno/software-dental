-- Referencia SQLite — Usuarios / clínicas (prestador)
-- Persistencia operativa en cliente: Dexie `users`
-- No hay tabla Clinicas separada: el titular (clinic_id = id) representa la clínica.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  document_type TEXT,
  document_number TEXT,
  role TEXT NOT NULL DEFAULT 'odontologo',
  clinic_name TEXT,
  clinic_id TEXT,
  is_clinic_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_clinic_owner IN (0, 1)),
  legal_name TEXT,
  provider_type TEXT NOT NULL DEFAULT 'profesional_independiente'
    CHECK (provider_type IN ('institucion', 'profesional_independiente')),
  provider_nit TEXT,
  reps_code TEXT,
  reps_status TEXT,
  -- Perfil fiscal del prestador (clínica). Enum o booleano equivalente:
  -- Obligado_FEV (true) | No_Obligado (false). Res. 2275 / FEV-Salud.
  perfil_fiscal TEXT NOT NULL DEFAULT 'Obligado_FEV'
    CHECK (perfil_fiscal IN ('Obligado_FEV', 'No_Obligado')),
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_clinic ON users (clinic_id);
CREATE INDEX IF NOT EXISTS idx_users_document ON users (document_number);
CREATE INDEX IF NOT EXISTS idx_users_perfil_fiscal ON users (perfil_fiscal);

-- Instalaciones existentes:
-- ALTER TABLE users ADD COLUMN perfil_fiscal TEXT NOT NULL DEFAULT 'Obligado_FEV';
