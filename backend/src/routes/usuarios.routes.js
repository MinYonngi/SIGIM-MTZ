const express = require("express");
const router = express.Router();
const usuariosController = require("../controllers/usuarios.controller");
const { requireAuth, requireRoles } = require("../middleware/auth.middleware");

router.get(
  "/tecnicos",
  requireAuth,
  requireRoles("SUPERVISOR", "ADMIN"),
  usuariosController.listarTecnicos
);

module.exports = router;
