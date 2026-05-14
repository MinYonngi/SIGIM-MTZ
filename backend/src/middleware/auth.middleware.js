/**
 * Autenticación por sesión (SIGIM-MTZ).
 * Roles internos: ADMIN, OPERADOR, SUPERVISOR.
 */

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      message: "No autenticado",
      code: "UNAUTHENTICATED",
    });
  }
  req.user = {
    id: req.session.userId,
    role: req.session.role,
    name: req.session.name,
    email: req.session.email,
  };
  next();
}

function forbidConsultaMutation(req, res, next) {
  // Compatibilidad: se mantiene el middleware en rutas existentes.
  // Con el esquema actual de tres roles no aplica restricción de solo lectura por rol.
  next();
}

function requireRoles(...allowed) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado", code: "UNAUTHENTICATED" });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        message: "No tiene permiso para esta acción",
        code: "FORBIDDEN_ROLE",
      });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  forbidConsultaMutation,
  requireRoles,
};
