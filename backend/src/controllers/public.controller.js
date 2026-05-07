const db = require('../config/db');
const { ensureUploadDir } = require('../utils/fileHandler');
const logger = require('../utils/logger');

// Crear versión con promesas para consistencia con mysql2
const promiseDb = db.promise();

// Asegurar que el directorio de uploads exista
ensureUploadDir();

/**
 * Genera un folio único para incidencias en formato SIGIM-YYYYMM-00001.
 *
 * Usa la tabla `folio_seq` (anio, mes, ultimo) con SELECT ... FOR UPDATE
 * dentro de una transacción para evitar duplicados ante inserts concurrentes.
 *
 * IMPORTANTE: debe llamarse con una conexión que ya tenga una transacción
 * activa (beginTransaction). El consecutivo se incrementa de forma atómica
 * en la misma transacción que el INSERT a `incidencias`, de modo que un
 * rollback no deja huecos en la secuencia.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} anio
 * @param {number} mes  - 1..12
 * @returns {Promise<string>} folio listo para insertar
 */
const generarFolio = async (connection, anio, mes) => {
    // 1. Asegurar que exista la fila para (anio, mes). Si ya existe, no hace nada.
    await connection.query(
        `INSERT INTO folio_seq (anio, mes, ultimo)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE anio = anio`,
        [anio, mes]
    );

    // 2. Bloquear la fila del mes para esta transacción.
    const [rows] = await connection.query(
        'SELECT ultimo FROM folio_seq WHERE anio = ? AND mes = ? FOR UPDATE',
        [anio, mes]
    );
    const siguiente = rows[0].ultimo + 1;

    // 3. Persistir el nuevo consecutivo.
    await connection.query(
        'UPDATE folio_seq SET ultimo = ? WHERE anio = ? AND mes = ?',
        [siguiente, anio, mes]
    );

    const mesStr = String(mes).padStart(2, '0');
    const consecutivo = String(siguiente).padStart(5, '0');
    return `SIGIM-${anio}${mesStr}-${consecutivo}`;
};

// Registrar incidencia pública
const registrarIncidencia = async (req, res) => {
    let connection;
    try {
        const {
            tipo_servicio_id,
            titulo,
            descripcion,
            direccion,
            referencia,
            colonia,
            ciudadano_nombre,
            ciudadano_tel,
            latitud,
            longitud
        } = req.body;

        // Validar que tipo_servicio_id exista y esté activo (campo real: active).
        // Esta validación se hace fuera de la transacción para no tomar conexión
        // dedicada en peticiones inválidas.
        const [servicioCheck] = await promiseDb.query(
            'SELECT id FROM catalogo_tipos_servicio WHERE id = ? AND active = 1',
            [tipo_servicio_id]
        );

        if (servicioCheck.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'El tipo de servicio seleccionado no es válido'
            });
        }

        // ID de usuario interno para reportes públicos (configurable desde .env)
        const PUBLIC_USER_ID = parseInt(process.env.PUBLIC_USER_ID || '1', 10);

        // Estrategia segura para coordenadas (no convertir valores válidos accidentalmente)
        const latitudValue = (latitud !== undefined && latitud !== null && latitud !== '') ? latitud : null;
        const longitudValue = (longitud !== undefined && longitud !== null && longitud !== '') ? longitud : null;

        const fecha = new Date();
        const anio = fecha.getFullYear();
        const mes = fecha.getMonth() + 1; // 1..12

        // Tomar una conexión dedicada del pool y abrir transacción.
        // El folio y el INSERT a incidencias deben vivir en la misma transacción
        // para que un rollback no deje el contador adelantado sin reporte real.
        connection = await promiseDb.getConnection();
        await connection.beginTransaction();

        // Generar folio de forma atómica con bloqueo FOR UPDATE sobre folio_seq.
        const folio = await generarFolio(connection, anio, mes);

        // Insertar incidencia (mismo connection / misma transacción)
        const [result] = await connection.query(
            `INSERT INTO incidencias (
                folio, tipo_servicio_id, titulo, descripcion, direccion,
                referencia, colonia, ciudadano_nombre, ciudadano_tel,
                latitud, longitud, estatus, prioridad, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NUEVA', 'MEDIA', ?, NOW(), NOW())`,
            [
                folio, tipo_servicio_id, titulo, descripcion, direccion,
                referencia, colonia, ciudadano_nombre, ciudadano_tel,
                latitudValue, longitudValue, PUBLIC_USER_ID
            ]
        );

        // Manejar archivo de evidencia si existe usando incidencia_archivos
        if (req.file) {
            await connection.query(
                `INSERT INTO incidencia_archivos (
                    incidencia_id, filename, original_name, mime, size, uploaded_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [
                    result.insertId,                    // incidencia_id
                    req.file.filename,                  // filename
                    req.file.originalname,              // original_name
                    req.file.mimetype,                  // mime (campo real)
                    req.file.size,                      // size (campo real)
                    PUBLIC_USER_ID                      // uploaded_by
                ]
            );
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Reporte registrado correctamente',
            data: {
                folio,
                estatus: 'NUEVA',
                fechaRegistro: fecha.toISOString()
            }
        });

    } catch (error) {
        // Intentar rollback si la transacción se llegó a abrir
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                logger.error('Error al hacer rollback en registrarIncidencia:', rollbackErr);
            }
        }

        logger.error('Error al registrar incidencia pública:', error);

        // Eliminar archivo si hubo error
        if (req.file) {
            const { deleteFile } = require('../utils/fileHandler');
            deleteFile(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    } finally {
        // Devolver siempre la conexión al pool
        if (connection) {
            connection.release();
        }
    }
};

// Consultar incidencia por folio
const consultarIncidencia = async (req, res) => {
    try {
        const { folio } = req.params;

        const [incidencia] = await promiseDb.query(
            `SELECT folio, titulo, estatus, created_at, updated_at 
             FROM incidencias 
             WHERE folio = ?`,
            [folio]
        );

        if (incidencia.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No se encontró un reporte con ese folio',
                error: 'FOLIO_NOT_FOUND'
            });
        }

        const data = incidencia[0];
        
        res.status(200).json({
            success: true,
            data: {
                folio: data.folio,
                titulo: data.titulo,
                estatus: data.estatus,
                fechaRegistro: data.created_at,
                ultimaActualizacion: data.updated_at
            }
        });

    } catch (error) {
        logger.error('Error al consultar incidencia pública:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

module.exports = {
    registrarIncidencia,
    consultarIncidencia
};
