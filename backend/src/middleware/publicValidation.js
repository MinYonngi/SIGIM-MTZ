const multer = require('multer');
const path = require('path');

// Configuración de multer para archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/evidencias/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'evidencia-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.match(/image\/(jpeg|jpg|png|webp)$/)) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten imágenes JPG, JPEG, PNG o WEBP'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: fileFilter
});

// Validación de campos
const validatePublicIncidencia = (req, res, next) => {
    const { tipo_servicio_id, titulo, descripcion, direccion } = req.body;
    
    // Validaciones básicas
    if (!tipo_servicio_id || !titulo || !descripcion) {
        return res.status(400).json({
            success: false,
            message: 'Los campos tipo_servicio_id, titulo y descripción son obligatorios'
        });
    }
    
    // Validación de dirección obligatoria
    if (!direccion || direccion.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'La dirección es obligatoria'
        });
    }
    
    next();
};

module.exports = {
    upload,
    validatePublicIncidencia
};
