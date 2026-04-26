const express = require('express');
const router = express.Router();
const { upload, validatePublicIncidencia } = require('../middleware/publicValidation');
const { registrarIncidencia, consultarIncidencia } = require('../controllers/public.controller');

// POST /api/public/incidencias - Registrar incidencia pública
router.post('/incidencias', 
    upload.single('evidencia_foto'),
    validatePublicIncidencia,
    registrarIncidencia
);

// GET /api/public/incidencias/:folio - Consultar incidencia por folio
router.get('/incidencias/:folio', consultarIncidencia);

module.exports = router;
