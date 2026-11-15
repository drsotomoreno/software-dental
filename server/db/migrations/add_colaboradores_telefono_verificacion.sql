-- Teléfono y verificación de correo de colaboradores.
-- Idempotente. No hace DROP ni altera migraciones anteriores.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(30);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT false;

-- Los titulares ya existentes confirmaron su cuenta antes de este flujo.
UPDATE usuarios
SET email_verificado = TRUE
WHERE rol = 'TITULAR'
  AND email_verificado IS DISTINCT FROM TRUE;

COMMENT ON COLUMN usuarios.telefono IS
  'WhatsApp del colaborador, con indicativo. Se usa para abrir el chat de activación.';
COMMENT ON COLUMN usuarios.email_verificado IS
  'TRUE cuando el colaborador completó /activar. Los titulares existentes quedan en TRUE.';
