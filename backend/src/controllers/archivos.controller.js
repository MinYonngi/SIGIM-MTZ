const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');

function operadorPuedeGestionarEvidencia(req, assignedTo) {
  if (!req.user || req.user.role !== "OPERADOR") return true;
  return Number(assignedTo) === Number(req.user.id);
}

// Configuración de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads');
    console.log('📁 Ruta de uploads:', uploadPath);
    
    if (!fs.existsSync(uploadPath)) {
      console.log('🔧 Creando carpeta uploads...');
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    console.log('✅ Carpeta uploads existe');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const filename = 'incidencia-' + uniqueSuffix + ext;
    
    console.log('📄 Nombre de archivo generado:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB límite
  },
  fileFilter: (req, file, cb) => {
    console.log('🔍 Filtrando archivo:', file.originalname, 'Tipo:', file.mimetype);
    
    // Permitir imágenes y PDF
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      console.log('✅ Archivo permitido');
      cb(null, true);
    } else {
      console.log('❌ Archivo no permitido:', file.mimetype);
      cb(new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPG, PNG) y PDF.'), false);
    }
  }
});

// =====================================================
// 📌 SUBIR ARCHIVO A INCIDENCIA
// POST /api/incidencias/:id/archivos
// =====================================================
exports.subirArchivo = (req, res) => {
  console.log('🚀 Iniciando subirArchivo');
  console.log('📋 req.params:', req.params);
  
  // Procesar multer primero para que req.body esté disponible
  upload.single('archivo')(req, res, (err) => {
    if (err) {
      console.error("❌ Error en multer:", err);
      return res.status(400).json({ 
        message: err.message || "Error al subir archivo" 
      });
    }

    console.log('📋 req.body después de multer:', req.body);
    console.log('📋 req.file:', req.file);

    const incidenciaId = parseInt(req.params.id, 10);
    const uploadedBy = req.user && req.user.id ? Number(req.user.id) : null;

    if (!incidenciaId) {
      console.error("❌ ID de incidencia requerido");
      return res.status(400).json({ message: "ID de incidencia requerido" });
    }

    if (!uploadedBy) {
      return res.status(401).json({ message: "No autenticado" });
    }

    if (!req.file) {
      console.error("❌ No se recibió ningún archivo");
      return res.status(400).json({ message: "No se recibió ningún archivo" });
    }

    db.query(
      "SELECT assigned_to FROM incidencias WHERE id = ?",
      [incidenciaId],
      (chkErr, chkRows) => {
        if (chkErr) {
          console.error(chkErr);
          return res.status(500).json({ message: "Error al validar incidencia" });
        }
        if (!chkRows.length) {
          return res.status(404).json({ message: "Incidencia no encontrada" });
        }
        if (!operadorPuedeGestionarEvidencia(req, chkRows[0].assigned_to)) {
          return res.status(403).json({
            message: "Solo puede subir evidencia en incidencias asignadas a usted",
          });
        }

    const sql = `
      INSERT INTO incidencia_archivos 
      (incidencia_id, filename, original_name, mime, size, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;

    const values = [
      incidenciaId,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      uploadedBy
    ];

    db.query(sql, values, (dbErr, result) => {
      if (dbErr) {
        console.error("Error SQL detallado:", dbErr);
        console.error("SQL ejecutado:", sql);
        console.error("Valores:", values);
        return res.status(500).json({ 
          message: "Error al registrar archivo",
          sql_error: dbErr.sqlMessage,
          sql_code: dbErr.errno
        });
      }

      // Registrar en historial (no crítico, solo log si falla)
      const sqlHistorial = `
        INSERT INTO incidencia_historial
        (incidencia_id, accion, comentario, actor_user_id, created_at)
        VALUES (?, 'SUBIR_EVIDENCIA', ?, ?, NOW())
      `;

      db.query(sqlHistorial, [
        incidenciaId, 
        `Se subió archivo: ${req.file.filename}`, 
        uploadedBy
      ], (histErr) => {
        if (histErr) {
          console.error("Error al registrar en historial (no crítico):", histErr);
          // No romper la respuesta principal
        }
      });

      return res.status(201).json({
        message: "Archivo subido correctamente",
        archivo: {
          id: result.insertId,
          filename: req.file.filename,
          original_name: req.file.originalname,
          mime: req.file.mimetype,
          size: req.file.size
        }
      });
    });
  });
  });
};

// =====================================================
// 📌 LISTAR ARCHIVOS DE INCIDENCIA
// GET /api/incidencias/:id/archivos
// =====================================================
exports.listarArchivos = (req, res) => {
  const incidenciaId = parseInt(req.params.id, 10);
  
  if (!incidenciaId) {
    return res.status(400).json({ message: "ID de incidencia requerido" });
  }

  db.query("SELECT assigned_to FROM incidencias WHERE id = ?", [incidenciaId], (e0, r0) => {
    if (e0) {
      console.error(e0);
      return res.status(500).json({ message: "Error al validar incidencia" });
    }
    if (!r0.length) return res.status(404).json({ message: "Incidencia no encontrada" });
    if (!operadorPuedeGestionarEvidencia(req, r0[0].assigned_to)) {
      return res.status(404).json({ message: "Incidencia no encontrada" });
    }

  const sql = `
    SELECT 
      id,
      incidencia_id,
      filename,
      original_name,
      mime,
      size,
      uploaded_by,
      created_at
    FROM incidencia_archivos 
    WHERE incidencia_id = ?
    ORDER BY created_at DESC
  `;

  db.query(sql, [incidenciaId], (err, rows) => {
    if (err) {
      console.error("Error al listar archivos:", err);
      return res.status(500).json({ message: "Error al listar archivos" });
    }

    // Agregar validación de existencia de archivos físicos
    const fs = require('fs');
    const path = require('path');
    const uploadsPath = path.join(__dirname, '../../uploads');

    console.log('🔍 Verificando ruta de uploads:', uploadsPath);
    console.log('🔍 ¿Existe la carpeta uploads?', fs.existsSync(uploadsPath));

    const filesWithValidation = rows.map(row => {
      const filePathRoot = path.join(uploadsPath, row.filename);
      const filePathEvidencias = path.join(uploadsPath, "evidencias", row.filename);
      let exists = false;
      let urlPath = null;
      if (fs.existsSync(filePathRoot)) {
        exists = true;
        urlPath = `/uploads/${row.filename}`;
      } else if (fs.existsSync(filePathEvidencias)) {
        exists = true;
        urlPath = `/uploads/evidencias/${row.filename}`;
      }
      return {
        ...row,
        exists,
        urlPath
      };
    });

    return res.json(filesWithValidation);
  });
  });
};
