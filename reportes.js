const API = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
let chartTecnicos = null; let chartSla = null;

async function fetchJSON(url) { try { const res = await fetch(url); const data = await res.json().catch(()=>({})); if(!res.ok) throw new Error(""); return data; } catch(e) { return null; } }

function initCharts() {
  chartTecnicos = new Chart(document.getElementById('chartTecnicos'), { type: 'bar', data: { labels: ['Sin datos'], datasets: [{ data: [0], label: 'Esperando BD', backgroundColor: '#d1d3e2' }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } });
  chartSla = new Chart(document.getElementById('chartSla'), { type: 'pie', data: { labels: ['Sin datos'], datasets: [{ data: [1], backgroundColor: ['#eaecf4'] }] }, options: { responsive: true } });
}

async function cargarDatosReporte(f1='', f2='') {
  let urlT = `${API}/reportes/tecnicos`; let urlS = `${API}/reportes/sla`;
  if(f1 && f2) { urlT += `?inicio=${f1}&fin=${f2}`; urlS += `?inicio=${f1}&fin=${f2}`; }
  const dT = await fetchJSON(urlT); const dS = await fetchJSON(urlS);

  if(dT && dT.length > 0) {
    chartTecnicos.data.labels = dT.map(d => d.nombre);
    chartTecnicos.data.datasets = [{ label: 'Resueltas', data: dT.map(d => d.resueltas), backgroundColor: '#1cc88a' }, { label: 'Asignadas', data: dT.map(d => d.asignadas), backgroundColor: '#4e73df' }];
    chartTecnicos.update();
  }
  if(dS) {
    chartSla.data.labels = ['Dentro de meta', 'Fuera de meta'];
    chartSla.data.datasets = [{ data: [dS.dentro, dS.fuera], backgroundColor: ['#36b9cc', '#e74a3b'] }];
    chartSla.update();
  }
}

document.getElementById('form-filtros').addEventListener('submit', (e) => { e.preventDefault(); cargarDatosReporte(document.getElementById('filtro-inicio').value, document.getElementById('filtro-fin').value); });
document.addEventListener("DOMContentLoaded", () => { initCharts(); cargarDatosReporte(); });