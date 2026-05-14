const express = require("express");
const router = express.Router();
const usuariosController = require("../controllers/usuarios.controller");
const { requireAuth, requireRoles } = require("../middleware/auth.middleware");

router.get(
  "/me",
  requireAuth,
  usuariosController.obtenerMiPerfil
);

router.put(
  "/me/avatar",
  requireAuth,
  usuariosController.actualizarMiAvatar
);

router.get(
  "/tecnicos",
  requireAuth,
  requireRoles("SUPERVISOR", "ADMIN"),
  usuariosController.listarTecnicos
);

module.exports = router;
