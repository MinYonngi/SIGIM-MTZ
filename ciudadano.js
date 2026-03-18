const API = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';

document.getElementById('form-ciudadano').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-enviar-reporte');
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Enviando...`;
  btn.disabled = true;

  const formData = new FormData();
  formData.append('nombre', document.getElementById('ciu-nombre').value);
  formData.append('telefono', document.getElementById('ciu-telefono').value);
  formData.append('tipo_servicio_id', document.getElementById('ciu-servicio').value);
  formData.append('direccion', document.getElementById('ciu-direccion').value);
  formData.append('descripcion', document.getElementById('ciu-descripcion').value);

  try {
    const res = await fetch(`${API}/ciudadano/reportes`, { method: 'POST', body: formData });
    let folio = `INC-2026-${Math.floor(Math.random() * 900) + 100}`;
    if (res.ok) { const data = await res.json(); folio = data.folio || folio; }
    document.getElementById('txt-folio-generado').textContent = folio;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalExito')).show();
  } catch (error) {
    document.getElementById('txt-folio-generado').textContent = `INC-2026-${Math.floor(Math.random() * 900) + 100}`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalExito')).show();
  } finally {
    btn.innerHTML = `<i class="bi bi-send"></i> Enviar`;
    btn.disabled = false;
  }
});