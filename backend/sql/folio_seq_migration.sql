-- =====================================================================
-- Migración: secuencia atómica de folios para `incidencias` (SIGIM-MTZ)
-- Fecha: 2026-04-28
-- Objetivo: eliminar el riesgo de folios duplicados que existía con
--           SELECT COUNT(*) + 1 ante inserts concurrentes.
-- Formato de folio (sin cambios): SIGIM-YYYYMM-00001
--
-- IMPORTANTE: ejecutar paso a paso y revisar la salida de cada bloque
-- antes de pasar al siguiente. Hacer respaldo previo de la base.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Tabla de secuencia mensual de folios.
--    Una fila por (año, mes); la columna `ultimo` guarda el último
--    consecutivo otorgado.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folio_seq (
    anio   SMALLINT UNSIGNED NOT NULL,
    mes    TINYINT  UNSIGNED NOT NULL,
    ultimo INT      UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (anio, mes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ---------------------------------------------------------------------
-- 2) Sembrar `folio_seq` con el último consecutivo real ya emitido en
--    `incidencias` para cada (año, mes). Esto evita que el primer reporte
--    nuevo choque contra un folio existente (UNIQUE).
--
--    Asume formato 'SIGIM-YYYYMM-NNNNN' (18 caracteres).
--    El LIKE filtra solo los folios que respetan ese patrón.
-- ---------------------------------------------------------------------
INSERT INTO folio_seq (anio, mes, ultimo)
SELECT
    CAST(SUBSTRING(folio,  7, 4) AS UNSIGNED) AS anio,
    CAST(SUBSTRING(folio, 11, 2) AS UNSIGNED) AS mes,
    MAX(CAST(SUBSTRING(folio, 14, 5) AS UNSIGNED)) AS ultimo
FROM incidencias
WHERE folio LIKE 'SIGIM-______-_____'
GROUP BY anio, mes
ON DUPLICATE KEY UPDATE ultimo = GREATEST(folio_seq.ultimo, VALUES(ultimo));


-- ---------------------------------------------------------------------
-- 3) Verificación recomendada antes de continuar.
--    Debe coincidir el `ultimo` con el MAX consecutivo real por mes.
-- ---------------------------------------------------------------------
-- SELECT * FROM folio_seq ORDER BY anio DESC, mes DESC;


-- ---------------------------------------------------------------------
-- 4) Red de seguridad: índice UNIQUE sobre `incidencias.folio`.
--    Si por cualquier razón el código generara un folio repetido, MySQL
--    lo rechazará en el INSERT en lugar de aceptarlo silenciosamente.
--
--    OJO: si actualmente ya existen folios duplicados en `incidencias`,
--    este ALTER fallará. Revisar antes con la consulta de abajo y
--    limpiar manualmente si es necesario.
-- ---------------------------------------------------------------------
-- Diagnóstico previo (debe regresar 0 filas):
-- SELECT folio, COUNT(*) c FROM incidencias GROUP BY folio HAVING c > 1;

ALTER TABLE incidencias
    ADD UNIQUE INDEX uniq_incidencias_folio (folio);


-- =====================================================================
-- Rollback (solo si necesitas revertir, NO ejecutar normalmente):
--   ALTER TABLE incidencias DROP INDEX uniq_incidencias_folio;
--   DROP TABLE folio_seq;
-- =====================================================================
