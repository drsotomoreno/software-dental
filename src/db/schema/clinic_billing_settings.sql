-- Referencia SQLite — Ajustes de facturación de la clínica (Mis Cuentas y Facturas)
-- Persistencia operativa en cliente: Dexie `clinicBillingSettings`

CREATE TABLE IF NOT EXISTS clinic_billing_settings (
  id TEXT PRIMARY KEY NOT NULL,
  modality TEXT NOT NULL DEFAULT 'automatic',
  tenant_api_key TEXT,
  resolution_number TEXT,
  invoice_prefix TEXT,
  range_from TEXT,
  range_to TEXT,
  folios_available INTEGER NOT NULL DEFAULT 0,
  welcome_folios INTEGER NOT NULL DEFAULT 0,
  has_purchased_pack INTEGER NOT NULL DEFAULT 0 CHECK (has_purchased_pack IN (0, 1)),
  -- Copia operativa del perfil fiscal del titular (users.perfil_fiscal).
  perfil_fiscal TEXT NOT NULL DEFAULT 'Obligado_FEV'
    CHECK (perfil_fiscal IN ('Obligado_FEV', 'No_Obligado')),
  last_connection_ok_at TEXT,
  updated_at TEXT NOT NULL
);

-- Instalaciones existentes:
-- ALTER TABLE clinic_billing_settings ADD COLUMN perfil_fiscal TEXT NOT NULL DEFAULT 'Obligado_FEV';
