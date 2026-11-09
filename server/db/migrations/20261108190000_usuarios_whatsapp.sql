-- Registro express: teléfono + verificación WhatsApp (Evolution API).
-- Idempotente para AWS RDS / Postgres local.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS whatsapp_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS whatsapp_status VARCHAR(32) NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_whatsapp_status_chk'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_whatsapp_status_chk
      CHECK (
        whatsapp_status IN (
          'pending',
          'queued',
          'sent',
          'failed',
          'verified',
          'skipped'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_usuarios_phone_number
  ON usuarios (phone_number)
  WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';

CREATE INDEX IF NOT EXISTS idx_usuarios_whatsapp_status
  ON usuarios (whatsapp_status);

COMMENT ON COLUMN usuarios.phone_number IS
  'Celular E.164 o dígitos con indicativo (Colombia +57). Usado para plantilla de bienvenida WhatsApp.';
COMMENT ON COLUMN usuarios.whatsapp_verified IS
  'TRUE cuando el número quedó verificado vía WhatsApp / acuse Evolution.';
COMMENT ON COLUMN usuarios.whatsapp_status IS
  'pending | queued | sent | failed | verified | skipped — estado del envío asíncrono de bienvenida.';
