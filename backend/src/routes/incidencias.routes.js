const express = require("express");
const router = express.Router();
const incidenciasController = require("../controllers/incidencias.controller");
const {
  requireAuth,
  forbidConsultaMutation,
  requireRoles,
} = require("../middleware/auth.middleware");

router.use(requireAuth);
router.use(forbidConsultaMutation);

router.get("/resumen", incidenciasController.resumenIncidencias);
router.get("/", incidenciasController.listarIncidencias);
router.get("/:id/full", incidenciasController.obtenerIncidenciaFull);
router.get("/:id/historial", incidenciasController.obtenerHistorialPorIncidencia);
router.get("/:id", incidenciasController.obtenerIncidenciaPorId);

router.post("/", incidenciasController.crearIncidencia);
router.put(
  "/:id/asignar",
  requireRoles("SUPERVISOR", "ADMIN"),
  incidenciasController.asignarIncidencia
);
router.put("/:id/estatus", incidenciasController.cambiarEstatus);
router.post("/:id/seguimiento", incidenciasController.registrarSeguimiento);

module.exports = router;
