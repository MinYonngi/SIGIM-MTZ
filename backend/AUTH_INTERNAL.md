# Acceso interno SIGIM-MTZ

## Endpoints

- `POST /api/auth/login` — body JSON `{ "email", "password" }`; fija cookie `sigim.sid` (httpOnly).
- `POST /api/auth/logout` — destruye sesión.
- `GET /api/auth/me` — usuario actual (requiere sesión).

## Redirección tras login

- `OPERADOR` → `/tecnico` (panel técnico).
- `SUPERVISOR`, `ADMIN`, `QA`, `CONSULTA` → `/` (dashboard).

## Rutas HTML

- Portal ciudadano: `/ciudadano`.
- Login interno: `/login.html`.
- Sin sesión, `/`, `/dashboard.html` y `/tecnico.html` redirigen a `/login.html`.
- `OPERADOR` no puede usar el dashboard directo; otros roles no pueden abrir `tecnico.html` directo.

## Roles y permisos (resumen)

| Rol        | Panel por defecto | Notas |
|-----------|-------------------|--------|
| SUPERVISOR | Dashboard | Asignación vía API (`PUT .../asignar`). |
| ADMIN      | Dashboard | Misma entrada que supervisor hasta existir `/admin`. |
| OPERADOR   | Técnico | Lista/KPIs filtrados por `assigned_to` en backend. |
| QA         | Dashboard | Sin módulo exclusivo; permisos de API como usuario autenticado salvo restricciones futuras. |
| CONSULTA   | Dashboard | Solo lectura: middleware bloquea métodos que no sean GET en rutas API protegidas; en UI se oculta “Asignar”. |

## Semilla de usuarios

```bash
# .env: SEED_PASSWORD=tu_clave_temporal
npm run seed:users
```

Correos de ejemplo: `admin@sigim.local`, `operador@sigim.local`, etc. Requiere `UNIQUE` en `usuarios.email`.

## Producción (sesiones)

- `NODE_ENV=production` exige `SESSION_SECRET` con **al menos 32 caracteres**; el servidor no arranca sin él.
- Las sesiones usan **MySQL** (`express-mysql-session`, tabla `sessions`), no MemoryStore.
- Cookie `sigim.sid`: `httpOnly`, `sameSite=lax`, `secure` solo con HTTPS detrás de proxy con `trust proxy`.

## Catálogo (`/api/catalogo`) y portal ciudadano

- **`GET /api/catalogo/tipos-servicio` es público** (sin cookie de sesión interna) por requerimiento del Portal Ciudadano (`/ciudadano`). Devuelve solo tipos con `active = 1`, ordenados por nombre, en forma mínima: `{ id, nombre }`.
- **El resto de rutas bajo `/api/catalogo`** (p. ej. `GET /ping`) sigue **protegida** por `requireAuth` en el router; no asumir que todo el prefijo es privado sin mirar el orden de registro en `catalogo.routes.js`.
- **Mejora futura opcional:** exponer este listado en `GET /api/public/tipos-servicio` y dejar `/api/catalogo` solo para uso interno; eso implicaría actualizar el front del portal.

**Comprobaciones manuales recomendadas tras cambios en catálogo:**

1. Sin sesión: `GET /api/catalogo/tipos-servicio` → 200 y JSON `[{ id, nombre }, …]`.
2. Sin sesión: `GET /api/catalogo/ping` → 401.
3. `/ciudadano`: el select de tipos se llena sin mensaje de error por catálogo.
4. Con sesión: dashboard y técnico siguen cargando tipos desde la misma URL.

## Pendiente / no implementado

- **ADMIN**: no hay `admin.html` ni rutas `/admin`; el rol entra al dashboard.
- **QA**: no hay vista dedicada; mismo dashboard con políticas API genéricas.
- **CONSULTA**: restricción fuerte en API (`forbidConsultaMutation`); revisar que nuevas rutas mutables usen los mismos middlewares.
