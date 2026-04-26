const express = require("express");
const router = express.Router();
const archivosController = require("../controllers/archivos.controller");
const { requireAuth, forbidConsultaMutation } = require("../middleware/auth.middleware");

router.use(requireAuth);
router.use(forbidConsultaMutation);

router.post("/:id/archivos", archivosController.subirArchivo);
router.get("/:id/archivos", archivosController.listarArchivos);

module.exports = router;
