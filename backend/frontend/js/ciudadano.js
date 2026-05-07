/* ==========================================
   Portal Ciudadano SIGIM-MTZ - Lógica Principal
   ========================================== */

// Estado global de la aplicación
const estadoPortal = {
    vistaActual: 'inicio',
    reporteActual: null,
    ubicacionActual: null,
    catalogoTiposServicio: null,
    tipoServicioPendiente: null,
    ultimoFolioConConfeti: null,
    wizardReporte: {
        pasoActual: 1,
        totalPasos: 3
    }
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
    sincronizarTarjetaTipoSeleccionada();
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

function obtenerTextoTipoServicioSeleccionado() {
    const select = document.getElementById('tipo-servicio');
    if (!select) return '';
    const opcionSeleccionada = select.options[select.selectedIndex];
    if (!opcionSeleccionada) return '';
    return String(opcionSeleccionada.textContent || '').trim();
}

function valorTextoSeguro(valor, fallback = 'No especificado') {
    const texto = String(valor ?? '').trim();
    return texto || fallback;
}

function formatearFechaLarga(fecha) {
    const valorFecha = fecha ? new Date(fecha) : new Date();
    if (Number.isNaN(valorFecha.getTime())) {
        return new Date().toLocaleString('es-MX');
    }
    return valorFecha.toLocaleString('es-MX', {
        dateStyle: 'full',
        timeStyle: 'short'
    });
}

function nombreArchivoSeguro(base) {
    return String(base || 'reporte')
        .toLowerCase()
        .replace(/[^a-z0-9\-_.]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function respetaReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function dispararConfetiConfirmacion(reporte) {
    if (respetaReducedMotion()) return;
    if (typeof window.confetti !== 'function') return;

    const folioActual = String(reporte?.folio || '').trim();
    if (!folioActual || estadoPortal.ultimoFolioConConfeti === folioActual) return;
    estadoPortal.ultimoFolioConConfeti = folioActual;

    const fin = Date.now() + 1900;
    const defaults = {
        startVelocity: 28,
        spread: 62,
        ticks: 120,
        gravity: 1.05,
        scalar: 0.88,
        zIndex: 2000,
        colors: ['#7b1b27', '#8a2431', '#c8a447', '#f0d98a', '#ffffff']
    };

    const intervalo = window.setInterval(() => {
        const tiempoRestante = fin - Date.now();
        if (tiempoRestante <= 0) {
            window.clearInterval(intervalo);
            return;
        }

        const conteo = Math.max(6, Math.round(26 * (tiempoRestante / 1900)));
        window.confetti({
            ...defaults,
            particleCount: conteo,
            origin: { x: 0.16, y: 0.22 }
        });
        window.confetti({
            ...defaults,
            particleCount: conteo,
            origin: { x: 0.84, y: 0.22 }
        });
    }, 230);
}

function construirDatosComprobante(reporte) {
    return {
        folio: valorTextoSeguro(reporte?.folio, 'SIGIM-SIN-FOLIO'),
        fechaRegistro: formatearFechaLarga(reporte?.fechaRegistro),
        tipoServicio: valorTextoSeguro(reporte?.tipoServicioTexto),
        titulo: valorTextoSeguro(reporte?.titulo),
        descripcion: valorTextoSeguro(reporte?.descripcion),
        direccion: valorTextoSeguro(reporte?.direccion),
        referencia: valorTextoSeguro(reporte?.referencia, 'No proporcionada'),
        colonia: valorTextoSeguro(reporte?.colonia, 'No proporcionada'),
        nombre: valorTextoSeguro(reporte?.nombre, 'No proporcionado'),
        telefono: valorTextoSeguro(reporte?.telefono, 'No proporcionado')
    };
}

function cargarImagenComoDataUrl(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (error) {
                reject(error);
            }
        };
        img.onerror = () => reject(new Error('No se pudo cargar el logo para el comprobante.'));
        img.src = src;
    });
}

async function descargarComprobanteReporteActual() {
    if (!estadoPortal.reporteActual) {
        mostrarMensaje('Aún no hay un reporte confirmado para descargar.', 'warning');
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        mostrarMensaje('No se pudo inicializar el generador de PDF.', 'danger');
        return;
    }

    const btnDescargar = document.getElementById('btn-descargar-comprobante');
    const textoOriginal = btnDescargar ? btnDescargar.innerHTML : '';
    if (btnDescargar) {
        btnDescargar.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Generando PDF...';
        btnDescargar.disabled = true;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const datos = construirDatosComprobante(estadoPortal.reporteActual);

        doc.setFillColor(123, 27, 39);
        doc.rect(0, 0, 210, 30, 'F');

        try {
            const logoData = await cargarImagenComoDataUrl('assets/Logo.png');
            doc.addImage(logoData, 'PNG', 14, 8, 30, 14);
        } catch (logoError) {
            console.warn('No se pudo incluir el logo en el comprobante:', logoError);
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('SIGIM-MTZ | Comprobante de reporte ciudadano', 50, 14);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text('Ayuntamiento de Martinez de la Torre', 50, 20);

        doc.setTextColor(47, 41, 38);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Confirmacion de registro', 14, 40);

        let y = 50;
        const fila = (etiqueta, valor) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text(`${etiqueta}:`, 14, y);
            doc.setFont('helvetica', 'normal');
            const lineas = doc.splitTextToSize(valor, 145);
            doc.text(lineas, 52, y);
            y += Math.max(8, lineas.length * 5);
        };

        fila('Folio', datos.folio);
        fila('Fecha de registro', datos.fechaRegistro);
        fila('Tipo de servicio', datos.tipoServicio);
        fila('Titulo del reporte', datos.titulo);
        fila('Descripcion', datos.descripcion);
        fila('Direccion', datos.direccion);
        fila('Referencia', datos.referencia);
        fila('Colonia', datos.colonia);
        fila('Nombre', datos.nombre);
        fila('Telefono', datos.telefono);

        y += 4;
        doc.setDrawColor(200, 164, 71);
        doc.line(14, y, 196, y);
        y += 8;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        const mensaje = 'Tu reporte fue registrado correctamente. Conserva este comprobante para consulta y seguimiento con tu folio.';
        doc.text(doc.splitTextToSize(mensaje, 180), 14, y);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(93, 93, 93);
        doc.text(`Generado el ${new Date().toLocaleString('es-MX')}`, 14, 286);

        const archivo = `comprobante-${nombreArchivoSeguro(datos.folio)}.pdf`;
        doc.save(archivo);
        mostrarMensaje('Comprobante descargado correctamente.', 'success');
    } catch (error) {
        console.error('❌ Error al generar comprobante:', error);
        mostrarMensaje('No se pudo generar el comprobante PDF.', 'danger');
    } finally {
        if (btnDescargar) {
            btnDescargar.innerHTML = textoOriginal;
            btnDescargar.disabled = false;
        }
    }
}

function inicializarAccionesConfirmacion() {
    const btnDescargar = document.getElementById('btn-descargar-comprobante');
    if (!btnDescargar || btnDescargar.dataset.ready === '1') return;
    btnDescargar.dataset.ready = '1';
    btnDescargar.addEventListener('click', descargarComprobanteReporteActual);
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
    renderizarTarjetasTipoServicio();
    sincronizarTarjetaTipoSeleccionada();
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
    renderizarTarjetasTipoServicio();
    sincronizarTarjetaTipoSeleccionada();
    
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
            mostrarPasoWizard(1);
            actualizarResumenPaso3();
            actualizarContadorDescripcion();
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
    btnUbicacion.classList.add('is-locating');
    btnUbicacion.classList.remove('is-location-ok');
    
    navigator.geolocation.getCurrentPosition(
        // Éxito
        (position) => {
            const { latitude, longitude } = position.coords;
            estadoPortal.ubicacionActual = { latitude, longitude };
            
            // Actualizar botón
            btnUbicacion.innerHTML = '<i class="bi bi-geo-alt-fill me-2"></i>Ubicación obtenida';
            btnUbicacion.disabled = false;
            btnUbicacion.classList.remove('loading');
            btnUbicacion.classList.remove('is-locating');
            btnUbicacion.classList.add('is-location-ok');
            
            console.log('📍 Ubicación obtenida:', { latitude, longitude });
        },
        // Error
        (error) => {
            console.error('❌ Error obteniendo ubicación:', error);
            mostrarMensaje('No se pudo obtener tu ubicación', 'danger');
            btnUbicacion.innerHTML = '<i class="bi bi-geo-alt-fill me-2"></i>Usar mi ubicación actual';
            btnUbicacion.disabled = false;
            btnUbicacion.classList.remove('loading');
            btnUbicacion.classList.remove('is-locating');
            btnUbicacion.classList.remove('is-location-ok');
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

function renderizarTarjetasTipoServicio() {
    const select = document.getElementById('tipo-servicio');
    const cardsContainer = document.getElementById('tipo-servicio-cards');

    if (!select || !cardsContainer) return;

    const opciones = [...select.options].filter((opcion) => opcion.value);
    cardsContainer.innerHTML = '';

    opciones.forEach((opcion) => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'portal-service-card';
        boton.dataset.value = opcion.value;
        boton.textContent = opcion.textContent;
        boton.setAttribute('aria-label', `Seleccionar tipo de servicio ${opcion.textContent}`);
        boton.addEventListener('click', () => {
            select.value = opcion.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        cardsContainer.appendChild(boton);
    });
}

function sincronizarTarjetaTipoSeleccionada() {
    const select = document.getElementById('tipo-servicio');
    const cardsContainer = document.getElementById('tipo-servicio-cards');

    if (!select || !cardsContainer) return;

    cardsContainer.querySelectorAll('.portal-service-card').forEach((card) => {
        card.classList.toggle('is-selected', card.dataset.value === select.value);
    });
}

function actualizarContadorDescripcion() {
    const descripcion = document.getElementById('descripcion');
    const contador = document.getElementById('descripcion-contador');
    if (!descripcion || !contador) return;

    const longitud = descripcion.value.length;
    contador.textContent = `${longitud} / 600`;
}

function limpiarErrorCampo(campo) {
    if (!campo) return;
    const grupo = campo.closest('.portal-field-group');
    if (!grupo) return;
    grupo.classList.remove('portal-field-error');
    const mensaje = grupo.querySelector('.portal-inline-error');
    if (mensaje) {
        mensaje.remove();
    }
}

function marcarErrorCampo(campo, mensaje) {
    if (!campo) return;
    const grupo = campo.closest('.portal-field-group');
    if (!grupo) return;

    grupo.classList.add('portal-field-error');
    let mensajeError = grupo.querySelector('.portal-inline-error');
    if (!mensajeError) {
        mensajeError = document.createElement('div');
        mensajeError.className = 'portal-inline-error';
        grupo.appendChild(mensajeError);
    }
    mensajeError.textContent = mensaje;
}

function validarPasoActual(paso) {
    const reglas = {
        1: [
            { id: 'tipo-servicio', mensaje: 'Selecciona el tipo de servicio.' },
            { id: 'titulo', mensaje: 'Ingresa el título del reporte.' },
            { id: 'descripcion', mensaje: 'Describe la incidencia para continuar.' }
        ],
        2: [
            { id: 'direccion', mensaje: 'Ingresa la dirección del incidente.' }
        ],
        3: []
    };

    const reglasPaso = reglas[paso] || [];
    const panelPaso = document.querySelector(`#form-reporte .portal-wizard-step[data-step="${paso}"]`);
    let primerCampoInvalido = null;

    reglasPaso.forEach(({ id, mensaje }) => {
        const campo = document.getElementById(id);
        if (!campo) return;

        const valor = String(campo.value || '').trim();
        if (!valor) {
            marcarErrorCampo(campo, mensaje);
            if (!primerCampoInvalido) {
                primerCampoInvalido = campo;
            }
        } else {
            limpiarErrorCampo(campo);
        }
    });

    if (panelPaso) {
        panelPaso.classList.toggle('portal-step-has-errors', !!primerCampoInvalido);
    }

    if (primerCampoInvalido) {
        primerCampoInvalido.focus();
        return false;
    }

    return true;
}

function actualizarStepperUI(pasoActual) {
    document.querySelectorAll('#form-reporte [data-step-indicator]').forEach((item) => {
        const paso = Number(item.dataset.stepIndicator);
        item.classList.remove('is-active', 'is-complete', 'is-pending');
        if (paso < pasoActual) {
            item.classList.add('is-complete');
            return;
        }
        if (paso === pasoActual) {
            item.classList.add('is-active');
            return;
        }
        item.classList.add('is-pending');
    });
}

function actualizarResumenPaso3() {
    const tipoServicio = document.getElementById('tipo-servicio');
    const titulo = document.getElementById('titulo');
    const direccion = document.getElementById('direccion');
    const nombre = document.getElementById('nombre');
    const telefono = document.getElementById('telefono');
    const evidencia = document.getElementById('evidencia-foto');

    const resumenTipo = document.getElementById('resumen-tipo');
    const resumenTitulo = document.getElementById('resumen-titulo');
    const resumenDireccion = document.getElementById('resumen-direccion');
    const resumenContacto = document.getElementById('resumen-contacto');
    const resumenEvidencia = document.getElementById('resumen-evidencia');

    if (resumenTipo && tipoServicio) {
        const texto = tipoServicio.options[tipoServicio.selectedIndex]?.textContent || 'Sin definir';
        resumenTipo.textContent = tipoServicio.value ? texto : 'Sin definir';
    }
    if (resumenTitulo && titulo) {
        resumenTitulo.textContent = titulo.value.trim() || 'Sin definir';
    }
    if (resumenDireccion && direccion) {
        resumenDireccion.textContent = direccion.value.trim() || 'Sin definir';
    }
    if (resumenContacto && nombre && telefono) {
        const datos = [nombre.value.trim(), telefono.value.trim()].filter(Boolean).join(' | ');
        resumenContacto.textContent = datos || 'No proporcionado';
    }
    if (resumenEvidencia && evidencia) {
        resumenEvidencia.textContent = evidencia.files?.[0]?.name || 'Sin archivo';
    }
}

function mostrarPasoWizard(pasoObjetivo) {
    const pasos = document.querySelectorAll('#form-reporte .portal-wizard-step');
    if (!pasos.length) return;

    const pasoNormalizado = Math.max(1, Math.min(estadoPortal.wizardReporte.totalPasos, Number(pasoObjetivo)));
    estadoPortal.wizardReporte.pasoActual = pasoNormalizado;

    pasos.forEach((paso) => {
        const numeroPaso = Number(paso.dataset.step);
        const visible = numeroPaso === pasoNormalizado;
        paso.classList.toggle('is-visible', visible);
        paso.classList.toggle('is-hidden', !visible);
        paso.setAttribute('aria-hidden', String(!visible));
    });

    const btnPrev = document.getElementById('btn-wizard-prev');
    const btnNext = document.getElementById('btn-wizard-next');
    const btnSubmit = document.getElementById('btn-wizard-submit');

    if (btnPrev) btnPrev.classList.toggle('d-none', pasoNormalizado === 1);
    if (btnNext) btnNext.classList.toggle('d-none', pasoNormalizado === estadoPortal.wizardReporte.totalPasos);
    if (btnSubmit) btnSubmit.classList.toggle('d-none', pasoNormalizado !== estadoPortal.wizardReporte.totalPasos);

    actualizarStepperUI(pasoNormalizado);
    if (pasoNormalizado === 3) {
        actualizarResumenPaso3();
    }
}

function irPasoSiguiente() {
    const pasoActual = estadoPortal.wizardReporte.pasoActual;
    if (!validarPasoActual(pasoActual)) {
        return;
    }
    mostrarPasoWizard(pasoActual + 1);
}

function irPasoAnterior() {
    mostrarPasoWizard(estadoPortal.wizardReporte.pasoActual - 1);
}

function inicializarWizardReporte() {
    const form = document.getElementById('form-reporte');
    if (!form) return;
    if (form.dataset.wizardInicializado === '1') return;
    form.dataset.wizardInicializado = '1';

    const btnPrev = document.getElementById('btn-wizard-prev');
    const btnNext = document.getElementById('btn-wizard-next');
    const tipoServicio = document.getElementById('tipo-servicio');
    const descripcion = document.getElementById('descripcion');
    const direccion = document.getElementById('direccion');
    const titulo = document.getElementById('titulo');
    const nombre = document.getElementById('nombre');
    const telefono = document.getElementById('telefono');
    const evidencia = document.getElementById('evidencia-foto');

    if (btnPrev) btnPrev.addEventListener('click', irPasoAnterior);
    if (btnNext) btnNext.addEventListener('click', irPasoSiguiente);

    if (tipoServicio) {
        tipoServicio.addEventListener('change', () => {
            limpiarErrorCampo(tipoServicio);
            sincronizarTarjetaTipoSeleccionada();
            actualizarResumenPaso3();
        });
    }

    if (descripcion) {
        descripcion.addEventListener('input', () => {
            limpiarErrorCampo(descripcion);
            actualizarContadorDescripcion();
            actualizarResumenPaso3();
        });
    }

    if (titulo) {
        titulo.addEventListener('input', () => {
            limpiarErrorCampo(titulo);
            actualizarResumenPaso3();
        });
    }

    if (direccion) {
        direccion.addEventListener('input', () => {
            limpiarErrorCampo(direccion);
            actualizarResumenPaso3();
        });
    }

    if (nombre) nombre.addEventListener('input', actualizarResumenPaso3);
    if (telefono) telefono.addEventListener('input', actualizarResumenPaso3);
    if (evidencia) evidencia.addEventListener('change', actualizarResumenPaso3);

    renderizarTarjetasTipoServicio();
    sincronizarTarjetaTipoSeleccionada();
    actualizarContadorDescripcion();
    actualizarResumenPaso3();
    mostrarPasoWizard(1);
}

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

    inicializarWizardReporte();
    
    // Evento de envío del formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (estadoPortal.wizardReporte.pasoActual < estadoPortal.wizardReporte.totalPasos) {
            irPasoSiguiente();
            return;
        }

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
        actualizarResumenPaso3();
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
    actualizarResumenPaso3();
    
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
    actualizarResumenPaso3();
    
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
    const tipoServicioTexto = obtenerTextoTipoServicioSeleccionado();
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
                tipoServicioTexto,
                titulo: formData.get('titulo'),
                descripcion: formData.get('descripcion'),
                direccion: formData.get('direccion'),
                referencia: formData.get('referencia'),
                colonia: formData.get('colonia'),
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
    const fechaRegistro = document.getElementById('fecha-registro');
    const tituloConfirmacion = document.getElementById('titulo-confirmacion');
    const tipoConfirmacion = document.getElementById('tipo-confirmacion');
    const direccionConfirmacion = document.getElementById('direccion-confirmacion');

    if (fechaRegistro) fechaRegistro.textContent = formatearFechaLarga(reporte.fechaRegistro);
    if (tituloConfirmacion) tituloConfirmacion.textContent = valorTextoSeguro(reporte.titulo);
    if (tipoConfirmacion) tipoConfirmacion.textContent = valorTextoSeguro(reporte.tipoServicioTexto);
    if (direccionConfirmacion) direccionConfirmacion.textContent = valorTextoSeguro(reporte.direccion);
    
    // Cambiar a vista de confirmación
    mostrarVista('confirmacion');
    window.requestAnimationFrame(() => {
        dispararConfetiConfirmacion(reporte);
    });
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
    setTextById('resultado-folio', reporte.folio || 'Sin folio');
    setTextById('resultado-fecha', formatearFechaConsulta(reporte.fechaRegistro));
    setTextById('resultado-actualizacion', formatearFechaConsulta(reporte.ultimaActualizacion || reporte.fechaRegistro));
    setTextById('resultado-categoria', obtenerCategoriaReporte(reporte));
    setTextById('resultado-ubicacion', obtenerUbicacionReporte(reporte));
    setTextById('resultado-descripcion', reporte.descripcion || 'Sin descripción registrada.');

    // Actualizar badge de estatus
    const estatusBadge = document.getElementById('resultado-estatus');
    const estatusNormalizado = normalizarEstatusReporte(reporte.estatus);
    const estatusClass = obtenerClaseEstatus(estatusNormalizado);
    if (estatusBadge) {
        estatusBadge.innerHTML = `<span class="portal-estado-badge ${estatusClass}">${formatearEtiquetaEstatus(estatusNormalizado)}</span>`;
    }

    renderizarTimelineConsulta(reporte, estatusNormalizado);
    
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
        NUEVA: 'portal-estado-nueva',
        ASIGNADA: 'portal-estado-asignada',
        EN_PROCESO: 'portal-estado-en-proceso',
        RESUELTA: 'portal-estado-resuelta',
        CERRADA: 'portal-estado-cerrada',
        RECHAZADA: 'portal-estado-rechazada'
    };

    return clases[estatus] || 'portal-estado-nueva';
}

function setTextById(id, valor) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = valor;
}

function formatearFechaConsulta(fecha) {
    if (!fecha) return 'Sin fecha disponible';
    const valor = new Date(fecha);
    if (Number.isNaN(valor.getTime())) return 'Sin fecha disponible';
    return valor.toLocaleString('es-MX');
}

function obtenerCategoriaReporte(reporte) {
    return (
        reporte.tipoServicioNombre ||
        reporte.tipo_servicio_nombre ||
        reporte.tipoServicio ||
        reporte.categoria ||
        'No especificada'
    );
}

function obtenerUbicacionReporte(reporte) {
    const partes = [reporte.direccion, reporte.colonia, reporte.municipio].filter(Boolean);
    if (partes.length) return partes.join(', ');
    return 'No especificada';
}

function normalizarEstatusReporte(estatus) {
    return String(estatus || 'NUEVA')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_');
}

function formatearEtiquetaEstatus(estatus) {
    return estatus.replaceAll('_', ' ');
}

function construirMapaFechasEstatus(reporte) {
    const mapa = new Map();
    const fuentesHistorial = [
        reporte?.historial,
        reporte?.historialEstatus,
        reporte?.timeline,
        reporte?.trazabilidad,
        reporte?.eventos
    ];

    fuentesHistorial.forEach((fuente) => {
        if (!Array.isArray(fuente)) return;
        fuente.forEach((evento) => {
            const estatusEvento = normalizarEstatusReporte(evento?.estatus || evento?.status || evento?.nombre);
            if (!estatusEvento) return;
            const fechaEvento = evento?.fecha || evento?.fechaCambio || evento?.createdAt || evento?.timestamp;
            if (fechaEvento && !mapa.has(estatusEvento)) {
                mapa.set(estatusEvento, fechaEvento);
            }
        });
    });

    if (reporte?.fechaRegistro && !mapa.has('NUEVA')) {
        mapa.set('NUEVA', reporte.fechaRegistro);
    }

    const actual = normalizarEstatusReporte(reporte?.estatus);
    if (actual && reporte?.ultimaActualizacion && !mapa.has(actual)) {
        mapa.set(actual, reporte.ultimaActualizacion);
    }

    return mapa;
}

function renderizarTimelineConsulta(reporte, estatusActual) {
    const contenedor = document.getElementById('resultado-timeline');
    if (!contenedor) return;

    const estadosBase = ['NUEVA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA'];
    const mapaFechas = construirMapaFechasEstatus(reporte);
    const indiceActual = estadosBase.indexOf(estatusActual);

    const items = estadosBase.map((estado, idx) => {
        let estadoVisual = 'is-pending';
        if (indiceActual >= 0 && idx < indiceActual) estadoVisual = 'is-complete';
        if (idx === indiceActual) estadoVisual = 'is-current';
        if (indiceActual < 0 && estado === 'NUEVA') estadoVisual = 'is-current';

        return {
            estado,
            estadoVisual,
            fecha: mapaFechas.get(estado)
        };
    });

    if (estatusActual === 'RECHAZADA') {
        items.push({
            estado: 'RECHAZADA',
            estadoVisual: 'is-current is-rejected',
            fecha: mapaFechas.get('RECHAZADA') || reporte?.ultimaActualizacion || null
        });
    }

    contenedor.innerHTML = `
        <ol class="portal-timeline-list">
            ${items.map((item) => `
                <li class="portal-timeline-item ${item.estadoVisual}">
                    <span class="portal-timeline-dot" aria-hidden="true"></span>
                    <p class="portal-timeline-label">${formatearEtiquetaEstatus(item.estado)}</p>
                    <p class="portal-timeline-date">${item.fecha ? formatearFechaConsulta(item.fecha) : 'Pendiente'}</p>
                </li>
            `).join('')}
        </ol>
    `;
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
    inicializarAccionesConfirmacion();

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
