// Funciones comunes para todos los módulos de SIGIM-MTZ

// ==========================================
// Funciones para ocultar/mostrar topbar al hacer scroll
// ==========================================

let lastScrollTop = 0;
const topbar = document.querySelector('.topbar-mtz');

if (topbar) {
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

    if (currentScroll > lastScrollTop && currentScroll > 80) {
      topbar.classList.add('hidden'); // baja = ocultar
    } else {
      topbar.classList.remove('hidden'); // sube = mostrar
    }

    lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
  });
}

// ==========================================
// Funciones comunes de utilidad
// ==========================================

function showToast(message, type = 'success') {
  // Crear toast si no existe
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      z-index: 9999;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `alert alert-${type} alert-dismissible fade show`;
  toast.style.cssText = `
    margin-bottom: 10px;
    min-width: 250px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  toast.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;

  toastContainer.appendChild(toast);

  // Auto-eliminar después de 5 segundos
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

// Formatear tamaño de archivo
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Fetch JSON con manejo de errores
async function fetchJSON(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error en fetchJSON:', error);
    throw error;
  }
}

// Validar si archivo existe (para evidencias)
async function checkFileExists(filename) {
  try {
    const response = await fetch(`/uploads/${filename}`, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}
