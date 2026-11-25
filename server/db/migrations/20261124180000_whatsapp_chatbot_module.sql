-- WhatsApp y Chatbot (multi-tenant): credenciales Meta por clínica, saldos prepago,
-- tracking de recordatorios en citas, follow-ups de inasistencia y ventanas 24h.
-- Idempotente para AWS RDS / Postgres local.
-- Depende de: clinicas, pacientes (20261102143000 / 20261102150000).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Columnas WhatsApp / saldos en clinicas (tenants)
-- ---------------------------------------------------------------------------
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id VARCHAR(64);
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS whatsapp_waba_id VARCHAR(64);
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS reminders_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS chatbot_sessions_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS chatbot_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN clinicas.whatsapp_phone_number_id IS
  'Meta Cloud API Phone Number ID de la sede.';
COMMENT ON COLUMN clinicas.whatsapp_waba_id IS
  'WhatsApp Business Account ID (WABA) de la sede.';
COMMENT ON COLUMN clinicas.whatsapp_access_token IS
  'Access token Meta cifrado (AES-GCM v1:iv:tag:payload). Nunca plaintext.';
COMMENT ON COLUMN clinicas.whatsapp_connected IS
  'true cuando phone_number_id + WABA + token están listos para enviar.';
COMMENT ON COLUMN clinicas.reminders_balance IS
  'Créditos prepago de recordatorios automáticos (48h/24h).';
COMMENT ON COLUMN clinicas.chatbot_sessions_balance IS
  'Créditos prepago de sesiones de chatbot (ventana 24h).';
COMMENT ON COLUMN clinicas.chatbot_enabled IS
  'Interruptor de producto: chatbot activo para la sede.';

-- ---------------------------------------------------------------------------
-- 2) appointments (espejo operativo para recordatorios WhatsApp)
--    Las citas clínicas siguen en clinical-sync; esta tabla guarda estado de envío.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
    sync_id TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32),
    reminder_48h_sent_at TIMESTAMP WITH TIME ZONE,
    reminder_24h_sent_at TIMESTAMP WITH TIME ZONE,
    confirmed_by_patient BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_id UUID;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_id UUID;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS start_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status VARCHAR(32);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_48h_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_by_patient BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_clinic_id_fkey'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_clinic_id_fkey
      FOREIGN KEY (clinic_id) REFERENCES clinicas(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_patient_id_fkey'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES pacientes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_clinic_sync_id
  ON appointments (clinic_id, sync_id)
  WHERE sync_id IS NOT NULL AND btrim(sync_id) <> '';

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_start
  ON appointments (clinic_id, start_time);

CREATE INDEX IF NOT EXISTS idx_appointments_reminders_pending
  ON appointments (clinic_id, start_time)
  WHERE reminder_48h_sent_at IS NULL OR reminder_24h_sent_at IS NULL;

COMMENT ON TABLE appointments IS
  'Espejo operativo de citas para recordatorios WhatsApp (no sustituye clinical-sync).';
COMMENT ON COLUMN appointments.confirmed_by_patient IS
  'true cuando el paciente confirma por WhatsApp (botón de plantilla).';

-- ---------------------------------------------------------------------------
-- 3) no_show_followups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS no_show_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
    missed_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    step INTEGER NOT NULL DEFAULT 1,
    next_send_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    receptionist_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT no_show_followups_step_chk CHECK (step IN (1, 2)),
    CONSTRAINT no_show_followups_status_chk CHECK (
      status IN ('active', 'pending_manual_call', 'scheduled', 'opted_out', 'archived')
    )
);

ALTER TABLE no_show_followups ADD COLUMN IF NOT EXISTS clinic_id UUID;
ALTER TABLE no_show_followups ADD COLUMN IF NOT EXISTS patient_id UUID;
ALTER TABLE no_show_followups ADD COLUMN IF NOT EXISTS missed_appointment_id UUID;
ALTER TABLE no_show_followups ADD COLUMN IF NOT EXISTS step INTEGER DEFAULT 1;
ALTER TABLE no_show_followups ADD COLUMN IF NOT EXISTS next_send_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE no_show_followups ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE no_show_followups ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';
ALTER TABLE no_show_followups ADD COLUMN IF NOT EXISTS receptionist_notes TEXT;
ALTER TABLE no_show_followups ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE no_show_followups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_no_show_followups_clinic_status
  ON no_show_followups (clinic_id, status);

CREATE INDEX IF NOT EXISTS idx_no_show_followups_next_send
  ON no_show_followups (clinic_id, next_send_at)
  WHERE status IN ('active', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_no_show_followups_pending_call
  ON no_show_followups (clinic_id)
  WHERE status = 'pending_manual_call';

COMMENT ON TABLE no_show_followups IS
  'Cola de recontacto por inasistencia: step 1 = día siguiente, step 2 = +7 días.';
COMMENT ON COLUMN no_show_followups.step IS
  '1 = mensaje día siguiente; 2 = mensaje 7 días después.';
COMMENT ON COLUMN no_show_followups.status IS
  'active | pending_manual_call | scheduled | opted_out | archived';

-- ---------------------------------------------------------------------------
-- 4) whatsapp_purchases (recargas prepago)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    package_id VARCHAR(64) NOT NULL,
    package_name VARCHAR(128) NOT NULL,
    type VARCHAR(16) NOT NULL,
    credits_added INTEGER NOT NULL,
    amount_cop INTEGER NOT NULL,
    payment_reference VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT whatsapp_purchases_type_chk CHECK (type IN ('reminders', 'chatbot')),
    CONSTRAINT whatsapp_purchases_credits_chk CHECK (credits_added > 0),
    CONSTRAINT whatsapp_purchases_amount_chk CHECK (amount_cop >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_purchases_payment_reference
  ON whatsapp_purchases (payment_reference)
  WHERE payment_reference IS NOT NULL AND btrim(payment_reference) <> '';

CREATE INDEX IF NOT EXISTS idx_whatsapp_purchases_clinic_created
  ON whatsapp_purchases (clinic_id, created_at DESC);

COMMENT ON TABLE whatsapp_purchases IS
  'Historial de recargas prepago WhatsApp (recordatorios o chatbot).';

-- ---------------------------------------------------------------------------
-- 5) whatsapp_chat_sessions (ventana 24h Meta)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    patient_phone VARCHAR(32) NOT NULL,
    window_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_interaction_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_chat_sessions_clinic_phone
  ON whatsapp_chat_sessions (clinic_id, patient_phone);

CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_sessions_expires
  ON whatsapp_chat_sessions (clinic_id, window_expires_at);

COMMENT ON TABLE whatsapp_chat_sessions IS
  'Ventana de servicio 24h del chatbot por teléfono del paciente (E.164 digits).';
