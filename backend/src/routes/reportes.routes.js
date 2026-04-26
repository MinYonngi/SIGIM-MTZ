const express = require("express");
const router = express.Router();
const reportesController = require("../controllers/reportes.controller");
const { requireAuth, forbidConsultaMutation } = require("../middleware/auth.middleware");

router.use(requireAuth);
router.use(forbidConsultaMutation);

router.get("/digitalizacion", reportesController.reporteDigitalizacion);
router.get("/tiempo-respuesta", reportesController.reporteTiempoRespuesta);

module.exports = router;
