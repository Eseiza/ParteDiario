import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// ══ CONFIG ══
const firebaseConfig = {
    apiKey:            "TU_API_KEY",
    authDomain:        "TU_PROJECT.firebaseapp.com",
    projectId:         "TU_PROJECT_ID",
    storageBucket:     "TU_PROJECT.firebasestorage.app",
    messagingSenderId: "TU_SENDER_ID",
    appId:             "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const COL_PARTES    = "partes";
const COL_NOVEDADES = "novedades";

const USERS = {
    "mtto1":       { password: "mtto123",  role: "mantenimiento", nombre: "Técnico" },
    "supervisor1": { password: "super123", role: "supervisor",    nombre: "Producción" },
    "admin":       { password: "123",      role: "visualizador",  nombre: "Admin Romero" }
};

const state = {
    role: null,
    currentUser: '',
    partes: [],
    partesFiltrados: [],
    novedades: [],
    turnoActivo:   null,  // mtto
    estadoActivo:  null,  // mtto
    supTurno:      null,  // supervisor
    supTipo:       null,  // supervisor
    unsub: null,
    unsubNov: null
};

// ══ FECHA ══
const hoy = new Date().toLocaleDateString('es-AR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
['fecha-actual', 'fecha-sup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = hoy;
});

// ══ LOGIN ══
document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.role = btn.dataset.role;
    });
});

document.getElementById('login-btn').addEventListener('click', () => {
    const username = document.getElementById('login-user').value.trim();
    const pass     = document.getElementById('login-pass').value.trim();
    const user     = USERS[username];

    if (!user || user.password !== pass || user.role !== state.role) {
        showToast('Acceso denegado', true);
        return;
    }

    state.currentUser = user.nombre;
    document.getElementById('screen-login').style.display = 'none';

    if (state.role === 'mantenimiento') {
        document.getElementById('screen-carga').style.display = 'block';
        document.getElementById('carga-nombre').textContent = user.nombre;
        suscribirPartes();

    } else if (state.role === 'supervisor') {
        document.getElementById('screen-supervisor').style.display = 'block';
        document.getElementById('sup-nombre').textContent = user.nombre;
        suscribirNovedadesSup();

    } else {
        document.getElementById('screen-vis').style.display = 'flex';
        document.getElementById('vis-nombre').textContent = user.nombre;
        document.querySelector('.role-tag.vis').textContent = state.role.toUpperCase();
        suscribirPartes();
        suscribirNovedadesVis();
    }
});

// ══ FIRESTORE: PARTES ══
function suscribirPartes() {
    const q = query(collection(db, COL_PARTES), orderBy('timestamp', 'desc'));
    state.unsub = onSnapshot(q, snap => {
        state.partes = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        state.partesFiltrados = [...state.partes];
        renderPartes();
        actualizarKpis();
        renderCharts();
    });
}

// ══ FIRESTORE: NOVEDADES (supervisor, solo las suyas) ══
function suscribirNovedadesSup() {
    const q = query(collection(db, COL_NOVEDADES), orderBy('timestamp', 'desc'));
    state.unsubNov = onSnapshot(q, snap => {
        state.novedades = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        renderHistorialSup();
    });
}

// ══ FIRESTORE: NOVEDADES (visualizador) ══
function suscribirNovedadesVis() {
    const q = query(collection(db, COL_NOVEDADES), orderBy('timestamp', 'desc'));
    state.unsubNov = onSnapshot(q, snap => {
        state.novedades = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        renderNovedadesVis();
        actualizarKpisNov();
        renderCharts();
    });
}

// ══ RENDER PARTES ══
function renderPartes() {
    const listCarga = document.getElementById('historial-carga-list');
    const listVis   = document.getElementById('partes-list');
    const html = buildPartesHtml(state.partesFiltrados);
    if (listCarga) listCarga.innerHTML = html;
    if (listVis)   listVis.innerHTML   = html;
}

function buildPartesHtml(arr) {
    if (!arr.length) return emptyMsg('Sin registros.');
    const labels = { completado:'COMPLETADO', pendiente:'PENDIENTE', 'en-progreso':'EN PROGRESO' };
    return arr.map(p => `
        <div class="parte-card estado-${p.estado}" onclick="verParte('${p.firestoreId}')">
            <div class="parte-header">
                <div class="parte-sector">${p.sector}</div>
                <div class="parte-estado ${p.estado}">${labels[p.estado] || p.estado}</div>
            </div>
            <div style="font-size:10px;color:var(--muted);margin:4px 0;font-family:var(--font-mono)">
                ${p.fechaCorta} · TURNO ${(p.turno||'').toUpperCase()}
            </div>
            <div style="font-size:13px;">${p.realizada}</div>
        </div>`).join('');
}

// ══ RENDER NOVEDADES SUPERVISOR (historial propio) ══
function renderHistorialSup() {
    const list = document.getElementById('historial-sup-list');
    if (!list) return;
    list.innerHTML = buildNovedadesHtml(state.novedades);
}

// ══ RENDER NOVEDADES VISUALIZADOR ══
function renderNovedadesVis() {
    const list = document.getElementById('novedades-vis-list');
    if (!list) return;
    list.innerHTML = buildNovedadesHtml(state.novedades);
}

function buildNovedadesHtml(arr) {
    if (!arr.length) return emptyMsg('Sin novedades.');
    const tipoLabel = { problema:'⚠ PROBLEMA', observacion:'👁 OBSERVACIÓN', urgente:'🔴 URGENTE' };
    return arr.map(n => `
        <div class="novedad-card tipo-${n.tipo}" onclick="verNovedad('${n.firestoreId}')">
            <div class="novedad-header">
                <div class="novedad-sector">${n.sector}</div>
                <div style="display:flex;align-items:center;gap:6px">
                    <span class="novedad-tipo-badge ${n.tipo}">${tipoLabel[n.tipo] || n.tipo}</span>
                    <span class="novedad-resuelto ${n.resuelto}">${n.resuelto === 'si' ? 'RESUELTO' : 'PENDIENTE'}</span>
                </div>
            </div>
            <div style="font-size:10px;color:var(--muted);margin:4px 0;font-family:var(--font-mono)">
                ${n.fechaCorta} · TURNO ${(n.turno||'').toUpperCase()} · ${n.usuario}
            </div>
            <div style="font-size:13px;">${n.descripcion}</div>
        </div>`).join('');
}

function emptyMsg(txt) {
    return `<p style="color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:20px 0">${txt}</p>`;
}

// ══ TURNO / ESTADO (MTTO) ══
document.querySelectorAll('.turno-btn:not(.turno-sup)').forEach(b => b.addEventListener('click', e => {
    document.querySelectorAll('.turno-btn:not(.turno-sup)').forEach(x => x.classList.remove('selected'));
    e.target.classList.add('selected');
    state.turnoActivo = e.target.dataset.turno;
}));

document.querySelectorAll('.estado-btn').forEach(b => b.addEventListener('click', e => {
    document.querySelectorAll('.estado-btn').forEach(x => x.classList.remove('selected'));
    e.target.classList.add('selected');
    state.estadoActivo = e.target.dataset.estado;
}));

// ══ TURNO / TIPO (SUPERVISOR) ══
document.querySelectorAll('.turno-btn.turno-sup').forEach(b => b.addEventListener('click', e => {
    document.querySelectorAll('.turno-btn.turno-sup').forEach(x => x.classList.remove('selected'));
    e.target.classList.add('selected');
    state.supTurno = e.target.dataset.turno;
}));

document.querySelectorAll('.tipo-btn').forEach(b => b.addEventListener('click', e => {
    document.querySelectorAll('.tipo-btn').forEach(x => x.classList.remove('selected'));
    e.target.classList.add('selected');
    state.supTipo = e.target.dataset.tipo;
}));

// ══ SECTOR "OTROS" ══
document.getElementById('campo-sector')?.addEventListener('change', function () {
    const wrap = document.getElementById('campo-sector-otro-wrap');
    wrap.style.display = this.value === 'Otros' ? 'block' : 'none';
    if (this.value !== 'Otros') document.getElementById('campo-sector-otro').value = '';
});

// ══ GUARDAR PARTE ══
document.getElementById('btn-guardar-parte')?.addEventListener('click', async () => {
    const sectorSelect = document.getElementById('campo-sector').value;
    const sectorOtro   = document.getElementById('campo-sector-otro').value.trim();
    const realizada    = document.getElementById('campo-realizada').value.trim();
    const resp         = document.getElementById('campo-responsable').value.trim();
    const solicitada   = document.querySelector('input[name="solicitada"]:checked')?.value || 'no';

    let sector = sectorSelect;
    if (sectorSelect === 'Otros') {
        if (!sectorOtro) { showToast('Especificá el sector', true); return; }
        sector = sectorOtro;
    }
    if (!sector || !realizada || !state.turnoActivo || !state.estadoActivo) {
        showToast('Faltan datos obligatorios', true); return;
    }

    try {
        await addDoc(collection(db, COL_PARTES), {
            timestamp:   Date.now(),
            fechaCorta:  new Date().toLocaleDateString('es-AR'),
            turno:       state.turnoActivo,
            sector,
            realizada,
            responsable: resp,
            solicitada,
            estado:      state.estadoActivo,
            usuario:     state.currentUser
        });
        showToast('Parte registrado');
        resetFormMtto();
    } catch (e) { showToast('Error al guardar', true); console.error(e); }
});

// ══ GUARDAR NOVEDAD (SUPERVISOR) ══
document.getElementById('btn-guardar-novedad')?.addEventListener('click', async () => {
    const sector      = document.getElementById('sup-sector').value;
    const descripcion = document.getElementById('sup-descripcion').value.trim();
    const resp        = document.getElementById('sup-responsable').value.trim();
    const resuelto    = document.querySelector('input[name="resuelto"]:checked')?.value || 'no';

    if (!sector || !descripcion || !state.supTurno || !state.supTipo) {
        showToast('Faltan datos obligatorios', true); return;
    }

    try {
        await addDoc(collection(db, COL_NOVEDADES), {
            timestamp:   Date.now(),
            fechaCorta:  new Date().toLocaleDateString('es-AR'),
            turno:       state.supTurno,
            sector,
            tipo:        state.supTipo,
            descripcion,
            responsable: resp,
            resuelto,
            usuario:     state.currentUser
        });
        showToast('Novedad registrada');
        resetFormSup();
    } catch (e) { showToast('Error al guardar', true); console.error(e); }
});

// ══ FILTROS (VISUALIZADOR) ══
document.getElementById('btn-filtrar')?.addEventListener('click', () => {
    const desde  = document.getElementById('filtro-desde').value;
    const hasta  = document.getElementById('filtro-hasta').value;
    const sector = document.getElementById('filtro-sector').value;

    state.partesFiltrados = state.partes.filter(p => {
        const fecha = new Date(p.timestamp);
        if (desde && fecha < new Date(desde)) return false;
        if (hasta && fecha > new Date(hasta + 'T23:59:59')) return false;
        if (sector && p.sector !== sector) return false;
        return true;
    });
    renderPartes();
    actualizarKpis();
    renderCharts();
});

document.getElementById('btn-limpiar')?.addEventListener('click', () => {
    document.getElementById('filtro-desde').value  = '';
    document.getElementById('filtro-hasta').value  = '';
    document.getElementById('filtro-sector').value = '';
    state.partesFiltrados = [...state.partes];
    renderPartes();
    actualizarKpis();
    renderCharts();
});

// ══ UTILS ══
function showToast(m, err = false) {
    const t = document.getElementById('toast');
    t.textContent = m;
    t.className = `toast ${err ? 'err' : ''} show`;
    setTimeout(() => t.classList.remove('show'), 2500);
}

function resetFormMtto() {
    ['campo-realizada','campo-responsable'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('campo-sector').value = '';
    document.getElementById('campo-sector-otro').value = '';
    document.getElementById('campo-sector-otro-wrap').style.display = 'none';
    document.querySelectorAll('.turno-btn:not(.turno-sup), .estado-btn').forEach(b => b.classList.remove('selected'));
    const no = document.querySelector('input[name="solicitada"][value="no"]');
    if (no) no.checked = true;
    state.turnoActivo = null; state.estadoActivo = null;
}

function resetFormSup() {
    document.getElementById('sup-descripcion').value = '';
    document.getElementById('sup-responsable').value = '';
    document.getElementById('sup-sector').value = '';
    document.querySelectorAll('.turno-btn.turno-sup, .tipo-btn').forEach(b => b.classList.remove('selected'));
    const no = document.querySelector('input[name="resuelto"][value="no"]');
    if (no) no.checked = true;
    state.supTurno = null; state.supTipo = null;
}

window.doLogout = () => location.reload();

// ══ VER PARTE ══
window.verParte = (id) => {
    const p = state.partes.find(x => x.firestoreId === id);
    if (!p) return;
    document.getElementById('modal-sector').textContent      = p.sector;
    document.getElementById('modal-meta').textContent        = `${p.fechaCorta} · Por ${p.usuario}`;
    document.getElementById('modal-realizada').textContent   = p.realizada;
    document.getElementById('modal-responsable').textContent = p.responsable || '—';
    document.getElementById('modal-solicitada').textContent  = p.solicitada === 'si' ? 'Sí' : 'No';
    document.getElementById('modal-turno').textContent       = (p.turno || '').toUpperCase();
    document.getElementById('modal-estado').textContent      = (p.estado || '').toUpperCase();
    document.getElementById('modal-overlay').style.display   = 'flex';
};
window.cerrarModal = () => document.getElementById('modal-overlay').style.display = 'none';

// ══ VER NOVEDAD ══
window.verNovedad = (id) => {
    const n = state.novedades.find(x => x.firestoreId === id);
    if (!n) return;
    const tipoLabel = { problema:'⚠ PROBLEMA', observacion:'👁 OBSERVACIÓN', urgente:'🔴 URGENTE' };
    document.getElementById('modal-nov-sector').textContent  = n.sector;
    document.getElementById('modal-nov-meta').textContent    = `${n.fechaCorta} · Por ${n.usuario}`;
    document.getElementById('modal-nov-desc').textContent    = n.descripcion;
    document.getElementById('modal-nov-resp').textContent    = n.responsable || '—';
    document.getElementById('modal-nov-resuelto').textContent= n.resuelto === 'si' ? 'Sí' : 'No';
    document.getElementById('modal-nov-turno').textContent   = (n.turno || '').toUpperCase();
    const tipoBadge = document.getElementById('modal-nov-tipo');
    tipoBadge.textContent  = tipoLabel[n.tipo] || n.tipo;
    tipoBadge.className    = `modal-badge modal-badge-tipo ${n.tipo}`;
    document.getElementById('modal-nov-overlay').style.display = 'flex';
};
window.cerrarModalNov = () => document.getElementById('modal-nov-overlay').style.display = 'none';

// ══ KPIs ══
function actualizarKpis() {
    const el = id => document.getElementById(id);
    if (!el('kpi-total')) return;
    const arr = state.partesFiltrados;
    el('kpi-total').textContent       = arr.length;
    el('kpi-completados').textContent = arr.filter(x => x.estado === 'completado').length;
    el('kpi-pendientes').textContent  = arr.filter(x => x.estado === 'pendiente').length;
    el('kpi-progreso').textContent    = arr.filter(x => x.estado === 'en-progreso').length;
}

function actualizarKpisNov() {
    const el = id => document.getElementById(id);
    if (!el('kpi-nov-total')) return;
    const arr = state.novedades;
    el('kpi-nov-total').textContent      = arr.length;
    el('kpi-nov-urgente').textContent    = arr.filter(x => x.tipo === 'urgente').length;
    el('kpi-nov-noresuelto').textContent = arr.filter(x => x.resuelto === 'no').length;
}

// ══ CHARTS ══
let charts = {};

function renderCharts() {
    // destruir todos los existentes
    Object.values(charts).forEach(c => c.destroy());
    charts = {};

    const gridColor = '#40444b55';
    const tickStyle = { color: '#8e9297', font: { family: 'DM Mono', size: 10 } };
    const legendStyle = { labels: { color: '#8e9297', font: { family: 'DM Mono', size: 11 }, padding: 16, boxWidth: 12 } };

    // — Por sector (partes) —
    const cSec = document.getElementById('chart-sectores');
    if (cSec) {
        const map = {};
        state.partesFiltrados.forEach(p => { map[p.sector] = (map[p.sector] || 0) + 1; });
        charts.sectores = new Chart(cSec, {
            type: 'bar',
            data: {
                labels: Object.keys(map),
                datasets: [{ data: Object.values(map), backgroundColor: '#e8452c66', borderColor: '#e8452c', borderWidth: 1, borderRadius: 2 }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: tickStyle, grid: { color: gridColor } },
                    y: { ticks: { ...tickStyle, stepSize: 1 }, grid: { color: gridColor }, beginAtZero: true }
                }
            }
        });
    }

    // — Por estado (partes) —
    const cEst = document.getElementById('chart-estados');
    if (cEst) {
        const vals = [
            state.partesFiltrados.filter(x => x.estado === 'completado').length,
            state.partesFiltrados.filter(x => x.estado === 'pendiente').length,
            state.partesFiltrados.filter(x => x.estado === 'en-progreso').length,
        ];
        charts.estados = new Chart(cEst, {
            type: 'doughnut',
            data: {
                labels: ['Completado', 'Pendiente', 'En Progreso'],
                datasets: [{ data: vals, backgroundColor: ['#2d4a2e','#66261d','#5c4a14'], borderColor: ['#63b167','#ff6b57','#f5b324'], borderWidth: 1 }]
            },
            options: { plugins: { legend: legendStyle } }
        });
    }

    // — Por tipo (novedades) —
    const cTipo = document.getElementById('chart-tipos');
    if (cTipo) {
        const vals = [
            state.novedades.filter(x => x.tipo === 'problema').length,
            state.novedades.filter(x => x.tipo === 'observacion').length,
            state.novedades.filter(x => x.tipo === 'urgente').length,
        ];
        charts.tipos = new Chart(cTipo, {
            type: 'doughnut',
            data: {
                labels: ['Problema', 'Observación', 'Urgente'],
                datasets: [{ data: vals, backgroundColor: ['#5c4a14','#1e3a5f','#66261d'], borderColor: ['#f5b324','#60a5fa','#ff6b57'], borderWidth: 1 }]
            },
            options: { plugins: { legend: legendStyle } }
        });
    }

    // — Por sector (novedades) —
    const cNovSec = document.getElementById('chart-nov-sectores');
    if (cNovSec) {
        const map = {};
        state.novedades.forEach(n => { map[n.sector] = (map[n.sector] || 0) + 1; });
        charts.novSectores = new Chart(cNovSec, {
            type: 'bar',
            data: {
                labels: Object.keys(map),
                datasets: [{ data: Object.values(map), backgroundColor: '#d9770666', borderColor: '#d97706', borderWidth: 1, borderRadius: 2 }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: tickStyle, grid: { color: gridColor } },
                    y: { ticks: { ...tickStyle, stepSize: 1 }, grid: { color: gridColor }, beginAtZero: true }
                }
            }
        });
    }
}

// ══ TABS ══
document.querySelectorAll('.vis-tab').forEach(tab => {
    tab.addEventListener('click', e => {
        const container = e.target.closest('.vis-tabs').parentElement;
        container.querySelectorAll('.vis-tab').forEach(t => t.classList.remove('active'));
        container.querySelectorAll('.vis-tab-content').forEach(c => {
            c.style.display = 'none';
            c.classList.remove('active');
        });
        e.target.classList.add('active');
        const target = document.getElementById(e.target.dataset.tab);
        if (target) { target.style.display = 'block'; target.classList.add('active'); }
    });
});
