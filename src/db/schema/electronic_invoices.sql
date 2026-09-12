-- Referencia SQLite — Facturas electrónicas FEV-Salud (DIAN + MinSalud)
-- Persistencia operativa en cliente: Dexie `electronicInvoices`

CREATE TABLE IF NOT EXISTS electronic_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  invoice_prefix TEXT,
  consecutive_number INTEGER,
  issue_date TEXT NOT NULL,
  due_date TEXT,
  cufe TEXT,
  cuv TEXT,
  cuv_record_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',

  -- Doble validación: estados independientes DIAN (CUFE) y MinSalud MUV (CUV)
  estado_dian TEXT NOT NULL DEFAULT 'Pendiente'
    CHECK (estado_dian IN ('Pendiente', 'Aprobado', 'Rechazado')),
  codigo_cufe TEXT, -- Se llena cuando la DIAN aprueba (Paso 2)
  estado_muv TEXT NOT NULL DEFAULT 'Pendiente_Envio'
    CHECK (estado_muv IN ('Pendiente_Envio', 'Aprobado_Con_CUV', 'Rechazado_Por_MUV')),
  codigo_cuv TEXT, -- Se llena en el Paso 5 SOLO si el MUV aprueba
  detalles_rechazo_muv TEXT NOT NULL DEFAULT '[]', -- JSON array de glosas/rechazos MUV

  issuer_nit TEXT NOT NULL,
  issuer_business_name TEXT NOT NULL,

  buyer_document_type TEXT NOT NULL,
  buyer_document_number TEXT NOT NULL,
  buyer_name TEXT NOT NULL,

  cod_prestador_reps TEXT NOT NULL,
  modalidad_pago TEXT NOT NULL,
  cobertura_plan_beneficios TEXT NOT NULL,
  tipo_usuario TEXT NOT NULL,
  num_autorizacion TEXT,
  concepto_recaudo TEXT,
  valor_pago_moderador REAL DEFAULT 0,
  num_fev_pago_moderador TEXT,

  subtotal REAL NOT NULL,
  discount_total REAL NOT NULL DEFAULT 0,
  copay_total REAL NOT NULL DEFAULT 0,
  net_payable REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'COP',
  rips_reportable_total REAL NOT NULL DEFAULT 0,
  rips_excluded_line_count INTEGER NOT NULL DEFAULT 0,

  patient_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  clinical_record_ids TEXT NOT NULL, -- JSON array
  evolution_note_ids TEXT,           -- JSON array

  rips_json TEXT,                    -- JSON RipsTransaction
  items_json TEXT NOT NULL,          -- JSON InvoiceItem[]

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  validated_at TEXT,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_electronic_invoices_patient ON electronic_invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_electronic_invoices_number ON electronic_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_electronic_invoices_status ON electronic_invoices(status);
CREATE INDEX IF NOT EXISTS idx_electronic_invoices_issue_date ON electronic_invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_electronic_invoices_estado_dian ON electronic_invoices(estado_dian);
CREATE INDEX IF NOT EXISTS idx_electronic_invoices_estado_muv ON electronic_invoices(estado_muv);

-- Instalaciones existentes:
-- ALTER TABLE electronic_invoices ADD COLUMN estado_dian TEXT NOT NULL DEFAULT 'Pendiente';
-- ALTER TABLE electronic_invoices ADD COLUMN codigo_cufe TEXT;
-- ALTER TABLE electronic_invoices ADD COLUMN estado_muv TEXT NOT NULL DEFAULT 'Pendiente_Envio';
-- ALTER TABLE electronic_invoices ADD COLUMN codigo_cuv TEXT;
-- ALTER TABLE electronic_invoices ADD COLUMN detalles_rechazo_muv TEXT NOT NULL DEFAULT '[]';
