// Funciones de Google Maps para SIGIM-MTZ - SIMPLIFICADO
// Solo mantiene las funciones para abrir Google Maps en nueva pestaña

// Abrir Google Maps en nueva pestaña
function abrirGoogleMaps(latitud, longitud, direccion) {
  console.log("🔍 DIAGNÓSTICO - abrirGoogleMaps llamado con:", { latitud, longitud, direccion });
  
  let url = 'https://www.google.com/maps/search/';
  
  if (latitud && longitud) {
    url += `${latitud},${longitud}`;
  } else if (direccion) {
    url += encodeURIComponent(direccion);
  } else {
    url += 'Martínez de la Torre, Veracruz';
  }
  
  console.log("🔍 DIAGNÓSTICO - Abriendo Google Maps con URL:", url);
  window.open(url, '_blank');
}

// Abrir Google Maps Navigation (Cómo llegar)
function abrirGoogleMapsNavigation(latitud, longitud, direccion) {
  let url = 'https://www.google.com/maps/dir/?api=1&destination=';
  
  if (latitud && longitud) {
    url += `${latitud},${longitud}`;
  } else if (direccion) {
    url += encodeURIComponent(direccion);
  } else {
    url += 'Martínez de la Torre, Veracruz';
  }
  
  window.open(url, '_blank');
}

// Exportar funciones para uso global
window.abrirGoogleMaps = abrirGoogleMaps;
window.abrirGoogleMapsNavigation = abrirGoogleMapsNavigation;
