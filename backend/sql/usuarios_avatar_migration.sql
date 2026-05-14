-- ===========================================================
-- Migración: soporte de avatar para usuarios internos
-- SIGIM-MTZ
-- ===========================================================

ALTER TABLE usuarios
  ADD COLUMN avatar_filename VARCHAR(255) NULL AFTER password_hash,
  ADD COLUMN avatar_mime VARCHAR(100) NULL AFTER avatar_filename,
  ADD COLUMN avatar_size INT UNSIGNED NULL AFTER avatar_mime,
  ADD COLUMN avatar_updated_at DATETIME NULL AFTER avatar_size;

-- Opcional (si su esquema no incluye timestamps de usuario):
-- ALTER TABLE usuarios
--   ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
--   ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
