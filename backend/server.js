require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");

const authRoutes = require("./src/routes/auth.routes");
const publicRoutes = require("./src/routes/public.routes");
const incidenciasRoutes = require("./src/routes/incidencias.routes");
const archivosRoutes = require("./src/routes/archivos.routes");
const catalogoRoutes = require("./src/routes/catalogo.routes");
const usuariosRoutes = require("./src/routes/usuarios.routes");
const reportesRoutes = require("./src/routes/reportes.routes");
const adminRoutes = require("./src/routes/admin.routes");
const pool = require("./src/config/db");
const db = pool.promise();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";

const FRONTEND_DIR = path.join(__dirname, "frontend");
const UPLOADS_DIR = path.join(__dirname, "uploads");

const requiredDbEnv = ["DB_HOST", "DB_USER", "DB_NAME"];
const missingDbEnv = requiredDbEnv.filter(
  (key) => !process.env[key] || String(process.env[key]).trim() === ""
);
if (missingDbEnv.length) {
  console.error("SIGIM-MTZ: faltan variables de entorno de base de datos:", missingDbEnv.join(", "));
  process.exit(1);
}

// =========================
// Seguridad base
// =========================
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

if (isProd) {
  app.set("trust proxy", 1);
}

// =========================
// SESSION_SECRET
// =========================
const rawSecret = process.env.SESSION_SECRET && String(process.env.SESSION_SECRET).trim();

if (isProd) {
  if (!rawSecret || rawSecret.length < 32) {
    console.error(
      "SIGIM-MTZ: en producción SESSION_SECRET es obligatorio y debe tener al menos 32 caracteres (p. ej. node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")."
    );
    process.exit(1);
  }
}

let sessionSecret = rawSecret;
if (!sessionSecret) {
  sessionSecret = "sigim-mtz-dev-only-session-secret";
  console.warn(
    "SIGIM-MTZ: SESSION_SECRET ausente o corto para desarrollo. Se usa secreto local. En producción use ≥32 caracteres aleatorios."
  );
} else if (!isProd && sessionSecret.length < 16) {
  console.error("SIGIM-MTZ: en desarrollo SESSION_SECRET debe tener al menos 16 caracteres si se define.");
  process.exit(1);
}

// =========================
// Store de sesiones (solo producción)
// =========================
let sessionStore = null;
if (isProd) {
  sessionStore = require("./src/config/session-store");
}

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use((req, res, next) => {
  const isMapaRoute =
    req.path === "/mapa.php" ||
    req.path === "/mapa" ||
    req.path === "/barras.php" ||
    req.path === "/barras";
  if (isMapaRoute) {
    // #region agent log
    try {
      if (typeof fetch === "function") {
        fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "dad803",
          },
          body: JSON.stringify({
            sessionId: "dad803",
            runId: "pre-fix",
            hypothesisId: "H1-H3",
            location: "backend/server.js:97",
            message: "Solicitud recibida para mapa",
            data: {
              method: req.method,
              path: req.path,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      }
    } catch (_) {}
    // #endregion

    res.on("finish", () => {
      // #region agent log
      try {
        if (typeof fetch === "function") {
          fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "dad803",
            },
            body: JSON.stringify({
              sessionId: "dad803",
              runId: "pre-fix",
              hypothesisId: "H1",
              location: "backend/server.js:126",
              message: "Respuesta final para ruta mapa",
              data: {
                path: req.path,
                statusCode: res.statusCode,
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
        }
      } catch (_) {}
      // #endregion
    });
  }
  next();
});

function buildBarrasHtml(metricas, errorConexion) {
  const safeMetricas = metricas.map((fila) => [
    String(fila[0] ?? "Sin estatus"),
    Number(fila[1] ?? 0),
  ]);
  const maxValue = Math.max(1, ...safeMetricas.map((fila) => fila[1]));
  const totalGeneral = safeMetricas.reduce((acc, [, total]) => acc + total, 0);
  const estatusMayor = safeMetricas[0]?.[0] || "Sin datos";
  const valorMayor = safeMetricas[0]?.[1] ?? 0;
  const palette = [
    ["#22d3ee", "#2563eb"],
    ["#f472b6", "#a855f7"],
    ["#f59e0b", "#ef4444"],
    ["#34d399", "#10b981"],
    ["#60a5fa", "#4f46e5"],
    ["#f97316", "#ec4899"],
  ];

  const barsHtml = safeMetricas
    .map(([estatus, total], index) => {
      const percent = Math.max(2, Math.round((total / maxValue) * 100));
      const [from, to] = palette[index % palette.length];
      const safeLabel = estatus
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

      return `
      <div class="row">
        <div class="row-head">
          <span class="name">${safeLabel}</span>
          <span class="value">${total}</span>
        </div>
        <div class="track">
          <div class="bar" style="width:${percent}%;--from:${from};--to:${to};"></div>
        </div>
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gráfica Premium de Barras | SIGIM-MTZ</title>
  <style>
    :root {
      --bg-main: #0b1020;
      --bg-card: rgba(14, 23, 44, 0.78);
      --text-main: #eef4ff;
      --text-subtle: #a8b5d1;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Inter", "Segoe UI", Tahoma, sans-serif;
      color: var(--text-main);
      background:
        radial-gradient(circle at 10% 10%, #4f46e5 0%, transparent 40%),
        radial-gradient(circle at 85% 20%, #0ea5e9 0%, transparent 35%),
        radial-gradient(circle at 50% 100%, #9333ea 0%, transparent 55%),
        var(--bg-main);
      display: grid;
      place-items: center;
      padding: 26px;
    }

    .page {
      width: min(1160px, 100%);
    }

    .card {
      background: var(--bg-card);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 22px;
      backdrop-filter: blur(12px);
      box-shadow:
        0 28px 45px rgba(8, 12, 24, 0.58),
        inset 0 1px 0 rgba(255, 255, 255, 0.18);
      padding: 22px;
      overflow: hidden;
      position: relative;
    }

    .header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .title {
      margin: 0;
      font-size: clamp(1.35rem, 1.9vw, 1.8rem);
      font-weight: 900;
    }

    .subtitle {
      margin: 8px 0 0;
      color: var(--text-subtle);
      font-size: 0.96rem;
    }

    .stats {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .stat {
      min-width: 160px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(3, 10, 27, 0.44);
    }

    .stat .label {
      display: block;
      color: var(--text-subtle);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 5px;
    }

    .stat .value {
      font-size: 1.15rem;
      font-weight: 800;
    }

    .chart-box {
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(180deg, rgba(10, 18, 36, 0.7) 0%, rgba(8, 13, 28, 0.9) 100%);
      padding: 16px;
    }

    .row {
      margin-bottom: 14px;
    }

    .row-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 7px;
      gap: 10px;
    }

    .name {
      font-size: 0.9rem;
      color: #dbeafe;
      font-weight: 700;
    }

    .value {
      font-size: 0.9rem;
      color: #ffffff;
      font-weight: 800;
    }

    .track {
      height: 18px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .bar {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--from), var(--to));
      box-shadow:
        0 0 18px color-mix(in srgb, var(--to) 45%, transparent),
        inset 0 -2px 3px rgba(0, 0, 0, 0.2);
      transition: width 0.6s ease;
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="card">
      <div class="header">
        <div>
          <h1 class="title">Gráfica Premium de Incidencias</h1>
          <p class="subtitle">Distribución de incidencias por estatus con datos en tiempo real.</p>
        </div>
        <div class="stats">
          <div class="stat">
            <span class="label">Total incidencias</span>
            <span class="value">${totalGeneral}</span>
          </div>
          <div class="stat">
            <span class="label">Estatus principal</span>
            <span class="value">${estatusMayor} (${valorMayor})</span>
          </div>
        </div>
      </div>
      <div class="chart-box">
        ${barsHtml}
      </div>
      ${errorConexion ? `<p style="margin-top:10px;color:#fecaca;font-size:0.84rem;">Aviso: no se pudo conectar a la base de datos. Se muestra información base.</p>` : ""}
    </section>
  </div>
</body>
</html>`;
}

function buildGraficaEstatusHtml(metricas, errorConexion) {
  const safeMetricas = metricas.map((fila) => [
    String(fila[0] ?? "SIN_DATO"),
    Math.max(0, Number(fila[1] ?? 0)),
  ]);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Grafica 3D SIGIM-MTZ</title>
  <script src="https://www.gstatic.com/charts/loader.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      background: #ffffff;
      color: #0f172a;
      padding: 12px;
    }
    .container { max-width: 1120px; margin: 0 auto; }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: end;
      margin-bottom: 12px;
    }
    .field { display: grid; gap: 4px; }
    .field label {
      font-size: 12px;
      color: #475569;
      font-weight: 600;
    }
    select, button {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 8px 10px;
      background: #fff;
      font-size: 13px;
    }
    button { cursor: pointer; font-weight: 600; }
    .kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(180px, 1fr));
      gap: 10px;
      margin-bottom: 10px;
    }
    .kpi {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .kpi .label { font-size: 12px; color: #64748b; }
    .kpi .value {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 4px;
    }
    .insight {
      margin: 8px 0 12px;
      color: #334155;
      font-size: 14px;
    }
    .warn {
      margin: 0 0 10px;
      border: 1px solid #fecdd3;
      background: #fff1f2;
      color: #9f1239;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 13px;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 240px;
      gap: 12px;
      align-items: start;
    }
    .chart-wrap {
      display: flex;
      justify-content: center;
    }
    #piechart_3d {
      width: min(100%, 860px);
      height: clamp(340px, 60vh, 560px);
    }
    .legend {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 8px;
      background: #fff;
    }
    .legend h3 {
      margin: 2px 4px 8px;
      font-size: 13px;
      color: #334155;
    }
    .legend-list { display: grid; gap: 6px; }
    .legend-btn {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      padding: 6px 8px;
      text-align: left;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex: 0 0 10px;
    }
    .legend-btn.off {
      opacity: .45;
      text-decoration: line-through;
    }
    @media (max-width: 980px) {
      .layout { grid-template-columns: 1fr; }
      .kpis { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
<div class="container">
  <div class="toolbar">
    <div class="field">
      <label for="sliceTextMode">Texto en porcion</label>
      <select id="sliceTextMode">
        <option value="value">Valor</option>
        <option value="percentage">Porcentaje</option>
      </select>
    </div>
  </div>

  ${errorConexion ? `<p class="warn">No se pudo conectar a la base de datos. Se muestra una referencia minima para que la vista no falle.</p>` : ""}

  <section class="kpis">
    <article class="kpi"><div class="label">Total visible</div><div id="kpiTotal" class="value">0</div></article>
    <article class="kpi"><div class="label">Categoria principal</div><div id="kpiTop" class="value">-</div></article>
    <article class="kpi"><div class="label">Categorias activas</div><div id="kpiCount" class="value">0</div></article>
  </section>
  <p id="insight" class="insight">Cargando informacion...</p>

  <section class="layout">
    <div class="chart-wrap"><div id="piechart_3d"></div></div>
    <aside class="legend">
      <h3>Leyenda interactiva</h3>
      <div id="legendList" class="legend-list"></div>
    </aside>
  </section>
</div>

<script>
  google.charts.load("current", { packages: ["corechart"] });
  google.charts.setOnLoadCallback(initChart);

  const rowsRaw = ${JSON.stringify(safeMetricas)};
  const rows = rowsRaw.map((row, index) => ({
    index,
    label: String(row[0] || "SIN_DATO"),
    value: Math.max(0, Number(row[1] || 0))
  }));

  const statusPalette = {
    NUEVA: "#2962FF",
    ASIGNADA: "#FF6D00",
    EN_PROCESO: "#FF1744",
    RESUELTA: "#00C853",
    CERRADA: "#00B8D4",
    RECHAZADA: "#D500F9"
  };
  const fallbackPalette = ["#FFD600", "#00E5FF", "#76FF03", "#FF4081", "#651FFF", "#00BFA5", "#FF9100", "#C6FF00"];

  let chart = null;
  let chartData = null;
  let visibleRowsCache = [];
  const SLICE_HOVER_OFFSET = 0.11;
  let selectedOriginalIndex = -1;
  let hoverOriginalIndex = -1;
  let hiddenIndexes = new Set();
  let resizeTimer = null;
  // #region agent log
  fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"bf3843"},body:JSON.stringify({sessionId:"bf3843",runId:"pre-fix-1",hypothesisId:"H1",location:"backend/server.js:init-vars",message:"Initial chart state",data:{selectedOriginalIndex,hoverOriginalIndex,rowsCount:rows.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  function normalizeKey(str) {
    return String(str || "")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replace(/\\s+/g, "_")
      .toUpperCase();
  }

  function getColor(label, i) {
    const key = normalizeKey(label);
    if (statusPalette[key]) return statusPalette[key];
    return fallbackPalette[i % fallbackPalette.length];
  }

  function getVisibleRows() {
    const active = rows.filter((r) => !hiddenIndexes.has(r.index));
    if (active.length === 0) {
      return [{ index: -1, label: "Sin datos", value: 1, synthetic: true }];
    }
    return active;
  }

  function getResponsiveOptions() {
    const w = window.innerWidth || document.documentElement.clientWidth;
    if (w <= 640) return { chartArea: { width: "94%", height: "78%" } };
    if (w <= 992) return { chartArea: { width: "90%", height: "80%" } };
    return { chartArea: { width: "88%", height: "82%" } };
  }

  function buildGoogleData(visibleRows) {
    const total = visibleRows.reduce((acc, r) => acc + r.value, 0);
    const data = new google.visualization.DataTable();
    data.addColumn("string", "Categoria");
    data.addColumn("number", "Total");
    data.addColumn({ type: "string", role: "tooltip" });

    visibleRows.forEach((row) => {
      const pct = total > 0 ? ((row.value / total) * 100).toFixed(1) : "0.0";
      const tooltip = row.label + "\\nTotal: " + row.value + "\\nPorcentaje: " + pct + "%";
      data.addRow([row.label, row.value, tooltip]);
    });

    return { data, total };
  }

  function animateNumber(el, target) {
    const from = Number((el.dataset.value || "0").replace(/,/g, "")) || 0;
    const duration = 550;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const val = Math.round(from + (target - from) * p);
      el.textContent = val.toLocaleString("es-MX");
      el.dataset.value = String(val);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function updateDidacticInfo(visibleRows, total) {
    const top = [...visibleRows].sort((a, b) => b.value - a.value)[0];
    const topPct = total > 0 ? ((top.value / total) * 100).toFixed(1) : "0.0";
    animateNumber(document.getElementById("kpiTotal"), total);
    animateNumber(document.getElementById("kpiCount"), visibleRows.filter((r) => r.index >= 0).length);
    document.getElementById("kpiTop").textContent = top.label + " (" + top.value.toLocaleString("es-MX") + ")";
    document.getElementById("insight").textContent =
      "Categoria con mayor peso: " + top.label + " con " + top.value.toLocaleString("es-MX") + " incidencias (" + topPct + "%).";
  }

  function renderLegend() {
    const legend = document.getElementById("legendList");
    legend.innerHTML = "";
    rows.forEach((row, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legend-btn" + (hiddenIndexes.has(row.index) ? " off" : "");
      btn.innerHTML = '<span class="dot" style="background:' + getColor(row.label, i) + '"></span><span>' + row.label + " (" + row.value + ")</span>";
      btn.addEventListener("click", () => {
        if (hiddenIndexes.has(row.index)) hiddenIndexes.delete(row.index);
        else hiddenIndexes.add(row.index);
        if (hiddenIndexes.has(selectedOriginalIndex)) {
          const first = getVisibleRows().find((r) => r.index >= 0);
          selectedOriginalIndex = first ? first.index : -1;
        }
        // #region agent log
        fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"bf3843"},body:JSON.stringify({sessionId:"bf3843",runId:"pre-fix-1",hypothesisId:"H3",location:"backend/server.js:legend-click",message:"Legend click updated hidden/selected",data:{clickedIndex:row.index,selectedOriginalIndex,hiddenCount:hiddenIndexes.size},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        drawChart(true);
      });
      btn.addEventListener("mouseenter", () => {
        hoverOriginalIndex = row.index;
        drawChart(false);
      });
      btn.addEventListener("mouseleave", () => {
        hoverOriginalIndex = -1;
        drawChart(false);
      });
      legend.appendChild(btn);
    });
  }

  function drawChart(withAnimation = true) {
    const visibleRows = getVisibleRows();
    visibleRowsCache = visibleRows;
    const built = buildGoogleData(visibleRows);
    chartData = built.data;
    const total = built.total;

    const responsive = getResponsiveOptions();
    const sliceText = document.getElementById("sliceTextMode").value;
    const slices = {};
    const colors = [];
    visibleRows.forEach((row, i) => {
      colors.push(getColor(row.label, i));
      const isHover = row.index === hoverOriginalIndex;
      slices[i] = { offset: isHover ? SLICE_HOVER_OFFSET : 0 };
    });
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"bf3843"},body:JSON.stringify({sessionId:"bf3843",runId:"pre-fix-1",hypothesisId:"H1",location:"backend/server.js:drawChart-slices",message:"Slices offsets computed",data:{selectedOriginalIndex,hoverOriginalIndex,offsets:visibleRows.map((row,idx)=>({idx,originalIndex:row.index,offset:slices[idx].offset}))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"bf3843"},body:JSON.stringify({sessionId:"bf3843",runId:"post-fix-verify",hypothesisId:"H5",location:"backend/server.js:drawChart-offset-policy",message:"Offset policy snapshot",data:{hoverOffset:SLICE_HOVER_OFFSET,nonZeroCount:visibleRows.reduce((n,r,i)=>n+(slices[i].offset>0?1:0),0),hoverOriginalIndex,selectedOriginalIndex},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const options = {
      title: "Incidencias por estatus",
      is3D: true,
      pieSliceText: sliceText,
      chartArea: responsive.chartArea,
      legend: { position: "none" },
      tooltip: { text: "both" },
      colors,
      slices,
      animation: withAnimation ? { startup: true, duration: 900, easing: "out" } : null
    };

    if (!chart) {
      chart = new google.visualization.PieChart(document.getElementById("piechart_3d"));
      google.visualization.events.addListener(chart, "select", () => {
        const sel = chart.getSelection();
        if (!sel.length || sel[0].row == null) {
          chart.setSelection([]);
          return;
        }
        const picked = visibleRowsCache[sel[0].row];
        if (!picked || picked.index < 0) {
          chart.setSelection([]);
          return;
        }
        // #region agent log
        fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"bf3843"},body:JSON.stringify({sessionId:"bf3843",runId:"pre-fix-1",hypothesisId:"H2",location:"backend/server.js:chart-select",message:"Chart selection persisted",data:{selectedRow:sel[0].row,pickedIndex:picked.index,hoverOriginalIndex},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        // #region agent log
        fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"bf3843"},body:JSON.stringify({sessionId:"bf3843",runId:"post-fix-verify",hypothesisId:"H6",location:"backend/server.js:chart-select-clear",message:"Cleared chart selection after click",data:{pickedIndex:picked.index},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        chart.setSelection([]);
      });
      google.visualization.events.addListener(chart, "onmouseover", (e) => {
        if (!e || e.row == null) return;
        const hovered = visibleRowsCache[e.row];
        if (!hovered || hovered.index < 0) return;
        hoverOriginalIndex = hovered.index;
        // #region agent log
        fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"bf3843"},body:JSON.stringify({sessionId:"bf3843",runId:"pre-fix-1",hypothesisId:"H4",location:"backend/server.js:chart-mouseover",message:"Chart mouseover",data:{eventRow:e.row,hoverOriginalIndex,selectedOriginalIndex},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        drawChart(false);
      });
      google.visualization.events.addListener(chart, "onmouseout", () => {
        hoverOriginalIndex = -1;
        // #region agent log
        fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"bf3843"},body:JSON.stringify({sessionId:"bf3843",runId:"pre-fix-1",hypothesisId:"H4",location:"backend/server.js:chart-mouseout",message:"Chart mouseout reset hover",data:{hoverOriginalIndex,selectedOriginalIndex},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        drawChart(false);
      });
    }

    chart.draw(chartData, options);
    renderLegend();
    updateDidacticInfo(visibleRows, total);
  }

  function initChart() {
    document.getElementById("sliceTextMode").addEventListener("change", () => drawChart(true));
    document.getElementById("piechart_3d").addEventListener("mouseenter", () => drawChart(true));
    document.getElementById("piechart_3d").addEventListener("click", () => drawChart(true));

    drawChart(true);

    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => drawChart(false), 140);
    });
  }
</script>
</body>
</html>`;
}

const sessionConfig = {
  name: "sigim.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
  },
};

if (sessionStore) {
  sessionConfig.store = sessionStore;
}

app.use(session(sessionConfig));

function attachUser(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = {
      id: req.session.userId,
      role: req.session.role,
      name: req.session.name,
      email: req.session.email,
    };
  }
  next();
}
app.use(attachUser);

app.use((req, res, next) => {
  const tracked = new Set(["/admin.html", "/dashboard.html", "/admin/perfil", "/supervisor/perfil", "/mi-perfil"]);
  if (!tracked.has(req.path)) return next();

  // #region agent log
  fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "50f0eb" },
    body: JSON.stringify({
      sessionId: "50f0eb",
      runId: "diagnostic-2",
      hypothesisId: "H7",
      location: "server.js:trackedRequest",
      message: "Request a ruta interna protegida",
      data: {
        method: req.method,
        path: req.path,
        sessionUserId: req.session && req.session.userId ? req.session.userId : null,
        sessionRole: req.session && req.session.role ? req.session.role : null,
        sessionEmail: req.session && req.session.email ? req.session.email : null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  res.on("finish", () => {
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "50f0eb" },
      body: JSON.stringify({
        sessionId: "50f0eb",
        runId: "diagnostic-2",
        hypothesisId: "H7",
        location: "server.js:trackedResponse",
        message: "Response de ruta interna protegida",
        data: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          locationHeader: res.getHeader("location") || null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  });

  return next();
});

app.use((req, res, next) => {
  const monitoredPaths = new Set([
    "/admin/perfil",
    "/supervisor/perfil",
    "/tecnico/perfil",
    "/mi-perfil",
    "/css/styles.css",
    "/css/perfil.css",
    "/js/perfil.js",
    "/assets/escudo.png",
    "/assets/Logo.png",
    "/assets/SIGIM-MTZ.png",
    "/api/auth/me",
    "/api/usuarios/me",
  ]);

  if (!monitoredPaths.has(req.path)) {
    return next();
  }

  // #region agent log
  fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "ea37ae",
    },
    body: JSON.stringify({
      sessionId: "ea37ae",
      runId: "pre-fix-1",
      hypothesisId: "H2",
      location: "backend/server.js:monitored:request",
      message: "Solicitud a ruta monitoreada",
      data: {
        method: req.method,
        path: req.path,
        hasSession: Boolean(req.session && req.session.userId),
        role: req.session && req.session.role ? req.session.role : null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  res.on("finish", () => {
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "ea37ae",
      },
      body: JSON.stringify({
        sessionId: "ea37ae",
        runId: "pre-fix-1",
        hypothesisId: "H2",
        location: "backend/server.js:monitored:response",
        message: "Respuesta de ruta monitoreada",
        data: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          locationHeader: res.getHeader("location") || null,
          contentType: res.getHeader("content-type") || null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  });

  return next();
});

// Roles internos permitidos
function isInternalRole(role) {
  return ["ADMIN", "SUPERVISOR", "OPERADOR"].includes(role);
}

function canViewDashboard(role) {
  return role === "SUPERVISOR";
}

function canViewTecnico(role) {
  return role === "OPERADOR";
}

function canViewSupervisorProfile(role) {
  return role === "SUPERVISOR";
}

function canViewAdminProfile(role) {
  return role === "ADMIN";
}

function profileRouteByRole(role) {
  if (role === "ADMIN") return "/admin/perfil";
  if (role === "SUPERVISOR") return "/supervisor/perfil";
  if (role === "OPERADOR") return "/tecnico/perfil";
  return "/mi-perfil";
}

function redirectByRole(req, res) {
  const role = req.session && req.session.role;
  if (role === "ADMIN") return res.redirect("/admin.html");
  if (role === "SUPERVISOR") return res.redirect("/dashboard.html");
  if (canViewTecnico(role)) {
    return res.redirect("/tecnico");
  }
  return res.redirect("/login.html");
}

function redirectUnauthenticated(req, res) {
  return res.redirect("/login.html");
}

function protectInternalHtml(target) {
  return (req, res, next) => {
    const sessionUser = req.session;
    if (!sessionUser || !sessionUser.userId) {
      return redirectUnauthenticated(req, res);
    }
    const role = sessionUser.role;
    if (target === "dashboard" && !canViewDashboard(role)) {
      return redirectByRole(req, res);
    }
    if (target === "tecnico" && !canViewTecnico(role)) {
      return redirectByRole(req, res);
    }
    if (target === "perfil" && !isInternalRole(role)) {
      return redirectByRole(req, res);
    }
    if (target === "supervisorPerfil" && !canViewSupervisorProfile(role)) {
      return redirectByRole(req, res);
    }
    if (target === "tecnicoPerfil" && !canViewTecnico(role)) {
      return redirectByRole(req, res);
    }
    if (target === "adminPerfil" && !canViewAdminProfile(role)) {
      return redirectByRole(req, res);
    }
    next();
  };
}

function requireSession(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).type("text/plain").send("No autorizado. Inicia sesión en /login.html");
}

async function renderBarrasPhp(req, res) {
  let metricas = [];
  let errorConexion = null;

  // #region agent log
  try {
    if (typeof fetch === "function") {
      fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "dad803",
        },
        body: JSON.stringify({
          sessionId: "dad803",
          runId: "post-fix-2",
          hypothesisId: "H7",
          location: "backend/server.js:renderBarrasPhp:start",
          message: "Intentando renderizar mapa desde Node",
          data: {
            route: req.path,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
  } catch (_) {}
  // #endregion

  try {
    const sql = `
      SELECT estatus, COUNT(*) AS total
      FROM incidencias
      GROUP BY estatus
      ORDER BY total DESC
    `;
    const [rows] = await db.query(sql);
    metricas = rows.map((row) => {
      const estatus = String(row.estatus ?? "").trim() || "Sin estatus";
      return [estatus, Number(row.total ?? 0)];
    });
  } catch (err) {
    errorConexion = err;
  }

  if (metricas.length === 0) {
    metricas = [
      ["NUEVA", 0],
      ["ASIGNADA", 0],
      ["EN_PROCESO", 0],
      ["RESUELTA", 0],
      ["CERRADA", 0],
    ];
  }

  const html = buildBarrasHtml(metricas, Boolean(errorConexion));

  // #region agent log
  try {
    if (typeof fetch === "function") {
      fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "dad803",
        },
        body: JSON.stringify({
          sessionId: "dad803",
          runId: "post-fix-2",
          hypothesisId: "H7",
          location: "backend/server.js:renderBarrasPhp:end",
          message: "Mapa renderizado con Node",
          data: {
            route: req.path,
            usedFallback: metricas.length === 5 && metricas[0][1] === 0 && Boolean(errorConexion),
            hasDbError: Boolean(errorConexion),
            htmlLength: html.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
  } catch (_) {}
  // #endregion

  return res.type("text/html; charset=utf-8").status(200).send(html);
}

async function renderGraficaEstatusPhp(req, res) {
  let metricas = [];
  let errorConexion = null;

  try {
    const sql = `
      SELECT COALESCE(NULLIF(TRIM(estatus), ''), 'SIN_ESTATUS') AS etiqueta, COUNT(*) AS total
      FROM incidencias
      GROUP BY etiqueta
      ORDER BY total DESC, etiqueta ASC
    `;
    const [rows] = await db.query(sql);
    metricas = rows.map((row) => {
      const etiqueta = String(row.etiqueta ?? "").trim() || "SIN_DATO";
      return [etiqueta, Math.max(0, Number(row.total ?? 0))];
    });
  } catch (err) {
    errorConexion = err;
  }

  if (metricas.length === 0) {
    metricas = [[errorConexion ? "Error de conexion" : "Sin datos", 1]];
  }

  const html = buildGraficaEstatusHtml(metricas, Boolean(errorConexion));
  return res.type("text/html; charset=utf-8").status(200).send(html);
}

// =========================
// Health
// =========================
app.get("/ping", (req, res) => {
  res.status(200).json({ ok: true, pong: true });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "SIGIM-MTZ",
    env: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    time: new Date().toISOString(),
  });
});

if (!isProd) {
  app.get("/test-env", (req, res) => {
    if (!req.session || !req.session.userId || req.session.role !== "ADMIN") {
      return res.status(403).json({ error: "Acceso restringido a administradores." });
    }
    res.json({
      DB_HOST: process.env.DB_HOST || null,
      DB_USER: process.env.DB_USER || null,
      DB_NAME: process.env.DB_NAME || null,
      DB_PORT: process.env.DB_PORT || null,
      NODE_ENV: process.env.NODE_ENV || "development",
      HAS_SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
    });
  });
}

// =========================
// Estáticos públicos (CSS/JS/assets para HTML en /, /login.html, /ciudadano, etc.)
// =========================
app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/assets", express.static(path.join(FRONTEND_DIR, "assets")));
app.use("/css", express.static(path.join(FRONTEND_DIR, "css")));
app.use("/js", express.static(path.join(FRONTEND_DIR, "js")));

// =========================
// Portal ciudadano y login
// =========================
app.get("/ciudadano.html", (req, res) => {
  res.status(404).type("text/plain").send("Usa /ciudadano");
});

app.get("/ciudadano", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "ciudadano.html"));
});

app.get("/login.html", (req, res) => {
  if (req.session && req.session.userId) {
    return redirectByRole(req, res);
  }
  res.sendFile(path.join(FRONTEND_DIR, "login.html"));
});

// =========================
// Paneles HTML (sesión + rol)
// =========================
app.get("/dashboard.html", protectInternalHtml("dashboard"), (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "dashboard.html"));
});

app.get("/admin.html", (req, res) => {
  if (!req.session || !req.session.userId) {
    return redirectUnauthenticated(req, res);
  }
  if (req.session.role !== "ADMIN") {
    return redirectByRole(req, res);
  }
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"));
});

app.get("/tecnico.html", protectInternalHtml("tecnico"), (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "tecnico.html"));
});

app.get("/perfil.html", (req, res) => {
  res.redirect(302, "/mi-perfil");
});

app.get("/supervisor/perfil", protectInternalHtml("supervisorPerfil"), (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "perfil.html"));
});

app.get("/tecnico/perfil", protectInternalHtml("tecnicoPerfil"), (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "perfil.html"));
});

app.get("/admin/perfil", protectInternalHtml("adminPerfil"), (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "perfil.html"));
});

app.get("/mi-perfil", protectInternalHtml("perfil"), (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "perfil.html"));
});

app.get("/", (req, res) => {
  if (!req.session || !req.session.userId) {
    return redirectUnauthenticated(req, res);
  }
  if (req.session.role === "ADMIN") {
    return res.redirect("/admin.html");
  }
  if (!canViewDashboard(req.session.role)) {
    return redirectByRole(req, res);
  }
  res.sendFile(path.join(FRONTEND_DIR, "dashboard.html"));
});

app.get("/tecnico", (req, res) => {
  if (!req.session || !req.session.userId) {
    return redirectUnauthenticated(req, res);
  }
  if (!canViewTecnico(req.session.role)) {
    return redirectByRole(req, res);
  }
  res.sendFile(path.join(FRONTEND_DIR, "tecnico.html"));
});

app.get("/barras.php", requireSession, renderBarrasPhp);
app.get("/barras", requireSession, renderBarrasPhp);
app.get("/grafica_estatus.php", requireSession, (req, res, next) => {
  if (Object.keys(req.query || {}).length > 0) {
    return res.redirect(302, "/grafica_estatus.php");
  }
  return renderGraficaEstatusPhp(req, res, next);
});
app.get("/grafica_estatus", requireSession, (req, res) => res.redirect(302, "/grafica_estatus.php"));
app.get("/mapa.php", (req, res) => res.redirect(302, "/barras.php"));
app.get("/mapa", (req, res) => res.redirect(302, "/barras"));
app.get("/backend/frontend/grafica_estatus.php", (req, res) => res.redirect(302, "/grafica_estatus.php"));
app.get("/backend/frontend/barras.php", (req, res) => res.redirect(302, "/barras.php"));
app.get("/SIGIM-MTZ/backend/frontend/grafica_estatus.php", (req, res) => res.redirect(302, "/grafica_estatus.php"));
app.get("/SIGIM-MTZ/backend/frontend/barras.php", (req, res) => res.redirect(302, "/barras.php"));

// =========================
// API (auth y público sin requireAuth en router; el resto lleva middleware en cada router)
// =========================
app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/incidencias", incidenciasRoutes);
app.use("/api/incidencias", archivosRoutes);
app.use("/api/catalogo", catalogoRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/reportes", reportesRoutes);
app.use("/api/admin", adminRoutes);

// 404 API
app.use("/api", (req, res) => {
  res.status(404).json({
    code: "NOT_FOUND",
    message: "Ruta API no encontrada",
  });
});

// JSON inválido
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({
      code: "INVALID_JSON",
      message: "El cuerpo de la petición no es JSON válido",
    });
  }
  next(err);
});

// Errores no capturados
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.statusCode || err.status || 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({
    code: err.code || "INTERNAL_ERROR",
    message: isProd ? "Error interno del servidor" : err.message,
  });
});

async function start() {
  try {
    if (sessionStore && typeof sessionStore.onReady === "function") {
      await sessionStore.onReady();
      console.log("SIGIM-MTZ: session store MySQL listo");
    }
    app.listen(PORT, () => {
      console.log(`SIGIM-MTZ en puerto ${PORT} — entorno: ${process.env.NODE_ENV || "development"}`);
      console.log("Rutas auth: /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/health");
    });
  } catch (err) {
    console.error("SIGIM-MTZ: error al iniciar session store o servidor:", err);
    process.exit(1);
  }
}

start();
