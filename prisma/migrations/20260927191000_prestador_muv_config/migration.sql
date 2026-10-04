-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "prestador_muv_configs" (
    "id" UUID NOT NULL,
    "prestador_id" TEXT NOT NULL,
    "provider_type" VARCHAR(32) NOT NULL DEFAULT 'profesional_independiente',
    "reps_code" VARCHAR(12) NOT NULL,
    "nit" VARCHAR(11) NOT NULL,
    "tipo_documento" VARCHAR(4) NOT NULL,
    "ambiente" VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    "api_base_url" TEXT,
    "auth_url" TEXT,
    "validate_path" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "encryption_key_version" INTEGER NOT NULL DEFAULT 1,
    "encryption_algorithm" VARCHAR(32) NOT NULL DEFAULT 'AES-256-GCM',
    "sispro_usuario_cipher" BYTEA,
    "sispro_clave_cipher" BYTEA,
    "sispro_client_id_cipher" BYTEA,
    "sispro_client_secret_cipher" BYTEA,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prestador_muv_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prestador_muv_configs_prestador_id_key" ON "prestador_muv_configs"("prestador_id");

-- Una fila por profesional independiente. Las credenciales SISPRO solo existen como BYTEA.
ALTER TABLE "prestador_muv_configs"
  ADD CONSTRAINT "prestador_muv_configs_provider_type_check"
  CHECK ("provider_type" = 'profesional_independiente');

ALTER TABLE "prestador_muv_configs"
  ADD CONSTRAINT "prestador_muv_configs_ambiente_check"
  CHECK ("ambiente" IN ('sandbox', 'produccion'));

ALTER TABLE "prestador_muv_configs"
  ADD CONSTRAINT "prestador_muv_configs_algorithm_check"
  CHECK ("encryption_algorithm" = 'AES-256-GCM');

ALTER TABLE "prestador_muv_configs"
  ADD CONSTRAINT "prestador_muv_configs_key_version_check"
  CHECK ("encryption_key_version" >= 1);

ALTER TABLE "prestador_muv_configs"
  ADD CONSTRAINT "prestador_muv_configs_reps_code_check"
  CHECK ("reps_code" ~ '^[0-9]{12}$');

ALTER TABLE "prestador_muv_configs"
  ADD CONSTRAINT "prestador_muv_configs_credentials_check"
  CHECK (
    (
      "sispro_usuario_cipher" IS NOT NULL
      AND "sispro_clave_cipher" IS NOT NULL
    )
    OR (
      "sispro_client_id_cipher" IS NOT NULL
      AND "sispro_client_secret_cipher" IS NOT NULL
    )
  );
