const API = "/api";

const els = {
  total: document.getElementById("kpi-total"),
  nuevas: document.getElementById("kpi-nuevas"),
  asignadas: document.getElementById("kpi-asignadas"),
  enproceso: document.getElementById("kpi-enproceso"),
  cerradas: document.getElementById("kpi-cerradas"),

  tbody: document.getElementById("tbody-incidencias"),
  btnRecargar: document.getElementById("btn-recargar"),
  filtroFolio: document.getElementById("filtro-inc-folio"),
  filtroEstatus: document.getElementById("filtro-inc-estatus"),
  filtroTipo: document.getElementById("filtro-inc-tipo"),
  filtroPrioridad: document.getElementById("filtro-inc-prioridad"),
  filtroFecha: document.getElementById("filtro-inc-fecha"),
  btnBuscarIncidencias: document.getElementById("btn-buscar-incidencias"),

  modalFolio: document.getElementById("modal-folio"),
  selectTecnicos: document.getElementById("select-tecnicos"),
  inputComentario: document.getElementById("input-comentario"),
  btnAsignar: document.getElementById("btn-asignar"),

  lblLoading: document.getElementById("lbl-loading"),

  toastOk: document.getElementById("toastOk"),
  toastOkMsg: document.getElementById("toastOkMsg"),
};

let currentIncidencia = null;
let bsModal = null;
let bsToast = null;
const chartRefs = {};
let incidenciasCache = [];

// ✅ NUEVO: diccionario para convertir tipo_servicio_id -> nombre
let catalogoMap = {};
let currentUser = null;

function pintarUsuarioTopbar(user) {
  const nameEl = document.getElementById("topbar-user-name");
  const roleEl = document.getElementById("topbar-user-role");
  if (nameEl) nameEl.textContent = user?.name || "Supervisor";
  if (roleEl) roleEl.textContent = user?.role || "Panel Interno";
}

function setLoading(isLoading) {
  if (!els.lblLoading) return;
  els.lblLoading.classList.toggle("d-none", !isLoading);
  els.btnRecargar.disabled = !!isLoading;
}

function showToast(msg, type = 'info') {
  if (!els.toastOk) return alert(msg);
  if (!bsToast) bsToast = bootstrap.Toast.getOrCreateInstance(els.toastOk, { delay: 2200 });
  els.toastOkMsg.textContent = msg;
  
  // Actualizar clase según tipo
  els.toastOk.className = `toast align-items-center text-white bg-${type === 'success' ? 'success' : type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : 'info'} border-0`;
  
  bsToast.show();
}

function statusClass(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("cerr")) return "badge-ok";
  if (t.includes("nuev")) return "badge-warn";
  if (t.includes("proceso")) return "badge-warn";
  return "";
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ");
}

function badgeStatus(text) {
  const label = String(text || "");
  const normalized = normalizeLabel(label);
  let cls = "status-otro";
  if (normalized.includes("nueva")) cls = "status-nueva";
  else if (normalized.includes("asign")) cls = "status-asignada";
  else if (normalized.includes("proceso")) cls = "status-en-proceso";
  else if (normalized.includes("resuelt")) cls = "status-resuelta";
  else if (normalized.includes("cerrad")) cls = "status-cerrada";

  return `<span class="badge-chip badge-chip-status ${cls}">${label || "-"}</span>`;
}

function badgePrioridad(text) {
  const label = String(text || "");
  const normalized = normalizeLabel(label);
  let cls = "prio-otro";
  let icon = "bi-dot";
  if (normalized.includes("alta")) {
    cls = "prio-alta";
    icon = "bi-exclamation-diamond-fill";
  } else if (normalized.includes("media")) {
    cls = "prio-media";
    icon = "bi-dash-circle-fill";
  } else if (normalized.includes("baja")) {
    cls = "prio-baja";
    icon = "bi-check-circle-fill";
  }

  return `<span class="badge-chip badge-chip-priority ${cls}"><i class="bi ${icon}" aria-hidden="true"></i>${label || "-"}</span>`;
}

function destroyChart(key) {
  if (chartRefs[key]) {
    chartRefs[key].destroy();
    chartRefs[key] = null;
  }
}

function renderChart(key, canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  destroyChart(key);
  chartRefs[key] = new Chart(canvas.getContext("2d"), config);
}

function aggregateCounts(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    const raw = getKey(item);
    const key = String(raw || "Sin dato").trim() || "Sin dato";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function toChartArrays(countMap) {
  const labels = Array.from(countMap.keys());
  const data = Array.from(countMap.values());
  if (!labels.length) return { labels: ["Sin datos"], data: [0] };
  return { labels, data };
}

function buildTrendLast7Days(items) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - idx));
    return d;
  });

  const labels = days.map((d) =>
    d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" })
  );
  const counts = new Array(7).fill(0);
  const indexByDate = new Map(days.map((d, i) => [d.toISOString().slice(0, 10), i]));

  items.forEach((i) => {
    const raw = i.fecha_creacion || i.created_at || i.fecha;
    if (!raw) return;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return;
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
    const idx = indexByDate.get(key);
    if (idx != null) counts[idx] += 1;
  });

  return { labels, data: counts };
}

function renderSupervisorCharts(items) {
  if (typeof Chart === "undefined") return;

  const estatusMap = aggregateCounts(items, (i) => {
    const label = String(i.estatus || "").trim();
    return label || "Sin estatus";
  });
  const tipoMap = aggregateCounts(items, (i) => {
    const byCatalog = catalogoMap[i.tipo_servicio_id];
    return byCatalog || i.tipo || "Sin tipo";
  });
  const prioridadMap = aggregateCounts(items, (i) => {
    const label = String(i.prioridad || "").trim();
    return label || "Sin prioridad";
  });

  const estatusData = toChartArrays(estatusMap);
  const tipoData = toChartArrays(tipoMap);
  const prioridadData = toChartArrays(prioridadMap);
  const tendenciaData = buildTrendLast7Days(items);

  renderChart("estatus", "chart-estatus", {
    type: "doughnut",
    data: {
      labels: estatusData.labels,
      datasets: [
        {
          data: estatusData.data,
          backgroundColor: ["#f4b44f", "#8f5bc8", "#3f91d9", "#7fb24d", "#7f8ca8", "#c8a447"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 10, boxHeight: 10 } },
      },
      cutout: "62%",
    },
  });

  renderChart("tipo", "chart-tipo-servicio", {
    type: "bar",
    data: {
      labels: tipoData.labels,
      datasets: [
        {
          label: "Incidencias",
          data: tipoData.data,
          borderRadius: 8,
          backgroundColor: ["#f4b44f", "#f3d07d", "#d8b6eb", "#c9dbb6", "#a6c4d9", "#c9b4a6"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  renderChart("prioridad", "chart-prioridad", {
    type: "bar",
    data: {
      labels: prioridadData.labels,
      datasets: [
        {
          label: "Incidencias",
          data: prioridadData.data,
          borderRadius: 8,
          backgroundColor: ["#c54d62", "#d9b250", "#8dbb68", "#8a7aa0"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  renderChart("tendencia", "chart-tendencia", {
    type: "line",
    data: {
      labels: tendenciaData.labels,
      datasets: [
        {
          label: "Incidencias",
          data: tendenciaData.data,
          tension: 0.35,
          fill: true,
          borderWidth: 2.2,
          borderColor: "#7b1b27",
          backgroundColor: "rgba(123, 27, 39, 0.15)",
          pointRadius: 3,
          pointBackgroundColor: "#7b1b27",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

async function fetchJSON(url, options = {}) {
  console.log('🔍 fetchJSON URL:', url); // Debug
  const res = await fetch(url, { credentials: "include", ...options });
  const data = await res.json().catch(() => ({}));
  console.log('📦 fetchJSON Response:', data); // Debug
  if (res.status === 401) {
    window.location.replace("/login.html");
    throw new Error(data?.message || "Sesión no válida");
  }
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
}

// ✅ NUEVO: cargar catálogo y armar id -> nombre
async function cargarCatalogo() {
  const data = await fetchJSON(`${API}/catalogo/tipos-servicio`);
  const items = Array.isArray(data) ? data : (data.items || data.data || []);

  catalogoMap = {};
  items
    .filter(s => s.active === 1 || s.active === true || s.active == null)
    .forEach(s => {
      catalogoMap[s.id] = s.nombre;
    });

  poblarFiltroTipos();
}

function poblarFiltroTipos() {
  if (!els.filtroTipo) return;
  const tipos = Object.values(catalogoMap)
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const currentValue = els.filtroTipo.value || "";
  els.filtroTipo.innerHTML = "";

  const optionTodos = document.createElement("option");
  optionTodos.value = "";
  optionTodos.textContent = "Todos";
  els.filtroTipo.appendChild(optionTodos);

  tipos.forEach((tipo) => {
    const opt = document.createElement("option");
    opt.value = tipo;
    opt.textContent = tipo;
    els.filtroTipo.appendChild(opt);
  });

  els.filtroTipo.value = currentValue;
}

function normalizarFechaISO(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function filtrarIncidencias(items) {
  const folioFiltro = String(els.filtroFolio?.value || "").trim().toLowerCase();
  const estatusFiltro = normalizeLabel(els.filtroEstatus?.value || "");
  const tipoFiltro = normalizeLabel(els.filtroTipo?.value || "");
  const prioridadFiltro = normalizeLabel(els.filtroPrioridad?.value || "");
  const fechaFiltro = String(els.filtroFecha?.value || "").trim();

  return items.filter((i) => {
    const folio = String(i.folio || "").toLowerCase();
    const estatus = normalizeLabel(i.estatus || "");
    const tipoNombre = normalizeLabel(catalogoMap[i.tipo_servicio_id] || i.tipo || "");
    const prioridad = normalizeLabel(i.prioridad || "");
    const fecha = normalizarFechaISO(i.fecha_creacion || i.created_at || i.fecha || "");

    if (folioFiltro && !folio.includes(folioFiltro)) return false;
    if (estatusFiltro && !estatus.includes(estatusFiltro)) return false;
    if (tipoFiltro && tipoNombre !== tipoFiltro) return false;
    if (prioridadFiltro && prioridad !== prioridadFiltro) return false;
    if (fechaFiltro && fecha !== fechaFiltro) return false;
    return true;
  });
}

function renderTablaIncidencias(items) {
  els.tbody.innerHTML = "";
  items.forEach(i => {
    const tr = document.createElement("tr");

    const tipoNombre = catalogoMap[i.tipo_servicio_id] || "";
    const dataDetalleAttrs = `
      data-id="${i.id}"
      data-folio="${i.folio}"
      data-estatus="${i.estatus}"
      data-fecha="${i.fecha_creacion || i.created_at || i.fecha || ''}"
      data-direccion="${i.direccion || ''}"
      data-referencia="${i.referencia || ''}"
      data-latitud="${i.latitud || ''}"
      data-longitud="${i.longitud || ''}"
      data-titulo="${i.titulo || ''}"
      data-descripcion="${i.descripcion || ''}"
      data-tipo="${tipoNombre}"
      data-prioridad="${i.prioridad || ''}"
    `;

    const btnAccionesHtml = `<button class="btn btn-sm btn-primary btn-pill"
            data-action="acciones"
            ${dataDetalleAttrs}>
            <i class="bi bi-sliders2-vertical"></i> Acciones
          </button>`;

    tr.innerHTML = `
      <td class="fw-bold">${i.folio}</td>
      <td>${i.titulo ?? ""}</td>
      <td>${badgeStatus(i.estatus)}</td>
      <td>${badgePrioridad(i.prioridad)}</td>
      <td>${tipoNombre}</td>
      <td>
        <div class="d-flex gap-1">
          ${btnAccionesHtml}
        </div>
      </td>
    `;
    els.tbody.appendChild(tr);
  });

  if (!items.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="6" class="text-center text-secondary py-4">
        No hay incidencias con los filtros seleccionados.
      </td>
    `;
    els.tbody.appendChild(tr);
  }

  document.querySelectorAll("[data-bs-toggle='tooltip']").forEach(el => {
    bootstrap.Tooltip.getOrCreateInstance(el);
  });
}

function aplicarFiltrosIncidencias() {
  const filteredItems = filtrarIncidencias(incidenciasCache);
  renderTablaIncidencias(filteredItems);
  renderSupervisorCharts(filteredItems);
}

async function cargarKPIs() {
  // OJO: si tu API NO tiene /resumen, cámbialo por cálculo desde incidencias.
  const data = await fetchJSON(`${API}/incidencias/resumen`);
  els.total.textContent = data.total ?? 0;
  els.nuevas.textContent = data.nuevas ?? 0;
  els.asignadas.textContent = data.asignadas ?? 0;
  els.enproceso.textContent = data.en_proceso ?? 0;
  els.cerradas.textContent = data.cerradas ?? 0;
}

async function cargarIncidencias() {
  const data = await fetchJSON(`${API}/incidencias?limit=25&page=1`);
  incidenciasCache = Array.isArray(data) ? data : (data.items || data.data || []);
  aplicarFiltrosIncidencias();
}

async function cargarTecnicos() {
  if (!els.selectTecnicos) return;
  try {
    const tecnicos = await fetchJSON(`${API}/usuarios/tecnicos`);
    els.selectTecnicos.innerHTML = "";
    tecnicos.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name || t.nombre || t.full_name || `Técnico ${t.id}`;
      els.selectTecnicos.appendChild(opt);
    });
  } catch (_) {
    els.selectTecnicos.innerHTML = "";
  }
}

function abrirModalAsignar({ id, folio }) {
  currentIncidencia = { id, folio };
  els.modalFolio.textContent = `Folio: ${folio}`;
  els.inputComentario.value = "";

  const modalEl = document.getElementById("modalAsignar");
  bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
}

function cerrarModal() {
  if (bsModal) bsModal.hide();
  currentIncidencia = null;
}

async function cargarHistorial(id, tbodyId = "tbody-seguimiento") {
  const data = await fetchJSON(`${API}/incidencias/${id}/historial`);
  const tbodySeguimiento = document.getElementById(tbodyId);
  if (!tbodySeguimiento) return;
  tbodySeguimiento.innerHTML = "";

  if (!data.length) {
    tbodySeguimiento.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-secondary py-3">
          No hay movimientos registrados
        </td>
      </tr>
    `;
    return;
  }

  data.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(item.created_at).toLocaleString('es-MX')}</td>
      <td><span class="badge bg-secondary">${item.accion}</span></td>
      <td>${item.comentario || '-'}</td>
      <td>${item.actor_name || item.actor_user_id || '-'}</td>
      <td>${item.target_name || item.target_user_id || '-'}</td>
    `;
    tbodySeguimiento.appendChild(tr);
  });
}

async function abrirModalSeguimiento(incidencia) {
  try {
    const { id, folio, estatus } = incidencia;
    
    // Validar que los elementos existan
    const segFolio = document.getElementById("seg-folio");
    const segEstatus = document.getElementById("seg-estatus");
    const modalEl = document.getElementById("modalSeguimiento");
    
    if (!segFolio || !segEstatus || !modalEl) {
      throw new Error('Elementos del modal no encontrados en el DOM');
    }
    
    segFolio.textContent = `Folio: ${folio}`;
    segEstatus.textContent = `Estatus: ${estatus}`;
    await cargarHistorial(id, "tbody-seguimiento");
    
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } catch (err) {
    console.error('Error en abrirModalSeguimiento:', err);
    alert(err.message);
  }
}

async function asignarIncidenciaConDatos({ incidenciaId, tecnicoId, comentario }) {
  const body = {
    target_user_id: tecnicoId,
    comentario: comentario || null
  };

  await fetchJSON(`${API}/incidencias/${incidenciaId}/asignar`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function prepararAsignacionEnDetalle({ id, folio, estatus }) {
  const select = document.getElementById("detalle-select-tecnicos");
  const input = document.getElementById("detalle-input-comentario");
  const btn = document.getElementById("detalle-btn-asignar");
  const help = document.getElementById("detalle-asignacion-ayuda");

  if (!select || !input || !btn || !help) return;

  currentIncidencia = { id, folio };
  input.value = "";
  select.innerHTML = "";

  const esNueva = normalizeLabel(estatus).includes("nueva");
  if (!esNueva) {
    help.textContent = `No se puede asignar. Estatus actual: ${estatus || "-"}.`;
    btn.disabled = true;
    select.disabled = true;
    input.disabled = true;
    return;
  }

  help.textContent = "Solo se permite asignar incidencias en estado NUEVA.";
  btn.disabled = false;
  select.disabled = false;
  input.disabled = false;

  const tecnicos = await fetchJSON(`${API}/usuarios/tecnicos`);
  tecnicos.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name || t.nombre || t.full_name || `Técnico ${t.id}`;
    select.appendChild(opt);
  });

  btn.onclick = async () => {
    try {
      const tecnicoId = parseInt(select.value, 10);
      if (!tecnicoId) {
        alert("Selecciona un técnico");
        return;
      }
      await asignarIncidenciaConDatos({
        incidenciaId: id,
        tecnicoId,
        comentario: input.value || null
      });
      const modalEl = document.getElementById("modalDetalleIncidencia");
      bootstrap.Modal.getInstance(modalEl)?.hide();
      await recargarTodo();
      showToast("Incidencia asignada ✅", "success");
    } catch (err) {
      alert(err.message);
    }
  };
}

function setSeguimientoCompletoVisible(visible) {
  const box = document.getElementById("detalle-seguimiento-completo");
  if (!box) return;
  box.classList.toggle("is-open", Boolean(visible));
}

async function abrirModalDetalle(incidencia, options = {}) {
  const { id, folio, estatus, fecha, direccion, referencia, latitud, longitud, titulo, descripcion, tipo, prioridad } = incidencia;
  const { seccionInicial = "detalle" } = options;
  
  // Llenar información general
  document.getElementById("detalle-folio").textContent = folio;
  document.getElementById("detalle-titulo").textContent = titulo || '';
  document.getElementById("detalle-descripcion").textContent = descripcion || '';
  document.getElementById("detalle-tipo").textContent = tipo || '';
  document.getElementById("detalle-estatus").textContent = estatus || '';
  const prioridadEl = document.getElementById("detalle-prioridad");
  if (prioridadEl) {
    const priorNorm = normalizeLabel(prioridad);
    prioridadEl.classList.remove("is-alta", "is-media", "is-baja");
    if (priorNorm.includes("alta")) prioridadEl.classList.add("is-alta");
    else if (priorNorm.includes("media")) prioridadEl.classList.add("is-media");
    else if (priorNorm.includes("baja")) prioridadEl.classList.add("is-baja");
    const priorTxt = prioridad ? `${String(prioridad).trim()} ▾` : "-";
    prioridadEl.textContent = priorTxt;
  }
  const fechaEl = document.getElementById("detalle-fecha");
  if (fechaEl) {
    const formatted = fecha ? new Date(fecha).toLocaleString("es-MX") : "-";
    fechaEl.textContent = formatted;
  }
  
  // Llenar información de ubicación
  document.getElementById("detalle-direccion").textContent = direccion || 'No registrada';
  document.getElementById("detalle-referencia").textContent = referencia || 'No registrada';
  
  // Mostrar coordenadas si existen
  const coordsText = (latitud && longitud) ? `${latitud}, ${longitud}` : 'No registradas';
  document.getElementById("detalle-coordenadas").textContent = coordsText;
  await cargarHistorialResumenDetalle(id);
  await cargarHistorial(id, "detalle-tbody-seguimiento");

  const segFolio = document.getElementById("detalle-seg-folio");
  const segEstatus = document.getElementById("detalle-seg-estatus");
  if (segFolio) segFolio.textContent = `Folio: ${folio || "-"}`;
  if (segEstatus) segEstatus.textContent = `Estatus: ${estatus || "-"}`;
  setSeguimientoCompletoVisible(seccionInicial === "seguimiento");
  await prepararAsignacionEnDetalle({ id, folio, estatus });
  
  // Configurar botones de Google Maps
  const btnVerMaps = document.getElementById("btn-ver-maps");
  
  // Validar si hay ubicación disponible (simplificado)
  const tieneCoordenadas = latitud != null && longitud != null && latitud !== '' && longitud !== '';
  const tieneDireccion = direccion != null && String(direccion).trim() !== '';
  const tieneUbicacion = tieneCoordenadas || tieneDireccion;
  
  if (tieneUbicacion) {
    // Construir URL y asignar al href
    let url = 'https://www.google.com/maps/search/';
    if (tieneCoordenadas) {
      url += `${latitud},${longitud}`;
    } else if (tieneDireccion) {
      url += encodeURIComponent(direccion);
    } else {
      url += 'Martínez de la Torre, Veracruz';
    }
    
    btnVerMaps.href = url;
    btnVerMaps.setAttribute('target', '_blank');
    btnVerMaps.removeAttribute('aria-disabled');
    btnVerMaps.style.pointerEvents = 'auto';
    btnVerMaps.style.opacity = '1';
    btnVerMaps.style.cursor = 'pointer';
    
    // Restaurar texto original con ícono
    btnVerMaps.innerHTML = '<i class="bi bi-map"></i> Ver en Google Maps';
    btnVerMaps.className = 'btn btn-sm btn-outline-primary dashboard-detalle-maps-btn';
  } else {
    btnVerMaps.href = '#';
    btnVerMaps.removeAttribute('target');
    btnVerMaps.setAttribute('aria-disabled', 'true');
    btnVerMaps.style.pointerEvents = 'none';
    btnVerMaps.style.opacity = '0.5';
    btnVerMaps.style.cursor = 'not-allowed';
    
    // Cambiar texto conservando el ícono
    btnVerMaps.innerHTML = '<i class="bi bi-map"></i> Ubicación no disponible';
    btnVerMaps.className = 'btn btn-sm btn-secondary dashboard-detalle-maps-btn';
  }
  
  // Abrir modal
  const modalEl = document.getElementById("modalDetalleIncidencia");
  const btnVerSeguimiento = document.getElementById("btn-ver-seguimiento-detalle");
  if (btnVerSeguimiento) {
    btnVerSeguimiento.onclick = () => {
      setSeguimientoCompletoVisible(true);
      document.getElementById("detalle-seguimiento-completo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function colorHistorialDot(accionRaw) {
  const accion = String(accionRaw || "").toLowerCase();
  if (accion.includes("nueva") || accion.includes("registro")) return "#f4b44f";
  if (accion.includes("asign")) return "#8f5bc8";
  if (accion.includes("proceso")) return "#3f91d9";
  if (accion.includes("resolv") || accion.includes("cerr")) return "#7fb24d";
  return "#c8a447";
}

async function cargarHistorialResumenDetalle(id) {
  const list = document.getElementById("detalle-historial-list");
  if (!list) return;

  list.innerHTML = "";
  const data = await fetchJSON(`${API}/incidencias/${id}/historial`);
  const items = Array.isArray(data) ? data.slice(0, 5) : [];

  if (!items.length) {
    list.innerHTML = `<div class="text-secondary small">Sin movimientos registrados.</div>`;
    return;
  }

  items.forEach((item) => {
    const wrapper = document.createElement("article");
    wrapper.className = "dashboard-detalle-hito";

    const dot = document.createElement("span");
    dot.className = "dashboard-detalle-hito-dot";
    dot.style.background = colorHistorialDot(item.accion);

    const content = document.createElement("div");
    const fechaTxt = item.created_at ? new Date(item.created_at).toLocaleString("es-MX") : "-";
    const comentario = item.comentario && String(item.comentario).trim() ? item.comentario : "Sin comentario";
    content.innerHTML = `
      <div class="dashboard-detalle-hito-accion">${item.accion || "MOVIMIENTO"}</div>
      <div class="dashboard-detalle-hito-fecha"><i class="bi bi-clock-history" aria-hidden="true"></i>${fechaTxt}</div>
      <div class="dashboard-detalle-hito-comentario">${comentario}</div>
    `;

    wrapper.appendChild(dot);
    wrapper.appendChild(content);
    list.appendChild(wrapper);
  });
}

async function asignarIncidencia() {
  if (!currentIncidencia) return;

  const tecnicoId = parseInt(els.selectTecnicos.value, 10);
  if (!tecnicoId) return alert("Selecciona un técnico");
  await asignarIncidenciaConDatos({
    incidenciaId: currentIncidencia.id,
    tecnicoId,
    comentario: els.inputComentario.value || null
  });

  cerrarModal();
  await recargarTodo();
  showToast("Incidencia asignada ✅");
}

// ✅ CAMBIO: primero catálogo, luego KPIs y tabla
async function recargarTodo() {
  setLoading(true);
  try {
    await cargarCatalogo();
    await cargarKPIs();
    await cargarIncidencias();
  } finally {
    setLoading(false);
  }
}

els.btnRecargar.addEventListener("click", async () => {
  try { await recargarTodo(); }
  catch (e) { alert(e.message); }
});

els.btnAsignar.addEventListener("click", async () => {
  try { await asignarIncidencia(); }
  catch (e) { alert(e.message); }
});

els.btnBuscarIncidencias?.addEventListener("click", () => {
  aplicarFiltrosIncidencias();
});

els.filtroFolio?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  aplicarFiltrosIncidencias();
});

els.filtroEstatus?.addEventListener("change", aplicarFiltrosIncidencias);
els.filtroTipo?.addEventListener("change", aplicarFiltrosIncidencias);
els.filtroPrioridad?.addEventListener("change", aplicarFiltrosIncidencias);
els.filtroFecha?.addEventListener("change", aplicarFiltrosIncidencias);
els.filtroFolio?.addEventListener("input", aplicarFiltrosIncidencias);

els.tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = parseInt(btn.dataset.id, 10);
  const folio = btn.dataset.folio;
  const estatus = btn.dataset.estatus;
  const incidencia = {
    id,
    folio,
    estatus,
    fecha: btn.dataset.fecha,
    direccion: btn.dataset.direccion,
    referencia: btn.dataset.referencia,
    latitud: btn.dataset.latitud,
    longitud: btn.dataset.longitud,
    titulo: btn.dataset.titulo,
    descripcion: btn.dataset.descripcion,
    tipo: btn.dataset.tipo,
    prioridad: btn.dataset.prioridad
  };

  if (["detalle", "seguimiento", "asignar", "acciones"].includes(action)) {
    try {
      setLoading(true);
      const seccionInicial = action === "seguimiento" ? "seguimiento" : "detalle";
      await abrirModalDetalle(incidencia, { seccionInicial });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
    return;
  }
});

// ==========================================
// 📊 FUNCIONES DE REPORTES
// ==========================================

// Mostrar/ocultar sección de reportes
document.addEventListener('DOMContentLoaded', function() {
  const tipoIndicador = document.getElementById('tipoIndicadorDigitalizacion');
  if (tipoIndicador) {
    tipoIndicador.addEventListener('change', function() {
      const parametroPilotaje = document.getElementById('parametroPilotaje');
      if (this.value === 'pilotaje') {
        parametroPilotaje.style.display = 'block';
      } else {
        parametroPilotaje.style.display = 'none';
      }
    });
  }
});

// Generar reporte de digitalización
async function generarReporteDigitalizacion() {
  const fechaInicio = document.getElementById('reporteFechaInicio').value;
  const fechaFin = document.getElementById('reporteFechaFin').value;
  const tipo = document.getElementById('tipoIndicadorDigitalizacion').value;
  const totalRecibidos = document.getElementById('totalRecibidos').value;

  if (!fechaInicio || !fechaFin) {
    showToast('Por favor seleccione fecha de inicio y fin', 'warning');
    return;
  }

  if (tipo === 'pilotaje' && !totalRecibidos) {
    showToast('Para modo pilotaje debe especificar el total de reportes recibidos', 'warning');
    return;
  }

  try {
    const params = new URLSearchParams({
      fechaInicio,
      fechaFin,
      tipo,
      ...(totalRecibidos && { totalRecibidos })
    });

    const data = await fetchJSON(`${API}/reportes/digitalizacion?${params}`);
    
    // Renderizar reporte de digitalización
    renderReporteDigitalizacion(data);
    
    showToast('Reporte de digitalización generado correctamente', 'success');
  } catch (error) {
    console.error('Error generando reporte de digitalización:', error);
    showToast('Error al generar reporte de digitalización', 'danger');
  }
}

// Generar reporte de tiempo de respuesta
async function generarReporteTiempoRespuesta() {
  const fechaInicio = document.getElementById('reporteFechaInicio').value;
  const fechaFin = document.getElementById('reporteFechaFin').value;

  if (!fechaInicio || !fechaFin) {
    showToast('Por favor seleccione fecha de inicio y fin', 'warning');
    return;
  }

  try {
    const params = new URLSearchParams({ fechaInicio, fechaFin });
    const data = await fetchJSON(`${API}/reportes/tiempo-respuesta?${params}`);
    
    // Renderizar reporte de tiempo de respuesta
    renderReporteTiempoRespuesta(data);
    
    showToast('Reporte de tiempo de respuesta generado correctamente', 'success');
  } catch (error) {
    console.error('Error generando reporte de tiempo de respuesta:', error);
    showToast('Error al generar reporte de tiempo de respuesta', 'danger');
  }
}

// Renderizar reporte de digitalización
function renderReporteDigitalizacion(data) {
  const container = document.getElementById('reportesContainer');
  const fechaGeneracionRaw = data?.fecha_generacion || null;
  const fechaGeneracionLocal = data?.fecha_generacion_local || "";
  const fechaGeneracionDate = fechaGeneracionRaw ? new Date(fechaGeneracionRaw) : null;
  const fechaGeneracionUI = fechaGeneracionLocal
    ? `${fechaGeneracionLocal} (CDMX)`
    : fechaGeneracionDate && !Number.isNaN(fechaGeneracionDate.getTime())
      ? fechaGeneracionDate.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: false }) + " (CDMX)"
      : "-";
  
  const html = `
    <div class="reporte-digitalizacion">
      <h6 class="mb-3">${data.tipo_indicador}</h6>
      <div class="row">
        <div class="col-md-4">
          <div class="card text-center">
            <div class="card-body">
              <h3 class="text-primary">${data.total_reportes || data.capturados_sigim || 0}</h3>
              <p class="mb-0">${data.total_reportes ? 'Total de reportes del periodo' : 'Capturados en SIGIM-MTZ'}</p>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card text-center">
            <div class="card-body">
              <h3 class="text-success">${data.registros_digitales || data.total_recibidos || 0}</h3>
              <p class="mb-0">${data.registros_digitales ? 'Registros digitales' : 'Total recibidos'}</p>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card text-center">
            <div class="card-body">
              <h3 class="text-info">${data.porcentaje_cumplimiento || data.porcentaje_captura || 0}%</h3>
              <p class="mb-0">Porcentaje</p>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-3 text-muted small">
        <strong>Fecha de generación:</strong> ${fechaGeneracionUI}
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

// Renderizar reporte de tiempo de respuesta
function renderReporteTiempoRespuesta(data) {
  const container = document.getElementById('reportesContainer');
  
  const html = `
    <div class="reporte-tiempo-respuesta">
      <h6 class="mb-3">Reporte de Tiempo de Respuesta Inicial</h6>
      
      <!-- Estadísticas generales -->
      <div class="row mb-3">
        <div class="col-md-3">
          <div class="card text-center">
            <div class="card-body">
              <h5 class="text-primary">${data.estadisticas.total_incidencias}</h5>
              <p class="mb-0 small">Total incidencias</p>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center">
            <div class="card-body">
              <h5 class="text-success">${data.estadisticas.cumplen}</h5>
              <p class="mb-0 small">Cumplen (≤24h)</p>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center">
            <div class="card-body">
              <h5 class="text-warning">${data.estadisticas.no_cumplen}</h5>
              <p class="mb-0 small">No cumplen (>24h)</p>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center">
            <div class="card-body">
              <h5 class="text-info">${data.estadisticas.sin_respuesta}</h5>
              <p class="mb-0 small">Sin respuesta</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Tabla detallada -->
      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha Registro</th>
              <th>Primera Respuesta</th>
              <th>Tiempo Transcurrido</th>
              <th>Cumplimiento</th>
            </tr>
          </thead>
          <tbody>
            ${data.resultados.map(incidencia => `
              <tr>
                <td><strong>${incidencia.folio}</strong></td>
                <td>${new Date(incidencia.fecha_registro).toLocaleString('es-MX')}</td>
                <td>${incidencia.fecha_primera_respuesta ? new Date(incidencia.fecha_primera_respuesta).toLocaleString('es-MX') : '-'}</td>
                <td>
                  ${incidencia.tiempo_horas !== null && incidencia.tiempo_horas !== undefined ? 
                    `<span class="badge ${getTiempoBadgeClass(incidencia.cumplimiento, incidencia.tiempo_horas)}">${incidencia.tiempo_horas}h</span>` : 
                    `<span class="text-muted">-</span>`
                  }
                </td>
                <td>
                  <span class="badge ${getCumplimientoBadgeClass(incidencia.cumplimiento)}">
                    ${incidencia.cumplimiento}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="mt-3 text-muted small">
        <strong>Criterio:</strong> ${data.criterio}<br>
        <strong>Acciones consideradas:</strong> ${data.acciones_consideradas.join(', ')}
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

// Clases para badges de tiempo
function getTiempoBadgeClass(cumplimiento, tiempoHoras) {
  if (!tiempoHoras) return 'bg-secondary';
  if (cumplimiento === 'CUMPLE') return 'bg-success';
  if (cumplimiento === 'NO CUMPLE') return 'bg-warning';
  return 'bg-secondary';
}

// Clases para badges de cumplimiento
function getCumplimientoBadgeClass(cumplimiento) {
  switch (cumplimiento) {
    case 'CUMPLE': return 'bg-success';
    case 'NO CUMPLE': return 'bg-danger';
    case 'SIN RESPUESTA': return 'bg-secondary';
    default: return 'bg-secondary';
  }
}

// ==========================================
// 📊 FUNCIONES DE MENÚ
// ==========================================

function setDashboardView(view) {
  const isReportes = view === "reportes";
  const seccionReportes = document.getElementById("seccion-reportes");
  const kpis = document.querySelector(".row.g-3.mb-3");
  const seccionAnalitica = document.getElementById("seccion-analitica");
  const seccionIncidencias = document.getElementById("seccion-incidencias");

  if (seccionReportes) seccionReportes.style.display = isReportes ? "block" : "none";
  if (kpis) kpis.style.display = isReportes ? "none" : "flex";
  if (seccionAnalitica) seccionAnalitica.style.display = isReportes ? "none" : "flex";
  if (seccionIncidencias) seccionIncidencias.style.display = isReportes ? "none" : "block";

  document.querySelectorAll(".js-menu-link").forEach((el) => {
    const same = el.dataset.menuAction === view;
    el.classList.toggle("active", same);
    el.classList.toggle("is-active", same);
  });

  if (isReportes) showToast("Sección de reportes activada", "info");
}

document.querySelectorAll(".js-menu-link").forEach((el) => {
  el.addEventListener("click", (e) => {
    const action = el.dataset.menuAction;
    if (!action) return;
    e.preventDefault();
    if (action === "reportes") {
      setDashboardView("reportes");
      return;
    }
    setDashboardView("panel");
    recargarTodo().catch((err) => {
      alert(err.message);
    });
  });
});

document.getElementById("btn-cerrar-sesion")?.addEventListener("click", async () => {
  try {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
  } catch (_) { /* ignorar */ }
  window.location.replace("/login.html");
});

// Init
(async () => {
  try {
    const me = await fetchJSON(`${API}/auth/me`);
    currentUser = me.user || null;
    pintarUsuarioTopbar(currentUser);
    await recargarTodo();
  } catch (e) {
    pintarUsuarioTopbar(null);
    if (!String(e.message || "").includes("Sesión")) alert(e.message);
  }
})();