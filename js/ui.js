/**
 * CSMA/CD Simulation UI
 * Canvas rendering, table management, tooltip, export
 */

let stateNodes = [
    { id: uid(), name: "D1", size: 64,  backoffs: "0, 1, 2" },
    { id: uid(), name: "D2", size: 100, backoffs: "0, 1, 3" },
    { id: uid(), name: "D3", size: 100, backoffs: "1" },
    { id: uid(), name: "D4", size: 64,  backoffs: "0, 2, 1" }
];

let simulationData = null;
let hoverElements = [];

const canvas = document.getElementById('timelineCanvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

function uid() {
    return Math.random().toString(36).substring(2);
}

// --- Table Management ---

function renderTable() {
    const tbody = document.querySelector("#nodesTable tbody");
    tbody.innerHTML = "";
    stateNodes.forEach((n, index) => {
        let tr = document.createElement("tr");
        tr.innerHTML =
            '<td><input type="text" value="' + escapeHtml(n.name) + '" onchange="updateNode(' + index + ', \'name\', this.value)"></td>' +
            '<td><input type="number" min="1" value="' + n.size + '" onchange="updateNode(' + index + ', \'size\', this.value)"></td>' +
            '<td><input type="text" value="' + escapeHtml(n.backoffs) + '" placeholder="0, 1, 3..." onchange="updateNode(' + index + ', \'backoffs\', this.value)"></td>' +
            '<td><button class="btn btn-danger" onclick="removeRow(' + index + ')">Sil</button></td>';
        tbody.appendChild(tr);
    });
}

function escapeHtml(str) {
    let div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function updateNode(idx, field, val) {
    stateNodes[idx][field] = val;
}

function addRow() {
    stateNodes.push({ id: uid(), name: "Yeni", size: 64, backoffs: "" });
    renderTable();
}

function removeRow(idx) {
    stateNodes.splice(idx, 1);
    renderTable();
}

renderTable();

// --- Run Simulation (client-side) ---

function doRunSimulation() {
    if (stateNodes.length === 0) {
        alert("En az 1 cihaz olmalı.");
        return;
    }

    const reqBody = {
        nodes: stateNodes.map(n => ({
            name: String(n.name).trim(),
            frameSize: parseInt(n.size) || 64,
            backoffs: n.backoffs.split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s))
        }))
    };

    simulationData = runSimulation(reqBody);

    document.getElementById('resultsSection').style.display = 'block';
    buildKPIs(simulationData);
    requestAnimationFrame(() => drawHighResCanvas(simulationData));
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- KPI Summary ---

function buildKPIs(data) {
    const box = document.getElementById('summaryBox');
    box.innerHTML = '<div class="kpi-card" style="border-left-color: #8b5cf6">' +
        '<span class="kpi-title">Toplam İletim Süresi</span>' +
        '<span class="kpi-value">' + data.totalDuration.toFixed(1) + ' µs</span></div>';

    let sorted = Object.values(data.summaries).sort((a, b) => a.completionTime - b.completionTime);
    sorted.forEach(s => {
        box.innerHTML += '<div class="kpi-card" style="border-left-color: #10b981">' +
            '<span class="kpi-title">' + escapeHtml(s.name) + ' Cihazı Bitişi</span>' +
            '<span class="kpi-value">' + s.completionTime.toFixed(1) + ' µs</span></div>';
    });
}

// --- Event Color Mapping ---

function getEventColor(type) {
    if (type === 'TX' || type === 'TX_SUCCESS') return '#10b981';
    if (type === 'COLLISION') return '#ef4444';
    if (type === 'JAM') return '#dc2626';
    if (type.indexOf('BACKOFF') !== -1) return '#f59e0b';
    if (type === 'IFG') return '#3b82f6';
    return '#9ca3af';
}

// --- Canvas Drawing ---

function drawHighResCanvas(data) {
    hoverElements = [];

    const ROW_HEIGHT = 70;
    const TOP_MARGIN = 40;
    const BOTTOM_MARGIN = 100;
    const LEFT_MARGIN = 120;
    const RIGHT_MARGIN = 60;

    const allNodes = stateNodes.map(n => n.name);

    let times = new Set();
    times.add(0);
    times.add(data.totalDuration);
    data.events.forEach(e => {
        times.add(e.startTime);
        times.add(e.endTime);
    });

    const minTickSpacing = 140;
    const logicalWidth = Math.max(
        canvas.parentElement.clientWidth * 2.3,
        2200,
        LEFT_MARGIN + RIGHT_MARGIN + (Math.max(times.size - 1, 1) * minTickSpacing)
    );
    const logicalHeight = TOP_MARGIN + (allNodes.length * ROW_HEIGHT) + BOTTOM_MARGIN;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    canvas.style.width = logicalWidth + 'px';
    canvas.style.height = logicalHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    const drawAreaWidth = logicalWidth - LEFT_MARGIN - RIGHT_MARGIN;
    const maxTime = data.totalDuration || 1;
    const getX = (t) => LEFT_MARGIN + ((t / maxTime) * drawAreaWidth);

    let sortedTimes = Array.from(times).map(t => parseFloat(t.toFixed(1))).sort((a, b) => a - b);

    const bottomAxisY = logicalHeight - BOTTOM_MARGIN + 15;

    // Vertical guidelines & axis labels
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "13px 'Inter', sans-serif";

    sortedTimes.forEach((t) => {
        let x = getX(t);

        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
        ctx.moveTo(x, TOP_MARGIN);
        ctx.lineTo(x, bottomAxisY);
        ctx.stroke();

        ctx.save();
        ctx.translate(x, bottomAxisY + 10);
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = "#4b5563";
        ctx.fillText(t.toFixed(1) + " µs", 0, 0);
        ctx.restore();
    });
    ctx.restore();

    // Row grid & node labels
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "600 16px 'Inter', sans-serif";
    ctx.fillStyle = "#1f2937";

    allNodes.forEach((node, idx) => {
        let y = TOP_MARGIN + (idx * ROW_HEIGHT);

        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
        ctx.moveTo(LEFT_MARGIN - 10, y + ROW_HEIGHT);
        ctx.lineTo(logicalWidth - RIGHT_MARGIN, y + ROW_HEIGHT);
        ctx.stroke();

        ctx.fillText(node, LEFT_MARGIN - 20, y + (ROW_HEIGHT / 2));
    });
    ctx.restore();

    // Event blocks
    ctx.save();
    const BLOCK_H = ROW_HEIGHT - 16;

    data.events.forEach(ev => {
        let rowIdx = allNodes.indexOf(ev.node);
        if (rowIdx === -1) return;

        let y = TOP_MARGIN + (rowIdx * ROW_HEIGHT) + 8;
        let xStart = getX(ev.startTime);
        let xEnd = getX(ev.endTime);
        let w = Math.max(xEnd - xStart, 2);

        let color = getEventColor(ev.eventType);

        ctx.fillStyle = color;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(xStart, y, w, BLOCK_H, 6);
        } else {
            ctx.rect(xStart, y, w, BLOCK_H);
        }
        ctx.fill();

        if (w > 35) {
            ctx.fillStyle = "#ffffff";
            ctx.font = "600 12px 'Inter', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            let lbl = ev.eventType;
            if (lbl === 'TX' || lbl === 'TX_SUCCESS') lbl = 'TX';
            if (lbl === 'COLLISION') lbl = 'Coll';

            if (ctx.measureText(lbl).width > w - 10) lbl = lbl.substring(0, 3) + "..";

            ctx.fillText(lbl, xStart + (w / 2), y + (BLOCK_H / 2));
        }

        // Colored dashed lines from block to axis
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.moveTo(xStart, y + BLOCK_H);
        ctx.lineTo(xStart, bottomAxisY);
        ctx.moveTo(xEnd, y + BLOCK_H);
        ctx.lineTo(xEnd, bottomAxisY);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        hoverElements.push({
            lx: xStart, rx: xStart + w,
            ty: y, by: y + BLOCK_H,
            event: ev,
            color: color
        });
    });
    ctx.restore();
}

// --- Tooltip Logic ---

canvas.addEventListener('mousemove', (e) => {
    let rect = canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;

    let hit = null;
    for (let i = hoverElements.length - 1; i >= 0; i--) {
        let el = hoverElements[i];
        if (mx >= el.lx && mx <= el.rx && my >= el.ty && my <= el.by) {
            hit = el;
            break;
        }
    }

    if (hit) {
        let ev = hit.event;
        tooltip.style.display = 'block';
        tooltip.style.left = e.clientX + 'px';
        tooltip.style.top = e.clientY + 'px';

        tooltip.innerHTML =
            '<div class="tt-header" style="color: ' + hit.color + '; border-bottom-color: ' + hit.color + '50">' +
                escapeHtml(ev.node) + ' &#10132; ' + escapeHtml(ev.eventType) +
            '</div>' +
            '<div class="tt-row">' +
                '<span style="color:#9ca3af">Zaman Aralığı:</span>' +
                '<span class="tt-value">' + ev.startTime.toFixed(1) + ' - ' + ev.endTime.toFixed(1) + ' µs</span>' +
            '</div>' +
            '<div class="tt-row">' +
                '<span style="color:#9ca3af">Süre (Durasyon):</span>' +
                '<span class="tt-value">' + (ev.endTime - ev.startTime).toFixed(1) + ' µs</span>' +
            '</div>' +
            '<div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #374151; color: #d1d5db; font-style: italic;">' +
                (ev.notes || 'Detay yok.') +
            '</div>';
        canvas.style.cursor = 'pointer';
    } else {
        tooltip.style.display = 'none';
        canvas.style.cursor = 'crosshair';
    }
});

canvas.addEventListener('mouseout', () => {
    tooltip.style.display = 'none';
});

// --- Export PNG ---

function exportPng() {
    if (!simulationData) return;
    const link = document.createElement('a');
    link.download = 'csmacd_timeline.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// --- Resize handler ---

window.addEventListener('resize', () => {
    if (simulationData) requestAnimationFrame(() => drawHighResCanvas(simulationData));
});