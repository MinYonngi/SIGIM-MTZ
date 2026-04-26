const db = require('../config/db');
const { ensureUploadDir } = require('../utils/fileHandler');

// Crear versión con promesas para consistencia con mysql2
const promiseDb = db.promise();

// Asegurar que el directorio de uploads exista
ensureUploadDir();

// Registrar incidencia pública
const registrarIncidencia = async (req, res) => {
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

        // Validar que tipo_servicio_id exista y esté activo (campo real: active)
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

        // Generar folio único
        const fecha = new Date();
        const año = fecha.getFullYear();
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        
        const [folioCount] = await promiseDb.query(
            'SELECT COUNT(*) as count FROM incidencias WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?',
            [año, mes]
        );
        
        const consecutivo = String(folioCount[0].count + 1).padStart(5, '0');
        const folio = `SIGIM-${año}${mes}-${consecutivo}`;

        // ID de usuario interno para reportes públicos (configurable desde .env)
        const PUBLIC_USER_ID = parseInt(process.env.PUBLIC_USER_ID || '1', 10);

        // Estrategia segura para coordenadas (no convertir valores válidos accidentalmente)
        const latitudValue = (latitud !== undefined && latitud !== null && latitud !== '') ? latitud : null;
        const longitudValue = (longitud !== undefined && longitud !== null && longitud !== '') ? longitud : null;

        // Insertar incidencia
        const [result] = await promiseDb.query(
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
            await promiseDb.query(
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
        console.error('Error al registrar incidencia pública:', error);
        
        // Eliminar archivo si hubo error
        if (req.file) {
            const { deleteFile } = require('../utils/fileHandler');
            deleteFile(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
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
        console.error('Error al consultar incidencia pública:', error);
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
