-- Referencia SQLite — consentimiento de valoración rápida (pacientes)
-- La app web usa Dexie/IndexedDB con campos equivalentes en JSON.

ALTER TABLE patients ADD COLUMN consentimiento_valoracion_aceptado INTEGER DEFAULT 0;
ALTER TABLE patients ADD COLUMN consentimiento_timestamp TEXT;
ALTER TABLE patients ADD COLUMN dispositivo_id TEXT;
ALTER TABLE patients ADD COLUMN valuation_consent_json TEXT;
