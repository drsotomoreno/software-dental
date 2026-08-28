-- Referencia SQLite — Catálogo de Servicios Odontológicos (Mis Precios)
-- Equivalente Dexie: dentalServices, dentalServiceSpecialties, professionals, dentalServicePrices

-- ---------------------------------------------------------------------------
-- Maestra REHUS / REPS — especialidades odontológicas habilitadas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rehus_specialties (
  id            TEXT PRIMARY KEY NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

-- ---------------------------------------------------------------------------
-- Catálogo de servicios odontológicos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dental_services (
  id                  TEXT PRIMARY KEY NOT NULL,
  organization_id     TEXT NOT NULL,
  internal_code       TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL DEFAULT 'otro',
  cups_code           TEXT,
  requiere_cups_rips  INTEGER NOT NULL DEFAULT 1 CHECK (requiere_cups_rips IN (0, 1)),
  cups_homologo       TEXT,
  default_price       REAL NOT NULL DEFAULT 0 CHECK (default_price >= 0),
  currency            TEXT NOT NULL DEFAULT 'COP',
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (organization_id, internal_code),
  CHECK (
  -- Servicios con CUPS obligatorio para RIPS deben informar cups_code
    requiere_cups_rips = 0
    OR (cups_code IS NOT NULL AND TRIM(cups_code) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_dental_services_org
  ON dental_services (organization_id);

CREATE INDEX IF NOT EXISTS idx_dental_services_cups
  ON dental_services (cups_code)
  WHERE cups_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dental_services_homologo
  ON dental_services (cups_homologo)
  WHERE cups_homologo IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Especialidades REHUS autorizadas por servicio (N:M)
-- Regla: si rehus_specialty_id = 'odontologia_general', cualquier especialista puede
-- realizar y evolucionar el servicio.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dental_service_authorized_specialties (
  id                  TEXT PRIMARY KEY NOT NULL,
  service_id          TEXT NOT NULL,
  rehus_specialty_id  TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  UNIQUE (service_id, rehus_specialty_id),
  FOREIGN KEY (service_id) REFERENCES dental_services (id) ON DELETE CASCADE,
  FOREIGN KEY (rehus_specialty_id) REFERENCES rehus_specialties (id)
);

CREATE INDEX IF NOT EXISTS idx_service_specialties_service
  ON dental_service_authorized_specialties (service_id);

CREATE INDEX IF NOT EXISTS idx_service_specialties_rehus
  ON dental_service_authorized_specialties (rehus_specialty_id);

-- ---------------------------------------------------------------------------
-- Profesionales — especialidad REHUS habilitada
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS professionals (
  id                    TEXT PRIMARY KEY NOT NULL,
  user_id               TEXT NOT NULL UNIQUE,
  organization_id       TEXT NOT NULL,
  document_type         TEXT NOT NULL,
  document_number       TEXT NOT NULL,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  professional_license  TEXT,
  rehus_specialty       TEXT NOT NULL,
  reps_code             TEXT,
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  FOREIGN KEY (rehus_specialty) REFERENCES rehus_specialties (id)
);

CREATE INDEX IF NOT EXISTS idx_professionals_org
  ON professionals (organization_id);

CREATE INDEX IF NOT EXISTS idx_professionals_rehus
  ON professionals (rehus_specialty);

-- ---------------------------------------------------------------------------
-- Precios por usuario sobre servicios del catálogo (capa Mis Precios)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dental_service_prices (
  id          TEXT PRIMARY KEY NOT NULL,
  service_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  price       REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency    TEXT NOT NULL DEFAULT 'COP',
  updated_at  TEXT NOT NULL,
  UNIQUE (service_id, user_id),
  FOREIGN KEY (service_id) REFERENCES dental_services (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dental_service_prices_user
  ON dental_service_prices (user_id);
