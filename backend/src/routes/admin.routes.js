const express = require("express");
const adminController = require("../controllers/admin.controller");
const { requireAuth, requireRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(requireAuth);
router.use(requireRoles("ADMIN"));

router.get("/health", adminController.health);
router.get("/dashboard", adminController.dashboard);

module.exports = router;
