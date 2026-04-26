const API = "/api";

const els = {
  asignadas: document.getElementById("kpi-asignadas"),
  enproceso: document.getElementById("kpi-enproceso"),
  resueltas: document.getElementById("kpi-resueltas"),
  hoy: document.getElementById("kpi-hoy"),
  tbody: document.getElementById("tbody-incidencias"),
  btnRecargar: document.getElementById("btn-recargar"),
  lblLoading: document.getElementById("lbl-loading"),
  filtroFolio: document.getElementById("filtro-inc-folio"),
  filtroEstatus: document.getElementById("filtro-inc-estatus"),
  filtroPrioridad: document.getElementById("filtro-inc-prioridad"),
  filtroFecha: document.getElementById("filtro-inc-fecha"),
  btnBuscarIncidencias: document.getElementById("btn-buscar-incidencias"),
  toastOk: document.getElementById("toastOk"),
  toastOkMsg: document.getElementById("toastOkMsg"),
  estatusModalTitle: document.getElementById("estatus-modal-title"),
  estatusModalSubmitText: document.getElementById("estatus-modal-submit-text"),
  btnGuardarAvance: document.getElementById("btn-guardar-avance"),
  inputComentarioAvance: document.getElementById("input-comentario-avance"),
};

let catalogoMap = {};
let incidenciasCache = [];
let currentUser = null;
let bsToast = null;
const chartRefs = {};
let estatusModalContext = { comentarioObligatorio: false };

function setLoading(isLoading) {
  if (!els.lblLoading) return;
  els.lblLoading.classList.toggle("d-none", !isLoading);
  els.btnRecargar.disabled = !!isLoading;
}

function showToast(msg, type = "info") {
  if (!els.toastOk) {
    alert(msg);
    return;
  }
  if (!bsToast) bsToast = bootstrap.Toast.getOrCreateInstance(els.toastOk, { delay: 2300 });
  els.toastOkMsg.textContent = msg;
  els.toastOk.className = `toast align-items-center text-white bg-${type === "success" ? "success" : type === "danger" ? "danger" : type === "warning" ? "warning" : "info"} border-0`;
  bsToast.show();
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ");
}

function statusClass(text) {
  const t = normalizeLabel(text);
  if (t.includes("cerr")) return "badge-ok";
  if (t.includes("resuel")) return "badge-ok";
  if (t.includes("asign")) return "badge-warn";
  if (t.includes("proceso")) return "badge-warn";
  return "";
}

function formatHumanLabel(value) {
  const normalized = String(value || "").replace(/_/g, " ").trim().toLowerCase();
  if (!normalized) return "";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function badge(text) {
  const extra = statusClass(text);
  return `<span class="badge-status ${extra}">${formatHumanLabel(text)}</span>`;
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
    const key = String(getKey(item) || "Sin dato").trim() || "Sin dato";
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
  const labels = days.map((d) => d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" }));
  const counts = new Array(7).fill(0);
  const indexByDate = new Map(days.map((d, i) => [d.toISOString().slice(0, 10), i]));

  items.forEach((item) => {
    const raw = item.fecha_creacion || item.created_at || item.fecha;
    if (!raw) return;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return;
    const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10);
    const index = indexByDate.get(key);
    if (index != null) counts[index] += 1;
  });
  return { labels, data: counts };
}

function renderTecnicoCharts(items) {
  if (typeof Chart === "undefined") return;
  const estatusData = toChartArrays(aggregateCounts(items, (i) => (formatHumanLabel(i.estatus) || "Sin estatus")));
  const prioridadData = toChartArrays(aggregateCounts(items, (i) => (formatHumanLabel(i.prioridad) || "Sin prioridad")));
  const tendenciaData = buildTrendLast7Days(items);

  renderChart("estatus", "chart-estatus-tecnico", {
    type: "doughnut",
    data: {
      labels: estatusData.labels,
      datasets: [{ data: estatusData.data, backgroundColor: ["#8f5bc8", "#3f91d9", "#7fb24d", "#c8a447", "#c54d62"], borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { boxWidth: 10, boxHeight: 10 } } },
      cutout: "60%",
    },
  });

  renderChart("prioridad", "chart-prioridad-tecnico", {
    type: "bar",
    data: {
      labels: prioridadData.labels,
      datasets: [{ label: "Incidencias", data: prioridadData.data, borderRadius: 8, backgroundColor: ["#c54d62", "#d9b250", "#8dbb68", "#8a7aa0"], borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  renderChart("tendencia", "chart-tendencia-tecnico", {
    type: "line",
    data: {
      labels: tendenciaData.labels,
      datasets: [{
        label: "Incidencias",
        data: tendenciaData.data,
        tension: 0.35,
        fill: true,
        borderWidth: 2.2,
        borderColor: "#7b1b27",
        backgroundColor: "rgba(123, 27, 39, 0.15)",
        pointRadius: 3,
        pointBackgroundColor: "#7b1b27",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function toISODate(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}


function filtrarIncidencias(items) {
  const folioFiltro = normalizeLabel(els.filtroFolio?.value || "");
  const estatusFiltro = normalizeLabel(els.filtroEstatus?.value || "");
  const prioridadFiltro = normalizeLabel(els.filtroPrioridad?.value || "");
  const fechaFiltro = String(els.filtroFecha?.value || "").trim();

  return items.filter((item) => {
    const folio = normalizeLabel(item.folio || "");
    const estatus = normalizeLabel(item.estatus || "");
    const prioridad = normalizeLabel(item.prioridad || "");
    const fecha = toISODate(item.fecha_creacion || item.created_at || item.fecha);

    if (folioFiltro && !folio.includes(folioFiltro)) return false;
    if (estatusFiltro && !estatus.includes(estatusFiltro)) return false;
    if (prioridadFiltro && !prioridad.includes(prioridadFiltro)) return false;
    if (fechaFiltro && fecha !== fechaFiltro) return false;
    return true;
  });
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.replace("/login.html");
    throw new Error(data?.message || "Sesión no válida");
  }
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
}

function pintarUsuarioTopbar(user) {
  const nameEl = document.getElementById("topbar-user-name");
  const roleEl = document.getElementById("topbar-user-role");
  if (nameEl) nameEl.textContent = user?.name || "Técnico";
  if (roleEl) roleEl.textContent = user?.role || "Panel Operativo";
}

async function cargarCatalogo() {
  const data = await fetchJSON(`${API}/catalogo/tipos-servicio`);
  const items = Array.isArray(data) ? data : (data.items || data.data || []);

  catalogoMap = {};
  items
    .filter(s => s.active === 1 || s.active === true || s.active == null)
    .forEach(s => {
      catalogoMap[s.id] = s.nombre;
    });
}

function cargarKPIs(items) {
  const asignadas = items.filter((i) => normalizeLabel(i.estatus).includes("asign")).length;
  const enProceso = items.filter((i) => normalizeLabel(i.estatus).includes("proceso")).length;
  const resueltas = items.filter((i) => {
    const estatus = normalizeLabel(i.estatus);
    return estatus.includes("resuelt") || estatus.includes("cerrad");
  }).length;
  const hoy = items.filter((i) => toISODate(i.fecha_creacion || i.created_at || i.fecha) === toISODate(new Date())).length;

  els.asignadas.textContent = asignadas;
  els.enproceso.textContent = enProceso;
  els.resueltas.textContent = resueltas;
  if (els.hoy) els.hoy.textContent = hoy;
}

async function cargarIncidencias() {
  const data = await fetchJSON(`${API}/incidencias?limit=25&page=1`);
  incidenciasCache = Array.isArray(data) ? data : (data.items || data.data || []);
  cargarKPIs(incidenciasCache);
  renderTecnicoCharts(incidenciasCache);
  aplicarFiltrosIncidencias();
}

function renderTablaIncidencias(items) {
  els.tbody.innerHTML = "";
  items.forEach(i => {
    const tr = document.createElement("tr");
    const tipoNombre = catalogoMap[i.tipo_servicio_id] || "";
    const estatusNorm = normalizeLabel(i.estatus);
    const esAsignada = estatusNorm.includes("asign");
    const esEnProceso = estatusNorm.includes("proceso");

    const accionesHtml = esAsignada
      ? `
        <button class="btn btn-sm btn-warning btn-pill"
          data-action="iniciar-atencion"
          data-id="${i.id}"
          data-folio="${i.folio}"
          data-estatus="${i.estatus}">
          <i class="bi bi-play-circle"></i> Iniciar atención
        </button>
      `
      : esEnProceso
        ? `
          <button class="btn btn-sm btn-primary btn-pill"
            data-action="registrar-avance"
            data-id="${i.id}"
            data-folio="${i.folio}"
            data-estatus="${i.estatus}">
            <i class="bi bi-journal-check"></i> Agregar nota
          </button>
          <button class="btn btn-sm btn-info btn-pill"
            data-action="evidencias"
            data-id="${i.id}"
            data-folio="${i.folio}"
            data-estatus="${i.estatus}">
            <i class="bi bi-camera"></i> Evidencias
          </button>
          <button class="btn btn-sm btn-warning btn-pill"
            data-action="marcar-resuelta"
            data-id="${i.id}"
            data-folio="${i.folio}"
            data-estatus="${i.estatus}">
            <i class="bi bi-check2-circle"></i> Marcar como resuelta
          </button>
        `
        : `
          <span class="text-secondary small">Solo lectura</span>
        `;

    tr.innerHTML = `
      <td class="fw-bold">${i.folio}</td>
      <td>${i.titulo ?? ""}</td>
      <td>${badge(i.estatus)}</td>
      <td>${badge(i.prioridad)}</td>
      <td>${tipoNombre}</td>
      <td>
        <div class="d-flex gap-1">
          ${accionesHtml}
        </div>
      </td>
    `;
    els.tbody.appendChild(tr);
  });

  if (!items.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="7" class="text-center text-secondary py-4">
        No hay incidencias con los filtros seleccionados.
      </td>
    `;
    els.tbody.appendChild(tr);
  }
}

function aplicarFiltrosIncidencias() {
  renderTablaIncidencias(filtrarIncidencias(incidenciasCache));
}

async function cargarHistorial(id) {
  const data = await fetchJSON(`${API}/incidencias/${id}/historial`);
  const tbodySeguimiento = document.getElementById("tbody-seguimiento");
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

  data.forEach((item) => {
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

// ==========================================
// Funciones para Módulo de Evidencias
// ==========================================

async function abrirModalEvidencias(incidencia) {
  console.log('📋 abrirModalEvidencias Incidencia (Técnico):', incidencia);
  try {
    const { id, folio, estatus } = incidencia;
    
    // Validar que los elementos existan
    const evidFolio = document.getElementById("evid-folio");
    const evidEstatus = document.getElementById("evid-estatus");
    const modalEl = document.getElementById("modalEvidencias");
    const uploadArea = document.querySelector('.upload-area');
    const btnSubir = document.getElementById("btn-subir-evidencias");
    
    if (!evidFolio || !evidEstatus || !modalEl) {
      throw new Error('Elementos del modal de evidencias no encontrados en el DOM (Técnico)');
    }
    
    evidFolio.textContent = `Folio: ${folio}`;
    evidEstatus.textContent = `Estatus: ${estatus}`;
    await cargarEvidencias(id);
    
    // Guardar ID en el botón para usarlo después
    btnSubir.dataset.id = id;
    
    // Deshabilitar subida si la incidencia está cerrada o resuelta
    const estatusNormalizado = normalizeLabel(estatus);
    const puedeSubir = estatusNormalizado.includes("asign") || estatusNormalizado.includes("proceso");
    
    if (uploadArea) {
      uploadArea.style.opacity = puedeSubir ? '1' : '0.5';
      uploadArea.style.pointerEvents = puedeSubir ? 'auto' : 'none';
    }
    
    if (btnSubir) {
      btnSubir.disabled = !puedeSubir;
      btnSubir.style.opacity = puedeSubir ? '1' : '0.5';
      btnSubir.style.cursor = puedeSubir ? 'pointer' : 'not-allowed';
    }
    
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } catch (err) {
    console.error('Error en abrirModalEvidencias (Técnico):', err);
    alert(err.message);
  }
}

async function cargarEvidencias(id) {
  try {
    const data = await fetchJSON(`${API}/incidencias/${id}/archivos`);
    const evidenciasList = document.getElementById("evidencias-list");
    evidenciasList.innerHTML = "";
    
    if (!Array.isArray(data) || data.length === 0) {
      evidenciasList.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="bi bi-image display-4 d-block mb-2"></i>
          <p>No hay evidencias registradas</p>
        </div>
      `;
      return;
    }
    
    data.forEach(evidencia => {
      const evidenciaItem = document.createElement("div");
      evidenciaItem.className = "evidencia-item d-flex align-items-center gap-3 p-2 border rounded mb-2";
      
      // Validar si el archivo existe usando el campo 'exists' del backend
      const fileUrl = evidencia.urlPath || `/uploads/${evidencia.filename}`;
      const fileExists = evidencia.exists;
      
      evidenciaItem.innerHTML = `
        <div class="evidencia-icon">
          ${evidencia.mime.includes('image') ? 
            `<i class="bi bi-image text-primary"></i>` : 
            `<i class="bi bi-file-earmark text-secondary"></i>`
          }
        </div>
        <div class="evidencia-info flex-grow-1">
          <div class="fw-bold small">${evidencia.original_name}</div>
          <div class="text-muted small">${formatFileSize(evidencia.size)}</div>
        </div>
        <div class="evidencia-actions">
          ${fileExists ? 
            `<a href="${fileUrl}" target="_blank" class="btn btn-sm btn-outline-primary">
              <i class="bi bi-eye"></i> Ver
            </a>` :
            `<span class="btn btn-sm btn-outline-secondary">
              <i class="bi bi-exclamation-triangle"></i> No disponible
            </span>`
          }
        </div>
      `;
      evidenciasList.appendChild(evidenciaItem);
    });
  } catch (err) {
    console.error('Error cargando evidencias:', err);
  }
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function subirEvidencias() {
  const input = document.getElementById("input-archivos");
  const btn = document.getElementById("btn-subir-evidencias");
  const id = btn.dataset.id;
  
  if (!input.files || input.files.length === 0) {
    alert("Selecciona al menos un archivo");
    return;
  }
  
  // Validar que el botón no esté deshabilitado
  if (btn.disabled) {
    alert("No se pueden subir evidencias a incidencias cerradas o resueltas");
    return;
  }
  
  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Subiendo...';
    
    // Subir archivos uno por uno (el backend solo acepta un archivo a la vez)
    for (const file of input.files) {
      console.log('🔍 Subiendo archivo:', file.name, 'Tamaño:', file.size, 'Tipo:', file.type);
      
      const formData = new FormData();
      formData.append('archivo', file);
      
      console.log('📤 Enviando FormData...');
      for (let [key, value] of formData.entries()) {
        console.log(`📋 ${key}:`, value instanceof File ? `File(${value.name}, ${value.size} bytes)` : value);
      }
      
      const response = await fetch(`${API}/incidencias/${id}/archivos`, {
        method: "POST",
        credentials: "include",
        body: formData
        // NO establecer Content-Type, el navegador lo hace automáticamente para FormData
      });
      
      console.log('📥 Response status:', response.status);
      
      if (response.status === 401) {
        window.location.replace("/login.html");
        throw new Error("Sesión no válida");
      }
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`Error ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('✅ Upload result:', result);
    }
    
    await cargarEvidencias(id);
    input.value = '';
    showToast("Evidencias subidas correctamente", "success");
  } catch (err) {
    console.error('🚨 Error completo en subirEvidencias:', err);
    alert("Error al subir evidencias: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-upload"></i> Subir evidencias';
  }
}

async function abrirModalDetalle(incidencia) {
  const { id, folio, estatus, direccion, referencia, latitud, longitud, titulo, descripcion, tipo, prioridad } = incidencia;
  
  // Llenar información general
  document.getElementById("detalle-folio").textContent = folio;
  document.getElementById("detalle-titulo").textContent = titulo || '';
  document.getElementById("detalle-descripcion").textContent = descripcion || '';
  document.getElementById("detalle-tipo").textContent = tipo || '';
  document.getElementById("detalle-estatus").textContent = estatus || '';
  document.getElementById("detalle-prioridad").textContent = prioridad || '';
  
  // Llenar información de ubicación
  document.getElementById("detalle-direccion").textContent = direccion || 'No registrada';
  document.getElementById("detalle-referencia").textContent = referencia || 'No registrada';
  
  // Mostrar coordenadas si existen
  const coordsText = (latitud && longitud) ? `${latitud}, ${longitud}` : 'No registradas';
  document.getElementById("detalle-coordenadas").textContent = coordsText;
  
  // Configurar botones de Google Maps
  const btnComoLlegar = document.getElementById("btn-como-llegar");
  
  // Validar si hay ubicación disponible (simplificado)
  const tieneCoordenadas = latitud != null && longitud != null && latitud !== '' && longitud !== '';
  const tieneDireccion = direccion != null && String(direccion).trim() !== '';
  const tieneUbicacion = tieneCoordenadas || tieneDireccion;
  
  console.log("🔍 DIAGNÓSTICO - Ubicación (Técnico):", { latitud, longitud, direccion, tieneCoordenadas, tieneDireccion, tieneUbicacion });
  
  if (tieneUbicacion) {
    console.log("🔍 DIAGNÓSTICO - Configurando href para Cómo llegar");
    
    // Construir URL y asignar al href
    let url = 'https://www.google.com/maps/dir/?api=1&destination=';
    if (tieneCoordenadas) {
      url += `${latitud},${longitud}`;
    } else if (tieneDireccion) {
      url += encodeURIComponent(direccion);
    } else {
      url += 'Martínez de la Torre, Veracruz';
    }
    
    btnComoLlegar.href = url;
    btnComoLlegar.setAttribute('target', '_blank');
    btnComoLlegar.removeAttribute('aria-disabled');
    btnComoLlegar.style.pointerEvents = 'auto';
    btnComoLlegar.style.opacity = '1';
    btnComoLlegar.style.cursor = 'pointer';
    
    // Restaurar texto original con ícono
    btnComoLlegar.innerHTML = '<i class="bi bi-navigation"></i> Cómo llegar';
    btnComoLlegar.className = 'btn btn-sm btn-success';
  } else {
    console.log("🔍 DIAGNÓSTICO - Sin ubicación, deshabilitando enlace");
    btnComoLlegar.href = '#';
    btnComoLlegar.removeAttribute('target');
    btnComoLlegar.setAttribute('aria-disabled', 'true');
    btnComoLlegar.style.pointerEvents = 'none';
    btnComoLlegar.style.opacity = '0.5';
    btnComoLlegar.style.cursor = 'not-allowed';
    
    // Cambiar texto conservando el ícono
    btnComoLlegar.innerHTML = '<i class="bi bi-navigation"></i> Ubicación no disponible';
    btnComoLlegar.className = 'btn btn-sm btn-secondary';
  }
  
  // Abrir modal
  const modalEl = document.getElementById("modalDetalleIncidencia");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

async function abrirModalSeguimiento(incidencia) {
  console.log('📋 abrirModalSeguimiento Incidencia (Técnico):', incidencia); // Debug
  try {
    const { id, folio, estatus } = incidencia;
    console.log('📋 abrirModalSeguimiento ID (Técnico):', id); // Debug
    
    // Validar que los elementos existan
    const segFolio = document.getElementById("seg-folio");
    const segEstatus = document.getElementById("seg-estatus");
    const modalEl = document.getElementById("modalSeguimiento");
    
    if (!segFolio || !segEstatus || !modalEl) {
      throw new Error('Elementos del modal no encontrados en el DOM (Técnico)');
    }
    
    segFolio.textContent = `Folio: ${folio}`;
    segEstatus.textContent = `Estatus: ${estatus}`;
    await cargarHistorial(id);
    
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } catch (err) {
    console.error('Error en abrirModalSeguimiento (Técnico):', err);
    alert(err.message);
  }
}

function abrirModalActualizarEstatus(incidencia, opciones = {}) {
  const { id, folio, estatus } = incidencia;
  const {
    forcedStatus = null,
    comentarioObligatorio = false,
    titulo = "Actualizar estatus",
    submitText = "Actualizar",
  } = opciones;
  
  document.getElementById("estatus-folio").textContent = `Folio: ${folio}`;
  document.getElementById("estatus-actual").value = estatus;
  if (els.estatusModalTitle) {
    els.estatusModalTitle.innerHTML = `<i class="bi bi-arrow-repeat"></i> ${titulo}`;
  }
  if (els.estatusModalSubmitText) {
    els.estatusModalSubmitText.textContent = submitText;
  }
  
  // Llenar opciones según reglas de negocio
  const select = document.getElementById("select-nuevo-estatus");
  select.innerHTML = "";
  
  const opcionesEstatus = forcedStatus
    ? [{ value: forcedStatus, label: formatHumanLabel(forcedStatus) }]
    : getOpcionesEstatus(estatus);
  opcionesEstatus.forEach(op => {
    const option = document.createElement("option");
    option.value = op.value;
    option.textContent = op.label;
    select.appendChild(option);
  });
  
  document.getElementById("input-comentario-estatus").value = "";
  
  // Guardar ID en el botón para usarlo después
  document.getElementById("btn-actualizar-estatus").dataset.id = id;
  estatusModalContext = { comentarioObligatorio };
  
  const modalEl = document.getElementById("modalActualizarEstatus");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function abrirModalRegistrarAvance(incidencia) {
  const { id, folio } = incidencia;
  const folioEl = document.getElementById("avance-folio");
  if (folioEl) folioEl.textContent = `Folio: ${folio}`;

  if (els.inputComentarioAvance) {
    els.inputComentarioAvance.value = "";
  }
  if (els.btnGuardarAvance) {
    els.btnGuardarAvance.dataset.id = id;
  }

  const modalEl = document.getElementById("modalRegistrarAvance");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function getOpcionesEstatus(estatusActual) {
  const estatus = normalizeLabel(estatusActual);
  switch(estatus) {
    case "asignada":
    case "asignado":
      return [{ value: 'EN_PROCESO', label: 'En proceso' }];
    case "en proceso":
      return [{ value: 'RESUELTA', label: 'Resuelta' }];
    default:
      return [];
  }
}

async function actualizarEstatus() {
  const btn = document.getElementById("btn-actualizar-estatus");
  const id = btn.dataset.id;
  const nuevoEstatus = document.getElementById("select-nuevo-estatus").value;
  const comentario = document.getElementById("input-comentario-estatus").value.trim();
  
  if (!nuevoEstatus) {
    alert("Selecciona un nuevo estatus");
    return;
  }
  if (estatusModalContext.comentarioObligatorio && !comentario) {
    alert("Debes capturar un comentario para continuar");
    return;
  }
  
  // Body correcto según lo que espera el backend
  const body = {
    estatus: nuevoEstatus,
    comentario: comentario || null
  };
  
  await fetchJSON(`${API}/incidencias/${id}/estatus`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  
  // Cerrar modal y recargar
  const modalEl = document.getElementById("modalActualizarEstatus");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.hide();
  
  await recargarTodo();
  showToast("Estatus actualizado", "success");
}

async function registrarAvance() {
  const id = Number(els.btnGuardarAvance?.dataset.id || 0);
  const comentario = String(els.inputComentarioAvance?.value || "").trim();

  if (!id || !comentario) {
    alert("Debes capturar un comentario");
    return;
  }

  await fetchJSON(`${API}/incidencias/${id}/seguimiento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      comentario,
    }),
  });

  const modalEl = document.getElementById("modalRegistrarAvance");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.hide();

  await recargarTodo();
  showToast("Avance registrado correctamente", "success");
}

async function recargarTodo() {
  setLoading(true);
  try {
    await cargarCatalogo();
    await cargarIncidencias();
  } finally {
    setLoading(false);
  }
}

// Event Listeners
els.btnRecargar.addEventListener("click", async () => {
  try { await recargarTodo(); }
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

els.filtroFolio?.addEventListener("input", aplicarFiltrosIncidencias);
els.filtroEstatus?.addEventListener("change", aplicarFiltrosIncidencias);
els.filtroPrioridad?.addEventListener("change", aplicarFiltrosIncidencias);
els.filtroFecha?.addEventListener("change", aplicarFiltrosIncidencias);

els.tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = parseInt(btn.dataset.id, 10);
  const folio = btn.dataset.folio;
  const estatus = btn.dataset.estatus;

  if (action === "detalle") {
    try {
      setLoading(true);
      await abrirModalDetalle({
        id,
        folio,
        estatus,
        direccion: btn.dataset.direccion,
        referencia: btn.dataset.referencia,
        latitud: btn.dataset.latitud,
        longitud: btn.dataset.longitud,
        titulo: btn.dataset.titulo,
        descripcion: btn.dataset.descripcion,
        tipo: btn.dataset.tipo,
        prioridad: btn.dataset.prioridad
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }
  
  if (action === "seguimiento") {
    try {
      setLoading(true);
      await abrirModalSeguimiento({ id, folio, estatus });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }
  
  if (action === "actualizar-estatus") {
    try {
      setLoading(true);
      await abrirModalActualizarEstatus({ id, folio, estatus });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (action === "iniciar-atencion") {
    try {
      setLoading(true);
      abrirModalActualizarEstatus(
        { id, folio, estatus },
        {
          forcedStatus: "EN_PROCESO",
          comentarioObligatorio: true,
          titulo: "Iniciar atención",
          submitText: "Iniciar",
        }
      );
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (action === "marcar-resuelta") {
    try {
      setLoading(true);
      abrirModalActualizarEstatus(
        { id, folio, estatus },
        {
          forcedStatus: "RESUELTA",
          comentarioObligatorio: true,
          titulo: "Marcar como resuelta",
          submitText: "Marcar resuelta",
        }
      );
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (action === "registrar-avance") {
    try {
      setLoading(true);
      abrirModalRegistrarAvance({ id, folio, estatus });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }
});

// Event listener para el botón del modal
document.getElementById("btn-actualizar-estatus").addEventListener("click", async () => {
  try {
    await actualizarEstatus();
  } catch (e) {
    alert(e.message);
  }
});

els.btnGuardarAvance?.addEventListener("click", async () => {
  try {
    await registrarAvance();
  } catch (e) {
    alert(e.message);
  }
});

// Event listener para botón de evidencias
document.getElementById("btn-subir-evidencias").addEventListener("click", async () => {
  try {
    await subirEvidencias();
  } catch (e) {
    alert(e.message);
  }
});

// Event delegation para botones dinámicos
document.addEventListener('click', async function(e) {
  const btn = e.target.closest('[data-action]');
  if (btn && btn.dataset.action === 'evidencias') {
    
    const incidencia = {
      id: btn.dataset.id,
      folio: btn.dataset.folio,
      estatus: btn.dataset.estatus
    };

    await abrirModalEvidencias(incidencia);
  }
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
