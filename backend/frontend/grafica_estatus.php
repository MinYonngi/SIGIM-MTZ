<?php
declare(strict_types=1);

$datos = [];
$errorConexion = false;

try {
    $pdo = new PDO(
        'mysql:host=localhost;dbname=sigim_mtz;charset=utf8mb4',
        'root',
        '',
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );

    $sql = "
        SELECT COALESCE(NULLIF(TRIM(estatus), ''), 'SIN_ESTATUS') AS etiqueta, COUNT(*) AS total
        FROM incidencias
        GROUP BY etiqueta
        ORDER BY total DESC, etiqueta ASC
    ";

    $rows = $pdo->query($sql)->fetchAll();
    foreach ($rows as $row) {
        $datos[] = [
            (string)($row['etiqueta'] ?? 'SIN_DATO'),
            max(0, (int)($row['total'] ?? 0))
        ];
    }
} catch (Throwable $e) {
    $errorConexion = true;
}

if (count($datos) === 0) {
    $datos[] = [$errorConexion ? 'Error de conexion' : 'Sin datos', 1];
}
?>
<!DOCTYPE html>
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

    <?php if ($errorConexion): ?>
        <p class="warn">No se pudo conectar a la base de datos. Se muestra una referencia minima para que la vista no falle.</p>
    <?php endif; ?>

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
    google.charts.load('current', { packages: ['corechart'] });
    google.charts.setOnLoadCallback(initChart);

    const rowsRaw = <?php echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); ?>;
    const rows = rowsRaw.map((row, index) => ({
        index,
        label: String(row[0] ?? 'SIN_DATO'),
        value: Math.max(0, Number(row[1] ?? 0))
    }));

    const statusPalette = {
        NUEVA: '#2962FF',
        ASIGNADA: '#FF6D00',
        EN_PROCESO: '#FF1744',
        RESUELTA: '#00C853',
        CERRADA: '#00B8D4',
        RECHAZADA: '#D500F9'
    };
    const fallbackPalette = ['#FFD600', '#00E5FF', '#76FF03', '#FF4081', '#651FFF', '#00BFA5', '#FF9100', '#C6FF00'];

    let chart = null;
    let chartData = null;
    let visibleRowsCache = [];
    const SLICE_HOVER_OFFSET = 0.11;
    let selectedOriginalIndex = -1;
    let hoverOriginalIndex = -1;
    let hiddenIndexes = new Set();
    let resizeTimer = null;
    // #region agent log
    fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf3843'},body:JSON.stringify({sessionId:'bf3843',runId:'pre-fix-1',hypothesisId:'H1',location:'backend/frontend/grafica_estatus.php:init-vars',message:'Initial chart state',data:{selectedOriginalIndex,hoverOriginalIndex,rowsCount:rows.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    function normalizeKey(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '_')
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
            return [{ index: -1, label: 'Sin datos', value: 1, synthetic: true }];
        }
        return active;
    }

    function getResponsiveOptions() {
        const w = window.innerWidth || document.documentElement.clientWidth;
        if (w <= 640) return { chartArea: { width: '94%', height: '78%' } };
        if (w <= 992) return { chartArea: { width: '90%', height: '80%' } };
        return { chartArea: { width: '88%', height: '82%' } };
    }

    function buildGoogleData(visibleRows) {
        const total = visibleRows.reduce((acc, r) => acc + r.value, 0);
        const data = new google.visualization.DataTable();
        data.addColumn('string', 'Categoria');
        data.addColumn('number', 'Total');
        data.addColumn({ type: 'string', role: 'tooltip' });

        visibleRows.forEach((row) => {
            const pct = total > 0 ? ((row.value / total) * 100).toFixed(1) : '0.0';
            const tooltip = row.label + '\nTotal: ' + row.value + '\nPorcentaje: ' + pct + '%';
            data.addRow([row.label, row.value, tooltip]);
        });

        return { data, total };
    }

    function animateNumber(el, target) {
        const from = Number((el.dataset.value || '0').replace(/,/g, '')) || 0;
        const duration = 550;
        const start = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - start) / duration);
            const val = Math.round(from + (target - from) * p);
            el.textContent = val.toLocaleString('es-MX');
            el.dataset.value = String(val);
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function updateDidacticInfo(visibleRows, total) {
        const top = [...visibleRows].sort((a, b) => b.value - a.value)[0];
        const topPct = total > 0 ? ((top.value / total) * 100).toFixed(1) : '0.0';
        animateNumber(document.getElementById('kpiTotal'), total);
        animateNumber(document.getElementById('kpiCount'), visibleRows.filter((r) => r.index >= 0).length);
        document.getElementById('kpiTop').textContent = top.label + ' (' + top.value.toLocaleString('es-MX') + ')';
        document.getElementById('insight').textContent =
            'Categoria con mayor peso: ' + top.label + ' con ' + top.value.toLocaleString('es-MX') + ' incidencias (' + topPct + '%).';
    }

    function renderLegend() {
        const legend = document.getElementById('legendList');
        legend.innerHTML = '';
        rows.forEach((row, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'legend-btn' + (hiddenIndexes.has(row.index) ? ' off' : '');
            btn.innerHTML = '<span class="dot" style="background:' + getColor(row.label, i) + '"></span><span>' + row.label + ' (' + row.value + ')</span>';
            btn.addEventListener('click', () => {
                if (hiddenIndexes.has(row.index)) hiddenIndexes.delete(row.index);
                else hiddenIndexes.add(row.index);
                if (hiddenIndexes.has(selectedOriginalIndex)) {
                    const first = getVisibleRows().find((r) => r.index >= 0);
                    selectedOriginalIndex = first ? first.index : -1;
                }
                // #region agent log
                fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf3843'},body:JSON.stringify({sessionId:'bf3843',runId:'pre-fix-1',hypothesisId:'H3',location:'backend/frontend/grafica_estatus.php:legend-click',message:'Legend click updated hidden/selected',data:{clickedIndex:row.index,selectedOriginalIndex,hiddenCount:hiddenIndexes.size},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                drawChart(true);
            });
            btn.addEventListener('mouseenter', () => {
                hoverOriginalIndex = row.index;
                drawChart(false);
            });
            btn.addEventListener('mouseleave', () => {
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
        const sliceText = document.getElementById('sliceTextMode').value;
        const slices = {};
        const colors = [];
        visibleRows.forEach((row, i) => {
            colors.push(getColor(row.label, i));
            const isHover = row.index === hoverOriginalIndex;
            slices[i] = { offset: isHover ? SLICE_HOVER_OFFSET : 0 };
        });
        // #region agent log
        fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf3843'},body:JSON.stringify({sessionId:'bf3843',runId:'pre-fix-1',hypothesisId:'H1',location:'backend/frontend/grafica_estatus.php:drawChart-slices',message:'Slices offsets computed',data:{selectedOriginalIndex,hoverOriginalIndex,withAnimation,offsets:visibleRows.map((row,idx)=>({idx,originalIndex:row.index,offset:slices[idx].offset}))},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        // #region agent log
        fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf3843'},body:JSON.stringify({sessionId:'bf3843',runId:'post-fix-verify',hypothesisId:'H5',location:'backend/frontend/grafica_estatus.php:drawChart-offset-policy',message:'Offset policy snapshot',data:{hoverOffset:SLICE_HOVER_OFFSET,nonZeroCount:visibleRows.reduce((n,r,i)=>n+(slices[i].offset>0?1:0),0),hoverOriginalIndex,selectedOriginalIndex},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        const options = {
            title: 'Incidencias por estatus',
            is3D: true,
            pieSliceText: sliceText,
            chartArea: responsive.chartArea,
            legend: { position: 'none' },
            tooltip: { text: 'both' },
            colors,
            slices,
            animation: withAnimation ? { startup: true, duration: 900, easing: 'out' } : null
        };

        if (!chart) {
            chart = new google.visualization.PieChart(document.getElementById('piechart_3d'));
            google.visualization.events.addListener(chart, 'select', () => {
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
                fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf3843'},body:JSON.stringify({sessionId:'bf3843',runId:'pre-fix-1',hypothesisId:'H2',location:'backend/frontend/grafica_estatus.php:chart-select',message:'Chart selection persisted',data:{selectedRow:sel[0].row,pickedIndex:picked.index,hoverOriginalIndex},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                // #region agent log
                fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf3843'},body:JSON.stringify({sessionId:'bf3843',runId:'post-fix-verify',hypothesisId:'H6',location:'backend/frontend/grafica_estatus.php:chart-select-clear',message:'Cleared chart selection after click',data:{pickedIndex:picked.index},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                chart.setSelection([]);
            });
            google.visualization.events.addListener(chart, 'onmouseover', (e) => {
                if (!e || e.row == null) return;
                const hovered = visibleRowsCache[e.row];
                if (!hovered || hovered.index < 0) return;
                hoverOriginalIndex = hovered.index;
                // #region agent log
                fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf3843'},body:JSON.stringify({sessionId:'bf3843',runId:'pre-fix-1',hypothesisId:'H4',location:'backend/frontend/grafica_estatus.php:chart-mouseover',message:'Chart mouseover',data:{eventRow:e.row,hoverOriginalIndex,selectedOriginalIndex},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                drawChart(false);
            });
            google.visualization.events.addListener(chart, 'onmouseout', () => {
                hoverOriginalIndex = -1;
                // #region agent log
                fetch('http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf3843'},body:JSON.stringify({sessionId:'bf3843',runId:'pre-fix-1',hypothesisId:'H4',location:'backend/frontend/grafica_estatus.php:chart-mouseout',message:'Chart mouseout reset hover',data:{hoverOriginalIndex,selectedOriginalIndex},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                drawChart(false);
            });
        }

        chart.draw(chartData, options);
        renderLegend();
        updateDidacticInfo(visibleRows, total);
    }

    function initChart() {
        document.getElementById('sliceTextMode').addEventListener('change', () => drawChart(true));
        document.getElementById('piechart_3d').addEventListener('mouseenter', () => drawChart(true));
        document.getElementById('piechart_3d').addEventListener('click', () => drawChart(true));

        drawChart(true);

        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => drawChart(false), 140);
        });
    }
</script>
</body>
</html>
