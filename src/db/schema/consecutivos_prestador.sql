-- Referencia SQLite — consecutivos de cobro del titular y pago de la atención.
-- Persistencia operativa en cliente:
--   Dexie `consecutivosPrestador` y `recibosCaja`
--   campos de pago en la nota de evolución (Sección 11), dentro de `clinicalRecords`.
-- usuario_titular_id apunta al titular de `users` (clinic owner).

CREATE TABLE IF NOT EXISTS consecutivos_prestador (
    id TEXT PRIMARY KEY NOT NULL,
    usuario_titular_id TEXT NOT NULL,
    tipo_documento TEXT NOT NULL, -- 'RECIBO_CAJA' | 'CUENTA_COBRO'
    prefijo TEXT NOT NULL DEFAULT 'RC-',
    ultimo_consecutivo INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT,
    CONSTRAINT uq_usuario_tipo_doc UNIQUE (usuario_titular_id, tipo_documento),
    FOREIGN KEY (usuario_titular_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recibos_caja (
    id TEXT PRIMARY KEY NOT NULL,
    usuario_titular_id TEXT NOT NULL,
    tipo_documento TEXT NOT NULL,
    consecutivo INTEGER NOT NULL,
    prefijo TEXT NOT NULL DEFAULT 'RC-',
    numero_soporte TEXT,
    concepto TEXT,
    valor NUMERIC NOT NULL DEFAULT 0,
    created_at TEXT,
    CONSTRAINT uq_recibo_titular_consecutivo UNIQUE (usuario_titular_id, tipo_documento, consecutivo),
    FOREIGN KEY (usuario_titular_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recibos_caja_titular
    ON recibos_caja (usuario_titular_id, tipo_documento);

-- Atención de la evolución clínica (Sección 11).
CREATE TABLE IF NOT EXISTS atenciones (
    id TEXT PRIMARY KEY NOT NULL,
    evolution_note_id TEXT,
    clinical_record_id TEXT,
    usuario_titular_id TEXT,
    pago_id TEXT,
    numero_soporte_pago TEXT,
    concepto_pago TEXT,
    valor_procedimiento NUMERIC NOT NULL DEFAULT 0,
    estado_rips TEXT NOT NULL DEFAULT 'PENDIENTE_PAGO',
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (pago_id) REFERENCES recibos_caja(id) ON DELETE SET NULL,
    FOREIGN KEY (usuario_titular_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_atenciones_pago_id ON atenciones (pago_id);
CREATE INDEX IF NOT EXISTS idx_atenciones_estado_rips ON atenciones (estado_rips);
CREATE INDEX IF NOT EXISTS idx_atenciones_clinical_record ON atenciones (clinical_record_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_atenciones_evolution_note
    ON atenciones (evolution_note_id)
    WHERE evolution_note_id IS NOT NULL AND trim(evolution_note_id) <> '';
