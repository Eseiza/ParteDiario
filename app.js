import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// ══ CONFIG FIREBASE ══
const firebaseConfig = {
    apiKey:            "AIzaSyAmSTEfzcgGx-NbT_FCBDvECuNl0A2jbeY",
    authDomain:        "partediarioromero.firebaseapp.com",
    projectId:         "partediarioromero",
    storageBucket:     "partediarioromero.firebasestorage.app",
    messagingSenderId: "146566530037",
    appId:             "1:146566530037:web:143b76fe54a9db05c1d6bc",
    measurementId:     "G-REXHZQ7TXY"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const COL_PARTES    = "partes";
const COL_NOVEDADES = "novedades";

// ══ USUARIOS ══
const USERS = {
    "mtto1":       { password: "mtto123",  role: "mantenimiento", nombre: "Técnico" },
    "Joaquin":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Joaquin" },
    "Manuel":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Manuel" },
    "Matias":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Matias" },
    "Mateo":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Mateo" },
    "Ignacio":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Nacho" },
    "JuanManuel":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Cappe" },
    "supervisor1": { password: "super123", role: "supervisor",    nombre: "Supervisor" },
    "admin":       { password: "admin123",      role: "visualizador",  nombre: "Admin" }
};

const state = {
    role: null,
    currentUser: '',
    partes: [],
    partesFiltrados: [],
    novedades: [],
    turnoActivo:  null,
    estadoActivo: null,
    supTurno:     null,
    supTipo:      null,
    unsub:    null,
    unsubNov: null
};

// ══ FECHA ══
const fechaHoy = new Date().toLocaleDateString('es-AR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
['fecha-actual', 'fecha-sup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = fechaHoy;
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
        showToast('Acceso denegado', true); return;
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
        document.getElementById('screen-vis').style.display = 'block';
        document.getElementById('vis-nombre').textContent = user.nombre;
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
        renderSidebar();
        renderCharts();
    });
}

// ══ FIRESTORE: NOVEDADES (supervisor) ══
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
        renderSidebar();
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
    const labels = {
        completado:    'COMPLETADO',
        pendiente:     'PENDIENTE',
        'en-proceso':  'EN PROCESO',
        'en-progreso': 'EN PROCESO'
    };
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

// ══ RENDER NOVEDADES ══
function renderHistorialSup() {
    const list = document.getElementById('historial-sup-list');
    if (!list) return;
    list.innerHTML = buildNovedadesHtml(state.novedades);
}

function renderNovedadesVis() {
    const list = document.getElementById('novedades-vis-list');
    if (!list) return;
    list.innerHTML = buildNovedadesHtml(state.novedades);
}

function buildNovedadesHtml(arr) {
    if (!arr.length) return emptyMsg('Sin novedades.');
    const tipoLabel     = { problema:'⚠ PROBLEMA', observacion:'OBSERVACIÓN', urgente:'🔴 URGENTE' };
    // Labels cortos y directos
    const resueltoLabel = { si: 'RESUELTO', no: 'PENDIENTE', 'en-curso': 'SE INICIÓ' };
    return arr.map(n => `
        <div class="novedad-card tipo-${n.tipo}" onclick="verNovedad('${n.firestoreId}')">
            <div class="novedad-header">
                <div class="novedad-sector">${n.sector}</div>
                <div style="display:flex;align-items:center;gap:6px">
                    <span class="novedad-tipo-badge ${n.tipo}">${tipoLabel[n.tipo] || n.tipo}</span>
                    <span class="novedad-resuelto ${n.resuelto}">${resueltoLabel[n.resuelto] || n.resuelto}</span>
                </div>
            </div>
            <div style="font-size:10px;color:var(--muted);margin:4px 0;font-family:var(--font-mono)">
                ${n.fechaCorta} · TURNO ${(n.turno||'').toUpperCase()} · ${n.usuario}
            </div>
            <div style="font-size:13px;">${n.descripcion}</div>
        </div>`).join('');
}

// ══ SIDEBAR ══
function renderSidebar() {
    renderSidebarSectores();
    renderSidebarNovedades();
    renderSidebarResumen();
}

function renderSidebarSectores() {
    const el = document.getElementById('sidebar-sectores');
    if (!el) return;
    const map = {};
    state.partesFiltrados.forEach(p => { map[p.sector] = (map[p.sector] || 0) + 1; });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] || 1;
    const colorClasses = ['', 'amb', 'grn', 'blu'];
    if (!entries.length) { el.innerHTML = emptyMsg('Sin datos.'); return; }
    el.innerHTML = entries.map(([sector, count], i) => `
        <div class="sb-bar-row">
            <div class="sb-bar-label"><span>${sector}</span><span>${count}</span></div>
            <div class="sb-bar-track">
                <div class="sb-bar-fill ${colorClasses[i % colorClasses.length]}" style="width:${Math.round((count/max)*100)}%"></div>
            </div>
        </div>`).join('');
}

function renderSidebarNovedades() {
    const el = document.getElementById('sidebar-novedades-recientes');
    if (!el) return;
    const recientes = state.novedades.slice(0, 4);
    if (!recientes.length) { el.innerHTML = emptyMsg('Sin novedades.'); return; }
    const tipoClass = { urgente:'u', problema:'p', observacion:'o' };
    const tipoLabel = { urgente:'URGENTE', problema:'PROBLEMA', observacion:'OBS.' };
    el.innerHTML = recientes.map(n => `
        <div class="sb-nov ${tipoClass[n.tipo]||''}" onclick="verNovedad('${n.firestoreId}')">
            <div class="sb-nov-head">
                <span class="sb-nov-sector">${n.sector}</span>
                <span class="sb-nov-badge ${tipoClass[n.tipo]||''}">${tipoLabel[n.tipo]||n.tipo}</span>
            </div>
            <div class="sb-nov-meta">${n.fechaCorta} · ${(n.turno||'').toUpperCase()}</div>
        </div>`).join('');
}

function renderSidebarResumen() {
    const el = document.getElementById('sidebar-resumen');
    if (!el) return;
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay());
    inicioSemana.setHours(0, 0, 0, 0);
    const partesSemanales = state.partes.filter(p => p.timestamp >= inicioSemana.getTime());
    const novSemanales    = state.novedades.filter(n => n.timestamp >= inicioSemana.getTime());
    const urgentes        = novSemanales.filter(n => n.tipo === 'urgente' && n.resuelto !== 'si');
    const resueltas       = novSemanales.filter(n => n.resuelto === 'si').length;
    const tasaResolucion  = novSemanales.length ? Math.round((resueltas/novSemanales.length)*100) : 0;
    el.innerHTML = `
        <div class="sb-stat-row"><span class="sb-stat-name">Partes esta semana</span><span class="sb-stat-val">${partesSemanales.length}</span></div>
        <div class="sb-stat-row"><span class="sb-stat-name">Novedades</span><span class="sb-stat-val">${novSemanales.length}</span></div>
        <div class="sb-stat-row"><span class="sb-stat-name">Urgentes sin resolver</span><span class="sb-stat-val" style="color:#ff6b57">${urgentes.length}</span></div>
        <div class="sb-stat-row"><span class="sb-stat-name">Tasa de resolución</span><span class="sb-stat-val" style="color:#63b167">${tasaResolucion}%</span></div>`;
}

function emptyMsg(txt) {
    return `<p style="color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:16px 0">${txt}</p>`;
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

// ══ NAVEGACIÓN MTTO ══
document.querySelectorAll('[data-ctab]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-ctab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.ctab;
        document.querySelectorAll('#screen-carga .vis-panel').forEach(p => {
            p.style.display = 'none'; p.classList.remove('active');
        });
        const target = document.getElementById(tabId);
        if (target) { target.style.display = 'block'; target.classList.add('active'); }
    });
});

// ══ NAVEGACIÓN SUPERVISOR ══
document.querySelectorAll('[data-stab]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-stab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.stab;
        document.querySelectorAll('#screen-supervisor .vis-panel').forEach(p => {
            p.style.display = 'none'; p.classList.remove('active');
        });
        const target = document.getElementById(tabId);
        if (target) { target.style.display = 'block'; target.classList.add('active'); }
    });
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

    const btn = document.getElementById('btn-guardar-parte');
    btn.disabled = true;
    btn.textContent = 'GUARDANDO...';

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
        showToast('✓ Parte registrado correctamente');
        resetFormMtto();
    } catch (e) {
        showToast('Error al guardar', true);
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.textContent = 'REGISTRAR PARTE';
    }
});

// ══ GUARDAR NOVEDAD ══
document.getElementById('btn-guardar-novedad')?.addEventListener('click', async () => {
    const sector      = document.getElementById('sup-sector').value;
    const descripcion = document.getElementById('sup-descripcion').value.trim();
    const resp        = document.getElementById('sup-responsable').value.trim();
    const resuelto    = document.querySelector('input[name="resuelto"]:checked')?.value || 'no';

    if (!sector || !descripcion || !state.supTurno || !state.supTipo) {
        showToast('Faltan datos obligatorios', true); return;
    }

    const btn = document.getElementById('btn-guardar-novedad');
    btn.disabled = true;
    btn.textContent = 'GUARDANDO...';

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
        showToast('✓ Novedad registrada correctamente');
        resetFormSup();
    } catch (e) {
        showToast('Error al guardar', true);
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.textContent = 'REGISTRAR NOVEDAD';
    }
});

// ══ FILTROS ══
document.getElementById('btn-filtrar')?.addEventListener('click', aplicarFiltros);
document.getElementById('btn-limpiar')?.addEventListener('click', () => {
    ['filtro-desde','filtro-hasta'].forEach(id => document.getElementById(id).value = '');
    ['filtro-sector','filtro-estado'].forEach(id => document.getElementById(id).value = '');
    state.partesFiltrados = [...state.partes];
    renderPartes(); actualizarKpis(); renderSidebar(); renderCharts();
});

function aplicarFiltros() {
    const desde  = document.getElementById('filtro-desde').value;
    const hasta  = document.getElementById('filtro-hasta').value;
    const sector = document.getElementById('filtro-sector').value;
    const estado = document.getElementById('filtro-estado')?.value || '';

    state.partesFiltrados = state.partes.filter(p => {
        const fecha = new Date(p.timestamp);
        if (desde && fecha < new Date(desde)) return false;
        if (hasta && fecha > new Date(hasta + 'T23:59:59')) return false;
        if (sector && p.sector !== sector) return false;
        if (estado) {
            const norm = (p.estado === 'en-progreso') ? 'en-proceso' : p.estado;
            if (norm !== estado) return false;
        }
        return true;
    });
    renderPartes(); actualizarKpis(); renderSidebar(); renderCharts();
}

// ══ NAVEGACIÓN VISUALIZADOR ══
document.querySelectorAll('.vis-nav-btn[data-vtab]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.vis-nav-btn[data-vtab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.vtab;
        document.querySelectorAll('#screen-vis .vis-panel').forEach(p => {
            p.style.display = 'none'; p.classList.remove('active');
        });
        const target = document.getElementById(tabId);
        if (target) { target.style.display = 'block'; target.classList.add('active'); }
        if (tabId === 'tab-stats') { actualizarKpisStats(); renderCharts(); }
    });
});

window.switchToTab = (tabId) => {
    const btn = document.querySelector(`.vis-nav-btn[data-vtab="${tabId}"]`);
    if (btn) btn.click();
};

// ══ TOAST ══
function showToast(m, err = false) {
    const t = document.getElementById('toast');
    t.textContent = m;
    t.className = `toast ${err ? 'err' : ''} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

// ══ RESET FORMS ══
function resetFormMtto() {
    document.getElementById('campo-realizada').value   = '';
    document.getElementById('campo-responsable').value = '';
    document.getElementById('campo-sector').value      = '';
    document.getElementById('campo-sector-otro').value = '';
    document.getElementById('campo-sector-otro-wrap').style.display = 'none';
    document.querySelectorAll('.turno-btn:not(.turno-sup), .estado-btn')
        .forEach(b => b.classList.remove('selected'));
    const no = document.querySelector('input[name="solicitada"][value="no"]');
    if (no) no.checked = true;
    state.turnoActivo = null; state.estadoActivo = null;
}

function resetFormSup() {
    document.getElementById('sup-descripcion').value = '';
    document.getElementById('sup-responsable').value = '';
    document.getElementById('sup-sector').value      = '';
    document.querySelectorAll('.turno-btn.turno-sup, .tipo-btn')
        .forEach(b => b.classList.remove('selected'));
    const no = document.querySelector('input[name="resuelto"][value="no"]');
    if (no) no.checked = true;
    state.supTurno = null; state.supTipo = null;
}

window.doLogout = () => location.reload();

// ══ VER PARTE ══
window.verParte = (id) => {
    const p = state.partes.find(x => x.firestoreId === id);
    if (!p) return;
    const estadoLabels = {
        completado: 'COMPLETADO', pendiente: 'PENDIENTE',
        'en-proceso': 'EN PROCESO', 'en-progreso': 'EN PROCESO'
    };
    document.getElementById('modal-sector').textContent      = p.sector;
    document.getElementById('modal-meta').textContent        = `${p.fechaCorta} · Por ${p.usuario}`;
    document.getElementById('modal-realizada').textContent   = p.realizada;
    document.getElementById('modal-responsable').textContent = p.responsable || '—';
    document.getElementById('modal-solicitada').textContent  = p.solicitada === 'si' ? 'Sí' : 'No';
    document.getElementById('modal-turno').textContent       = (p.turno || '').toUpperCase();
    document.getElementById('modal-estado').textContent      = estadoLabels[p.estado] || (p.estado||'').toUpperCase();
    document.getElementById('modal-overlay').style.display   = 'flex';
};
window.cerrarModal = () => document.getElementById('modal-overlay').style.display = 'none';

// ══ VER NOVEDAD ══
window.verNovedad = (id) => {
    const n = state.novedades.find(x => x.firestoreId === id);
    if (!n) return;
    const tipoLabel     = { problema:'⚠ PROBLEMA', observacion:'👁 OBSERVACIÓN', urgente:'🔴 URGENTE' };
    const resueltoLabel = { si: 'Sí, se resolvió', no: 'No se resolvió', 'en-curso': 'Se inició pero no se terminó' };
    document.getElementById('modal-nov-sector').textContent   = n.sector;
    document.getElementById('modal-nov-meta').textContent     = `${n.fechaCorta} · Por ${n.usuario}`;
    document.getElementById('modal-nov-desc').textContent     = n.descripcion;
    document.getElementById('modal-nov-resp').textContent     = n.responsable || '—';
    document.getElementById('modal-nov-resuelto').textContent = resueltoLabel[n.resuelto] || n.resuelto;
    document.getElementById('modal-nov-turno').textContent    = (n.turno || '').toUpperCase();
    const tipoBadge = document.getElementById('modal-nov-tipo');
    tipoBadge.textContent = tipoLabel[n.tipo] || n.tipo;
    tipoBadge.className   = `modal-badge modal-badge-tipo ${n.tipo}`;
    document.getElementById('modal-nov-overlay').style.display = 'flex';
};
window.cerrarModalNov = () => document.getElementById('modal-nov-overlay').style.display = 'none';

// ══ KPIs ══
function actualizarKpis() {
    const el = id => document.getElementById(id);
    const arr = state.partesFiltrados;
    const enProceso = arr.filter(x => x.estado === 'en-proceso' || x.estado === 'en-progreso').length;
    if (el('kpi-total')) {
        el('kpi-total').textContent       = arr.length;
        el('kpi-completados').textContent = arr.filter(x => x.estado === 'completado').length;
        el('kpi-pendientes').textContent  = arr.filter(x => x.estado === 'pendiente').length;
        el('kpi-progreso').textContent    = enProceso;
    }
    actualizarKpisStats();
}

function actualizarKpisStats() {
    const el = id => document.getElementById(id);
    const arr = state.partesFiltrados;
    const enProceso = arr.filter(x => x.estado === 'en-proceso' || x.estado === 'en-progreso').length;
    if (el('kpi-total-s')) {
        el('kpi-total-s').textContent       = arr.length;
        el('kpi-completados-s').textContent = arr.filter(x => x.estado === 'completado').length;
        el('kpi-pendientes-s').textContent  = arr.filter(x => x.estado === 'pendiente').length;
        el('kpi-progreso-s').textContent    = enProceso;
    }
}

function actualizarKpisNov() {
    const el = id => document.getElementById(id);
    if (!el('kpi-nov-total')) return;
    const arr = state.novedades;
    el('kpi-nov-total').textContent      = arr.length;
    el('kpi-nov-urgente').textContent    = arr.filter(x => x.tipo === 'urgente').length;
    el('kpi-nov-noresuelto').textContent = arr.filter(x => x.resuelto !== 'si').length;
}

// ══ CHARTS ══
let charts = {};

function renderCharts() {
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
    const gridColor   = '#40444b55';
    const tickStyle   = { color: '#8e9297', font: { family: 'DM Mono', size: 10 } };
    const legendStyle = { labels: { color: '#8e9297', font: { family: 'DM Mono', size: 11 }, padding: 16, boxWidth: 12 } };

    const cSec = document.getElementById('chart-sectores');
    if (cSec) {
        const map = {};
        state.partesFiltrados.forEach(p => { map[p.sector] = (map[p.sector]||0) + 1; });
        charts.sectores = new Chart(cSec, {
            type: 'bar',
            data: { labels: Object.keys(map), datasets:[{ data:Object.values(map), backgroundColor:'#e8452c66', borderColor:'#e8452c', borderWidth:1, borderRadius:2 }] },
            options: { plugins:{legend:{display:false}}, scales:{ x:{ticks:tickStyle,grid:{color:gridColor}}, y:{ticks:{...tickStyle,stepSize:1},grid:{color:gridColor},beginAtZero:true} } }
        });
    }

    const cEst = document.getElementById('chart-estados');
    if (cEst) {
        const enProceso = state.partesFiltrados.filter(x => x.estado === 'en-proceso' || x.estado === 'en-progreso').length;
        charts.estados = new Chart(cEst, {
            type: 'doughnut',
            data: { labels:['Completado','Pendiente','En Proceso'], datasets:[{ data:[
                state.partesFiltrados.filter(x=>x.estado==='completado').length,
                state.partesFiltrados.filter(x=>x.estado==='pendiente').length,
                enProceso
            ], backgroundColor:['#2d4a2e','#66261d','#5c4a14'], borderColor:['#63b167','#ff6b57','#f5b324'], borderWidth:1 }] },
            options: { plugins:{legend:legendStyle} }
        });
    }

    const cTipo = document.getElementById('chart-tipos');
    if (cTipo) {
        charts.tipos = new Chart(cTipo, {
            type: 'doughnut',
            data: { labels:['Problema','Observación','Urgente'], datasets:[{ data:[
                state.novedades.filter(x=>x.tipo==='problema').length,
                state.novedades.filter(x=>x.tipo==='observacion').length,
                state.novedades.filter(x=>x.tipo==='urgente').length
            ], backgroundColor:['#5c4a14','#1e3a5f','#66261d'], borderColor:['#f5b324','#60a5fa','#ff6b57'], borderWidth:1 }] },
            options: { plugins:{legend:legendStyle} }
        });
    }

    const cNovSec = document.getElementById('chart-nov-sectores');
    if (cNovSec) {
        const map = {};
        state.novedades.forEach(n => { map[n.sector] = (map[n.sector]||0) + 1; });
        charts.novSectores = new Chart(cNovSec, {
            type: 'bar',
            data: { labels: Object.keys(map), datasets:[{ data:Object.values(map), backgroundColor:'#d9770666', borderColor:'#d97706', borderWidth:1, borderRadius:2 }] },
            options: { plugins:{legend:{display:false}}, scales:{ x:{ticks:tickStyle,grid:{color:gridColor}}, y:{ticks:{...tickStyle,stepSize:1},grid:{color:gridColor},beginAtZero:true} } }
        });
    }
}
