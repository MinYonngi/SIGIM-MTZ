/* ==========================================
   Portal Ciudadano SIGIM-MTZ - Lógica Principal
   ========================================== */

// Estado global de la aplicación
const estadoPortal = {
    vistaActual: 'inicio',
    reporteActual: null,
    ubicacionActual: null,
    catalogoTiposServicio: null,
    tipoServicioPendiente: null
};

// #region agent log
fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0bf53b'},body:JSON.stringify({sessionId:'0bf53b',runId:'run2',hypothesisId:'H6',location:'ciudadano.js:top-level',message:'Script ciudadano.js cargado',data:{readyState:document.readyState},timestamp:Date.now()})}).catch(()=>{});
// #endregion

/**
 * Slug URL / data-tipo-clave → nombre exacto esperado en catálogo (Tipo de servicio).
 * Debe coincidir con los registros activos de catalogo_tipos_servicio.
 */
const MAPEO_TIPO_SERVICIO_CLAVE = {
    'alumbrado-publico': 'Alumbrado público',
    'areas-verdes': 'Áreas verdes',
    bacheo: 'Bacheo',
    'danos-infraestructura-urbana': 'Daños en infraestructura urbana',
    drenaje: 'Drenaje',
    'fugas-de-agua': 'Fugas de agua',
    'recoleccion-basura': 'Recolección de basura',
    'senalizacion-vial': 'Señalización vial'
};

const CLAVES_TIPO_SERVICIO = Object.keys(MAPEO_TIPO_SERVICIO_CLAVE);

function esClaveTipoServicioValida(clave) {
    return typeof clave === 'string' && CLAVES_TIPO_SERVICIO.includes(clave);
}

function normalizarTextoTipo(s) {
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Resuelve el id del catálogo: primero nombre exacto (normalizado), luego contención mutua.
 */
function resolverTipoServicioIdPorClave(tiposServicio, clave) {
    if (!Array.isArray(tiposServicio) || !clave || !esClaveTipoServicioValida(clave)) {
        return null;
    }
    const nombreCanonico = MAPEO_TIPO_SERVICIO_CLAVE[clave];
    if (!nombreCanonico) return null;

    const target = normalizarTextoTipo(nombreCanonico);

    let found = tiposServicio.find((t) => normalizarTextoTipo(t.nombre) === target);
    if (found) return String(found.id);

    found = tiposServicio.find((t) => {
        const n = normalizarTextoTipo(t.nombre);
        return n.includes(target) || target.includes(n);
    });
    return found ? String(found.id) : null;
}

/**
 * Aplica al select #tipo-servicio el tipo pendiente según catálogo cargado.
 */
function aplicarTipoServicioPendiente() {
    const select = document.getElementById('tipo-servicio');
    const clave = estadoPortal.tipoServicioPendiente;
    if (!select || !clave) return;
    if (!estadoPortal.catalogoTiposServicio || !estadoPortal.catalogoTiposServicio.length) return;

    const id = resolverTipoServicioIdPorClave(estadoPortal.catalogoTiposServicio, clave);
    if (id) {
        const existe = [...select.options].some((o) => o.value === id);
        if (existe) {
            select.value = id;
        }
    }
    estadoPortal.tipoServicioPendiente = null;
}

/**
 * Navega a la vista registrar con tipo de servicio preseleccionado (y sincroniza ?tipo= en la URL).
 * @param {string} clave - Slug de MAPEO_TIPO_SERVICIO_CLAVE (ej. bacheo, alumbrado-publico)
 */
function irARegistrarConTipo(clave) {
    if (!esClaveTipoServicioValida(clave)) {
        console.warn('Clave de tipo no válida:', clave);
        mostrarVista('registrar');
        return;
    }
    estadoPortal.tipoServicioPendiente = clave;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('tipo', clave);
        const qs = url.searchParams.toString();
        history.replaceState({}, '', `${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`);
    } catch (e) {
        console.warn('No se pudo actualizar la URL:', e);
    }
    mostrarVista('registrar');
}

function limpiarTipoEnUrlSiInicio() {
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('tipo')) return;
        url.searchParams.delete('tipo');
        const qs = url.searchParams.toString();
        history.replaceState({}, '', `${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`);
    } catch (e) {
        /* ignorar */
    }
}

// ==========================================
// Carga de Catálogos Dinámicos
// ==========================================

/**
 * Carga los tipos de servicio activos desde el catálogo
 */
async function cargarTiposServicio() {
    try {
        console.log('📋 Cargando catálogo de tipos de servicio...');
        
        const response = await fetch('/api/catalogo/tipos-servicio');
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const tiposServicio = await response.json();
        
        console.log('📋 Tipos de servicio recibidos:', tiposServicio);
        
        estadoPortal.catalogoTiposServicio = tiposServicio;
        
        // Llenar el select dinámicamente
        llenarSelectTiposServicio(tiposServicio);
        
    } catch (error) {
        console.error('❌ Error al cargar tipos de servicio:', error);
        estadoPortal.catalogoTiposServicio = null;
        mostrarMensaje('No se pudieron cargar los tipos de servicio. Intenta recargar la página.', 'warning');
        
        // En caso de error, mantener opciones básicas
        mantenerOpcionesBasicas();
    }
}

/**
 * Llena el select de tipos de servicio con los datos del catálogo
 * @param {Array} tiposServicio - Array de tipos de servicio activos
 */
function llenarSelectTiposServicio(tiposServicio) {
    const select = document.getElementById('tipo-servicio');
    
    if (!select) {
        console.error('❌ No se encontró el select #tipo-servicio');
        return;
    }
    
    // Limpiar opciones existentes (menos la primera)
    select.innerHTML = '<option value="">Selecciona un tipo de servicio...</option>';
    
    // Agregar opciones dinámicas
    tiposServicio.forEach(tipo => {
        const option = document.createElement('option');
        option.value = tipo.id;
        option.textContent = tipo.nombre;
        select.appendChild(option);
    });
    
    console.log(`✅ Select llenado con ${tiposServicio.length} tipos de servicio`);
    
    aplicarTipoServicioPendiente();
}

/**
 * Mantiene opciones básicas en caso de error
 */
function mantenerOpcionesBasicas() {
    const select = document.getElementById('tipo-servicio');
    
    if (!select) return;
    
    estadoPortal.catalogoTiposServicio = null;
    
    // Si falla la carga del catálogo, mostrar solo opción vacía y advertencia
    select.innerHTML = `
        <option value="">Selecciona un tipo de servicio...</option>
    `;
    
    console.warn('⚠️ No se pudo cargar el catálogo de servicios. Por favor intenta más tarde.');
    mostrarMensaje('No se pudieron cargar los tipos de servicio. Por favor intenta más tarde.', 'warning');
}

/**
 * Función auxiliar para ir a consulta con folio del reporte actual
 */
function irAConsultaConFolio() {
    // Cambiar a vista de consulta
    mostrarVista('consultar');

    const resultado = document.getElementById('resultado-consulta');
    const noEncontrado = document.getElementById('no-encontrado');
    if (resultado) resultado.classList.add('d-none');
    if (noEncontrado) noEncontrado.classList.add('d-none');
    
    // Si existe un folio reciente en memoria, rellenar el campo
    if (estadoPortal.reporteActual && estadoPortal.reporteActual.folio) {
        const inputFolio = document.getElementById('folio-busqueda');
        if (inputFolio) {
            inputFolio.value = estadoPortal.reporteActual.folio;
        }
    }
}

/**
 * Oculta resultados de consulta y deja listo el formulario de folio (Nueva búsqueda / Intentar de nuevo).
 */
function resetVistaConsultaFolio() {
    const resultado = document.getElementById('resultado-consulta');
    const noEncontrado = document.getElementById('no-encontrado');
    const inputFolio = document.getElementById('folio-busqueda');
    if (resultado) resultado.classList.add('d-none');
    if (noEncontrado) noEncontrado.classList.add('d-none');
    if (inputFolio) {
        inputFolio.value = '';
        inputFolio.focus();
    }
}

// ==========================================
// Sistema de Navegación entre Vistas
// ==========================================

/**
 * Muestra una vista específica y oculta las demás
 * @param {string} nombreVista - Nombre de la vista a mostrar
 */
function mostrarVista(nombreVista) {
    // Ocultar todas las vistas
    document.querySelectorAll('.vista-activa, .vista-inactiva').forEach(vista => {
        vista.classList.remove('vista-activa');
        vista.classList.add('vista-inactiva');
    });
    
    // Mostrar la vista solicitada
    const vistaObjetivo = document.getElementById(`vista-${nombreVista}`);
    if (vistaObjetivo) {
        vistaObjetivo.classList.remove('vista-inactiva');
        vistaObjetivo.classList.add('vista-activa');
        estadoPortal.vistaActual = nombreVista;

        if (nombreVista === 'inicio') {
            estadoPortal.tipoServicioPendiente = null;
            limpiarTipoEnUrlSiInicio();
        }

        if (nombreVista === 'consultar') {
            const resultado = document.getElementById('resultado-consulta');
            const noEncontrado = document.getElementById('no-encontrado');
            if (resultado) resultado.classList.add('d-none');
            if (noEncontrado) noEncontrado.classList.add('d-none');
        }

        if (nombreVista === 'registrar') {
            aplicarTipoServicioPendiente();
        }
        
        // Scroll suave al inicio
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        console.log(`🔄 Vista cambiada a: ${nombreVista}`);
    } else {
        console.error(`❌ Vista no encontrada: vista-${nombreVista}`);
    }
}

// ==========================================
// Funcionalidad de Geolocalización
// ==========================================

/**
 * Obtiene la ubicación actual del usuario
 */
function obtenerUbicacionActual() {
    const btnUbicacion = document.getElementById('btn-ubicacion');
    
    if (!navigator.geolocation) {
        mostrarMensaje('Tu navegador no soporta geolocalización', 'warning');
        return;
    }
    
    // Mostrar estado de carga
    btnUbicacion.innerHTML = '<i class="bi bi-geo-alt-fill me-2"></i> Obteniendo ubicación...';
    btnUbicacion.disabled = true;
    btnUbicacion.classList.add('loading');
    
    navigator.geolocation.getCurrentPosition(
        // Éxito
        (position) => {
            const { latitude, longitude } = position.coords;
            estadoPortal.ubicacionActual = { latitude, longitude };
            
            // Actualizar botón
            btnUbicacion.innerHTML = '<i class="bi bi-geo-alt-fill me-2"></i>Ubicación obtenida';
            btnUbicacion.disabled = false;
            btnUbicacion.classList.remove('loading');
            
            console.log('📍 Ubicación obtenida:', { latitude, longitude });
        },
        // Error
        (error) => {
            console.error('❌ Error obteniendo ubicación:', error);
            mostrarMensaje('No se pudo obtener tu ubicación', 'danger');
            btnUbicacion.innerHTML = '<i class="bi bi-geo-alt-fill me-2"></i>Usar mi ubicación actual';
            btnUbicacion.disabled = false;
            btnUbicacion.classList.remove('loading');
        },
        // Opciones
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutos
        }
    );
}

// ==========================================
// Gestión de Formularios
// ==========================================

/**
 * Inicializa el formulario de registro de reporte
 */
function inicializarFormularioReporte() {
    const form = document.getElementById('form-reporte');
    const btnUbicacion = document.getElementById('btn-ubicacion');
    const inputFoto = document.getElementById('evidencia-foto');
    
    // Cargar catálogo de tipos de servicio
    cargarTiposServicio();
    
    // Evento de geolocalización
    btnUbicacion.addEventListener('click', obtenerUbicacionActual);
    
    // Evento de selección de foto (TEMPORAL - Solo para desarrollo)
    if (inputFoto) {
        inputFoto.addEventListener('change', manejarSeleccionFoto);
    }
    
    // Evento de envío del formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await procesarRegistroReporte();
    });
}

/**
 * Maneja la selección de archivo de foto (TEMPORAL - Solo para desarrollo)
 * En producción se integrará con backend para subida real
 * @param {Event} event - Evento de cambio de archivo
 */
function manejarSeleccionFoto(event) {
    const archivo = event.target.files[0];
    const vistaPrevia = document.getElementById('vista-previa-foto');
    const imagenPrevia = document.getElementById('imagen-previa');
    
    if (!archivo) {
        vistaPrevia.classList.add('d-none');
        return;
    }
    
    // Validar tipo de archivo
    if (!archivo.type.startsWith('image/')) {
        mostrarMensaje('Por favor selecciona un archivo de imagen válido', 'warning');
        event.target.value = '';
        vistaPrevia.classList.add('d-none');
        return;
    }
    
    // Validar tamaño (5MB máximo)
    const tamanoMaximo = 5 * 1024 * 1024; // 5MB
    if (archivo.size > tamanoMaximo) {
        mostrarMensaje('La imagen no debe superar los 5MB', 'warning');
        event.target.value = '';
        vistaPrevia.classList.add('d-none');
        return;
    }
    
    // Mostrar vista previa
    const reader = new FileReader();
    reader.onload = function(e) {
        imagenPrevia.src = e.target.result;
        vistaPrevia.classList.remove('d-none');
    };
    reader.readAsDataURL(archivo);
    
    console.log('📷 Foto seleccionada (TEMPORAL):', archivo.name, archivo.size);
}

/**
 * Elimina la foto seleccionada (TEMPORAL - Solo para desarrollo)
 */
function eliminarFoto() {
    const inputFoto = document.getElementById('evidencia-foto');
    const vistaPrevia = document.getElementById('vista-previa-foto');
    const imagenPrevia = document.getElementById('imagen-previa');
    
    // Limpiar input y vista previa
    inputFoto.value = '';
    imagenPrevia.src = '';
    vistaPrevia.classList.add('d-none');
    
    console.log('🗑️ Foto eliminada (TEMPORAL)');
}

/**
 * Procesa el registro de un nuevo reporte
 */
async function procesarRegistroReporte() {
    console.log('🚀 Iniciando registro de reporte real...');
    console.log('🔍 Verificando elementos del formulario...');
    
    // Verificar que el formulario existe
    const form = document.getElementById('form-reporte');
    if (!form) {
        console.error('❌ Formulario no encontrado');
        return;
    }
    
    // Validar dirección obligatoria
    const direccion = document.getElementById('direccion').value.trim();
    if (!direccion) {
        console.log('❌ Validación fallida: dirección vacía');
        mostrarMensaje('La dirección es obligatoria para registrar el reporte', 'warning');
        return;
    }
    
    console.log('✅ Validación pasada, creando FormData...');
    
    // Crear FormData para multipart
    const formData = new FormData();
    
    // Agregar campos del formulario con nombres reales del backend
    const tipoServicio = document.getElementById('tipo-servicio').value;
    const titulo = document.getElementById('titulo').value;
    const descripcion = document.getElementById('descripcion').value;
    
    console.log('📝 Campos del formulario:', {
        tipo_servicio_id: tipoServicio,
        titulo: titulo,
        descripcion: descripcion,
        direccion: direccion
    });
    
    formData.append('tipo_servicio_id', tipoServicio);
    formData.append('titulo', titulo);
    formData.append('descripcion', descripcion);
    formData.append('direccion', direccion);
    formData.append('referencia', document.getElementById('referencia').value);
    formData.append('colonia', document.getElementById('colonia').value);
    formData.append('ciudadano_nombre', document.getElementById('nombre').value);
    formData.append('ciudadano_tel', document.getElementById('telefono').value);
    
    // Agregar coordenadas si existen
    if (estadoPortal.ubicacionActual && 
        estadoPortal.ubicacionActual.latitude !== null && 
        estadoPortal.ubicacionActual.longitude !== null) {
        formData.append('latitud', estadoPortal.ubicacionActual.latitude);
        formData.append('longitud', estadoPortal.ubicacionActual.longitude);
        console.log('📍 Coordenadas agregadas:', estadoPortal.ubicacionActual);
    }
    
    // Agregar foto si existe
    const inputFoto = document.getElementById('evidencia-foto');
    if (inputFoto && inputFoto.files[0]) {
        formData.append('evidencia_foto', inputFoto.files[0]);
        console.log('📷 Foto agregada:', inputFoto.files[0].name);
    }
    
    // Validación básica
    if (!formData.get('tipo_servicio_id') || !formData.get('titulo') || !formData.get('descripcion')) {
        console.log('❌ Validación fallida: campos obligatorios vacíos');
        mostrarMensaje('Por favor completa los campos obligatorios', 'warning');
        return;
    }
    
    console.log('📤 Enviando datos al backend:', {
        endpoint: 'POST /api/public/incidencias',
        campos: Object.fromEntries(formData.entries())
    });
    
    // Mostrar estado de carga
    const btnSubmit = document.querySelector('#form-reporte button[type="submit"]');
    const textoOriginal = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i class="bi bi-hourglass-split me-2"></i> Enviando...';
    btnSubmit.disabled = true;
    
    try {
        console.log('🌐 Iniciando fetch a /api/public/incidencias...');
        
        // Llamada real al backend
        const response = await fetch('/api/public/incidencias', {
            method: 'POST',
            body: formData
        });
        
        console.log('📥 Respuesta del backend - Status:', response.status);
        console.log('📥 Respuesta del backend - Headers:', response.headers);
        
        const result = await response.json();
        console.log('📥 Respuesta del backend - JSON:', result);
        
        if (result.success) {
            // Guardar en estado global
            estadoPortal.reporteActual = {
                ...result.data,
                // Agregar datos adicionales para confirmación
                titulo: formData.get('titulo'),
                descripcion: formData.get('descripcion'),
                direccion: formData.get('direccion'),
                nombre: formData.get('ciudadano_nombre'),
                telefono: formData.get('ciudadano_tel')
            };
            
            // Mostrar confirmación
            mostrarConfirmacionReporte(estadoPortal.reporteActual);
            console.log('✅ Reporte registrado exitosamente:', result.data);
        } else {
            console.error('❌ Error del backend:', result.message);
            mostrarMensaje(result.message || 'Error al registrar el reporte', 'danger');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack
        });
        mostrarMensaje('Error de conexión con el servidor', 'danger');
    } finally {
        // Restaurar botón
        btnSubmit.innerHTML = textoOriginal;
        btnSubmit.disabled = false;
        console.log('🔄 Botón restaurado');
    }
}

/**
 * Muestra la vista de confirmación con los datos del reporte
 * @param {Object} reporte - Datos del reporte registrado
 */
function mostrarConfirmacionReporte(reporte) {
    // Actualizar datos en la vista de confirmación (solo el texto del folio, conservando icono HTML)
    const folioTexto = document.getElementById('folio-generado-texto');
    if (folioTexto) {
        folioTexto.textContent = reporte.folio;
    }
    document.getElementById('fecha-registro').textContent = new Date(reporte.fechaRegistro).toLocaleString('es-MX');
    document.getElementById('titulo-confirmacion').textContent = reporte.titulo;
    
    // Cambiar a vista de confirmación
    mostrarVista('confirmacion');
}

/**
 * Inicializa el formulario de consulta por folio
 */
function inicializarFormularioConsulta() {
    const form = document.getElementById('form-consulta');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await procesarConsultaFolio();
    });
}

/**
 * Procesa la búsqueda de un reporte por folio
 */
async function procesarConsultaFolio() {
    const folioInput = document.getElementById('folio-busqueda');
    const folio = folioInput.value.trim();
    
    if (!folio) {
        mostrarMensaje('Por favor ingresa un número de folio', 'warning');
        return;
    }
    
    console.log('🔍 Buscando reporte con folio:', folio);
    console.log('📤 Enviando consulta al backend:', {
        endpoint: `GET /api/public/incidencias/${folio}`
    });
    
    // Mostrar estado de carga
    const btnSubmit = document.querySelector('#form-consulta button[type="submit"]');
    const textoOriginal = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i class="bi bi-hourglass-split me-2"></i> Buscando...';
    btnSubmit.disabled = true;
    
    try {
        // Llamada real al backend
        const response = await fetch(`/api/public/incidencias/${folio}`);
        
        console.log('📥 Respuesta del backend - Status:', response.status);
        
        const result = await response.json();
        console.log('📥 Respuesta del backend - JSON:', result);
        
        if (result.success) {
            // Mostrar resultado real
            mostrarResultadoConsulta(result.data);
            console.log('✅ Reporte encontrado:', result.data);
        } else {
            // Mostrar mensaje de no encontrado
            if (result.error === 'FOLIO_NOT_FOUND') {
                mostrarMensajeNoEncontrado();
            } else {
                mostrarMensaje(result.message || 'Error al buscar el reporte', 'danger');
            }
            console.error('❌ Error del backend:', result.message);
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        mostrarMensaje('Error de conexión con el servidor', 'danger');
    } finally {
        // Restaurar botón
        btnSubmit.innerHTML = textoOriginal;
        btnSubmit.disabled = false;
    }
}

/**
 * Muestra el resultado de la búsqueda
 * @param {Object} reporte - Reporte encontrado
 */
function mostrarResultadoConsulta(reporte) {
    // Actualizar datos en la vista
    document.getElementById('resultado-folio').textContent = reporte.folio;
    document.getElementById('resultado-titulo').textContent = reporte.titulo;
    document.getElementById('resultado-fecha').textContent = new Date(reporte.fechaRegistro).toLocaleString('es-MX');
    document.getElementById('resultado-actualizacion').textContent = new Date(reporte.ultimaActualizacion).toLocaleString('es-MX');
    
    // Actualizar badge de estatus
    const estatusBadge = document.getElementById('resultado-estatus');
    const estatusClass = obtenerClaseEstatus(reporte.estatus);
    estatusBadge.innerHTML = `<span class="badge ${estatusClass}">${reporte.estatus}</span>`;
    
    // Ocultar mensaje de no encontrado y mostrar resultado
    document.getElementById('no-encontrado').classList.add('d-none');
    document.getElementById('resultado-consulta').classList.remove('d-none');
    
    // Limpiar campo de búsqueda
    document.getElementById('folio-busqueda').value = '';
    
    mostrarMensaje('Reporte encontrado', 'success');
}

/**
 * Muestra mensaje de reporte no encontrado
 */
function mostrarMensajeNoEncontrado() {
    // Ocultar resultado y mostrar mensaje de no encontrado
    document.getElementById('resultado-consulta').classList.add('d-none');
    document.getElementById('no-encontrado').classList.remove('d-none');
    
    // Limpiar campo de búsqueda
    document.getElementById('folio-busqueda').value = '';
    
    mostrarMensaje('No se encontró un reporte con ese folio', 'warning');
}

/**
 * Obtiene la clase CSS para el badge de estatus
 * @param {string} estatus - Estatus del reporte
 * @returns {string} Clase CSS para el badge
 */
function obtenerClaseEstatus(estatus) {
    const clases = {
        'NUEVA': 'bg-secondary',
        'ASIGNADA': 'bg-primary',
        'EN_PROCESO': 'bg-warning',
        'RESUELTA': 'bg-info',
        'CERRADA': 'bg-success',
        'RECHAZADA': 'bg-danger'
    };
    
    return clases[estatus] || 'bg-secondary';
}

// ==========================================
// Utilidades
// ==========================================

/**
 * Muestra un mensaje toast al usuario
 * @param {string} mensaje - Mensaje a mostrar
 * @param {string} tipo - Tipo de mensaje (success, warning, danger, info)
 */
function mostrarMensaje(mensaje, tipo = 'info') {
    // Crear toast si no existe
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }
    
    // Crear toast
    const toastId = `toast-${Date.now()}`;
    const toastHTML = `
        <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header bg-${tipo} text-white">
                <strong class="me-auto">
                    <i class="bi bi-${obtenerIconoToast(tipo)} me-2"></i>
                    SIGIM-MTZ
                </strong>
                <small>Ahora</small>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Cerrar"></button>
            </div>
            <div class="toast-body">
                ${mensaje}
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    
    // Mostrar toast
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
    
    // Eliminar toast después de ocultarse
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

/**
 * Obtiene el icono apropiado para el tipo de mensaje
 * @param {string} tipo - Tipo de mensaje
 * @returns {string} Nombre del icono
 */
function obtenerIconoToast(tipo) {
    const iconos = {
        'success': 'check-circle-fill',
        'warning': 'exclamation-triangle-fill',
        'danger': 'x-circle-fill',
        'info': 'info-circle-fill'
    };
    
    return iconos[tipo] || 'info-circle-fill';
}

/**
 * Topbar portal: primer clic abre panel "Acceso interno",
 * segundo clic en la opción navega al login existente.
 */
function inicializarTopbarAccesoInterno() {
    const btn = document.getElementById('btn-topbar-acceso');
    const panel = document.getElementById('topbar-acceso-panel');
    const accesoInternoLink = panel ? panel.querySelector('.topbar-acceso-panel__btn[href="/login.html"]') : null;
    if (!btn || !panel) return;

    const topbar = document.querySelector('.topbar-mtz');
    const wrap = document.querySelector('.topbar-acceso-wrap');
    // #region agent log
    fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0bf53b'},body:JSON.stringify({sessionId:'0bf53b',runId:'run1',hypothesisId:'H1',location:'ciudadano.js:inicializarTopbarAccesoInterno:init',message:'Estado inicial topbar acceso',data:{btnExists:Boolean(btn),panelExists:Boolean(panel),topbarOverflow:topbar?getComputedStyle(topbar).overflow:null,topbarOverflowY:topbar?getComputedStyle(topbar).overflowY:null,wrapOverflow:wrap?getComputedStyle(wrap).overflow:null,panelPosition:getComputedStyle(panel).position,panelDisplay:getComputedStyle(panel).display,panelVisibility:getComputedStyle(panel).visibility,panelOpacity:getComputedStyle(panel).opacity},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const cerrarPanel = () => {
        panel.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
        // #region agent log
        fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0bf53b'},body:JSON.stringify({sessionId:'0bf53b',runId:'run1',hypothesisId:'H3',location:'ciudadano.js:inicializarTopbarAccesoInterno:cerrarPanel',message:'Panel cerrado',data:{isOpen:panel.classList.contains('is-open'),ariaExpanded:btn.getAttribute('aria-expanded')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
    };

    const abrirPanel = () => {
        panel.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        const rect = panel.getBoundingClientRect();
        // #region agent log
        fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0bf53b'},body:JSON.stringify({sessionId:'0bf53b',runId:'run1',hypothesisId:'H2',location:'ciudadano.js:inicializarTopbarAccesoInterno:abrirPanel',message:'Panel abierto con métricas de layout',data:{isOpen:panel.classList.contains('is-open'),ariaExpanded:btn.getAttribute('aria-expanded'),panelTop:rect.top,panelLeft:rect.left,panelWidth:rect.width,panelHeight:rect.height,panelDisplay:getComputedStyle(panel).display,panelVisibility:getComputedStyle(panel).visibility,panelOpacity:getComputedStyle(panel).opacity,topbarClientHeight:topbar?topbar.clientHeight:null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
    };

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const abierto = panel.classList.contains('is-open');
        // #region agent log
        fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0bf53b'},body:JSON.stringify({sessionId:'0bf53b',runId:'run1',hypothesisId:'H4',location:'ciudadano.js:inicializarTopbarAccesoInterno:btnClick',message:'Click en botón topbar acceso',data:{wasOpen:abierto,btnTag:btn.tagName,panelClassName:panel.className},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (abierto) cerrarPanel();
        else abrirPanel();
    });

    document.addEventListener('click', (e) => {
        if (!panel.classList.contains('is-open')) return;
        if (panel.contains(e.target) || btn.contains(e.target)) return;
        // #region agent log
        fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0bf53b'},body:JSON.stringify({sessionId:'0bf53b',runId:'run1',hypothesisId:'H5',location:'ciudadano.js:inicializarTopbarAccesoInterno:outsideClick',message:'Cierre por click externo',data:{targetTag:e.target&&e.target.tagName?e.target.tagName:null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        cerrarPanel();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cerrarPanel();
    });

    if (accesoInternoLink) {
        accesoInternoLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // #region agent log
            fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0bf53b'},body:JSON.stringify({sessionId:'0bf53b',runId:'run3',hypothesisId:'H8',location:'ciudadano.js:inicializarTopbarAccesoInterno:accesoInternoLinkClick',message:'Navegación forzada a login desde acceso interno',data:{hrefAttr:accesoInternoLink.getAttribute('href'),currentPath:window.location.pathname},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            cerrarPanel();
            window.location.assign('/login.html');
        });
    }
}

// ==========================================
// Inicialización de la Aplicación
// ==========================================

/**
 * Inicializa la aplicación cuando el DOM está listo
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Portal Ciudadano SIGIM-MTZ iniciado');
    
    // Inicializar formularios
    inicializarFormularioReporte();
    inicializarFormularioConsulta();
    inicializarTopbarAccesoInterno();

    // #region agent log
    fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0bf53b'},body:JSON.stringify({sessionId:'0bf53b',runId:'run2',hypothesisId:'H7',location:'ciudadano.js:DOMContentLoaded',message:'Elementos topbar en DOM',data:{btnTopbarAcceso:!!document.getElementById('btn-topbar-acceso'),panelTopbarAcceso:!!document.getElementById('topbar-acceso-panel'),topbarWrap:!!document.querySelector('.topbar-acceso-wrap')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    
    // Vista inicial o registro si hay ?tipo= válido en la URL
    let params;
    try {
        params = new URLSearchParams(window.location.search);
    } catch (e) {
        params = new URLSearchParams();
    }
    const tipoUrl = params.get('tipo');
    if (tipoUrl && esClaveTipoServicioValida(tipoUrl)) {
        estadoPortal.tipoServicioPendiente = tipoUrl;
        mostrarVista('registrar');
    } else {
        mostrarVista('inicio');
    }
    
    // Configurar tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // Agregar clase para animación inicial
    document.body.classList.add('fade-in-up');
    
    console.log('✅ Portal Ciudadano listo para uso');
});

// ==========================================
// Manejo de Errores Globales
// ==========================================

window.addEventListener('error', (event) => {
    console.error('❌ Error no controlado:', event.error);
    mostrarMensaje('Ha ocurrido un error inesperado', 'danger');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Promesa rechazada no controlada:', event.reason);
    mostrarMensaje('Error en la conexión con el servidor', 'danger');
});
