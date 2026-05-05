import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_PROJECT.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROJECT.firebasestorage.app",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COL = "partes";

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
    turnoActivo: null,
    estadoActivo: null,
    unsub: null
};

// ══ FECHA ACTUAL ══
document.getElementById('fecha-actual').textContent = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
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
    const pass = document.getElementById('login-pass').value.trim();
    const user = USERS[username];

    if (!user || user.password !== pass || user.role !== state.role) {
        showToast('Acceso denegado', true);
        return;
    }

    state.currentUser = user.nombre;
    document.getElementById('screen-login').style.display = 'none';

    if (state.role === 'mantenimiento') {
        document.getElementById('screen-carga').style.display = 'block';
        document.getElementById('carga-nombre').textContent = user.nombre;
    } else {
        document.getElementById('screen-vis').style.display = 'flex';
        document.getElementById('vis-nombre').textContent = user.nombre;
        document.querySelector('.role-tag.vis').textContent = state.role.toUpperCase();
    }
    suscribirPartes();
});

// ══ FIRESTORE ══
function suscribirPartes() {
    const q = query(collection(db, COL), orderBy('timestamp', 'desc'));
    state.unsub = onSnapshot(q, (snap) => {
        state.partes = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        state.partesFiltrados = [...state.partes];
        renderAll();
    });
}

// ══ RENDER ══
function renderAll() {
    const cargaList = document.getElementById('historial-carga-list');
    const visList   = document.getElementById('partes-list');

    const html = state.partesFiltrados.map(p => {
        const estadoLabel = {
            'completado':  'COMPLETADO',
            'pendiente':   'PENDIENTE',
            'en-progreso': 'EN PROGRESO'
        };
        return `
        <div class="parte-card estado-${p.estado}" onclick="verParte('${p.firestoreId}')">
            <div class="parte-header">
                <div class="parte-sector">${p.sector}</div>
                <div class="parte-estado ${p.estado}">${estadoLabel[p.estado] || p.estado}</div>
            </div>
            <div style="font-size:10px;color:var(--muted);margin:4px 0;font-family:var(--font-mono)">
                ${p.fechaCorta} · TURNO ${p.turno ? p.turno.toUpperCase() : '—'}
            </div>
            <div style="font-size:13px;">${p.realizada}</div>
        </div>`;
    }).join('') || '<p style="color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:20px 0">Sin registros.</p>';

    if (cargaList) cargaList.innerHTML = html;
    if (visList)   visList.innerHTML   = html;

    actualizarKpis();
    renderCharts();
}

// ══ TURNO / ESTADO ══
document.querySelectorAll('.turno-btn').forEach(b => b.addEventListener('click', e => {
    document.querySelectorAll('.turno-btn').forEach(x => x.classList.remove('selected'));
    e.target.classList.add('selected');
    state.turnoActivo = e.target.dataset.turno;
}));

document.querySelectorAll('.estado-btn').forEach(b => b.addEventListener('click', e => {
    document.querySelectorAll('.estado-btn').forEach(x => x.classList.remove('selected'));
    e.target.classList.add('selected');
    state.estadoActivo = e.target.dataset.estado;
}));

// ══ SECTOR "OTROS" — mostrar campo libre ══
document.getElementById('campo-sector').addEventListener('change', function () {
    const wrap = document.getElementById('campo-sector-otro-wrap');
    wrap.style.display = this.value === 'Otros' ? 'block' : 'none';
    if (this.value !== 'Otros') {
        document.getElementById('campo-sector-otro').value = '';
    }
});

// ══ GUARDAR PARTE ══
document.getElementById('btn-guardar-parte').addEventListener('click', async () => {
    const sectorSelect = document.getElementById('campo-sector').value;
    const sectorOtro   = document.getElementById('campo-sector-otro').value.trim();
    const realizada    = document.getElementById('campo-realizada').value.trim();
    const resp         = document.getElementById('campo-responsable').value.trim();
    const solicitada   = document.querySelector('input[name="solicitada"]:checked')?.value || 'no';

    // Determinar sector final
    let sector = sectorSelect;
    if (sectorSelect === 'Otros') {
        if (!sectorOtro) {
            showToast('Especificá el sector', true);
            return;
        }
        sector = sectorOtro;
    }

    if (!sector || !realizada || !state.turnoActivo || !state.estadoActivo) {
        showToast('Faltan datos obligatorios', true);
        return;
    }

    try {
        await addDoc(collection(db, COL), {
            timestamp:  Date.now(),
            fechaCorta: new Date().toLocaleDateString('es-AR'),
            turno:      state.turnoActivo,
            sector,
            realizada,
            responsable: resp,
            solicitada,
            estado:     state.estadoActivo,
            usuario:    state.currentUser
        });
        showToast('Guardado correctamente');
        resetForm();
    } catch (e) {
        showToast('Error al guardar', true);
        console.error(e);
    }
});

// ══ FILTROS ══
document.getElementById('btn-filtrar')?.addEventListener('click', () => {
    const desde   = document.getElementById('filtro-desde').value;
    const hasta   = document.getElementById('filtro-hasta').value;
    const sector  = document.getElementById('filtro-sector').value;

    state.partesFiltrados = state.partes.filter(p => {
        const fecha = new Date(p.timestamp);
        if (desde && fecha < new Date(desde)) return false;
        if (hasta && fecha > new Date(hasta + 'T23:59:59')) return false;
        if (sector && p.sector !== sector) return false;
        return true;
    });
    renderAll();
});

document.getElementById('btn-limpiar')?.addEventListener('click', () => {
    document.getElementById('filtro-desde').value  = '';
    document.getElementById('filtro-hasta').value  = '';
    document.getElementById('filtro-sector').value = '';
    state.partesFiltrados = [...state.partes];
    renderAll();
});

// ══ UTILS ══
function showToast(m, err = false) {
    const t = document.getElementById('toast');
    t.textContent = m;
    t.className = `toast ${err ? 'err' : ''} show`;
    setTimeout(() => t.classList.remove('show'), 2500);
}

function resetForm() {
    document.getElementById('campo-realizada').value   = '';
    document.getElementById('campo-responsable').value = '';
    document.getElementById('campo-sector').value      = '';
    document.getElementById('campo-sector-otro').value = '';
    document.getElementById('campo-sector-otro-wrap').style.display = 'none';
    document.querySelectorAll('.turno-btn, .estado-btn').forEach(b => b.classList.remove('selected'));
    const noRadio = document.querySelector('input[name="solicitada"][value="no"]');
    if (noRadio) noRadio.checked = true;
    state.turnoActivo  = null;
    state.estadoActivo = null;
}

window.doLogout = () => location.reload();

window.verParte = (id) => {
    const p = state.partes.find(x => x.firestoreId === id);
    if (!p) return;
    document.getElementById('modal-sector').textContent      = p.sector;
    document.getElementById('modal-meta').textContent        = `${p.fechaCorta} · Por ${p.usuario}`;
    document.getElementById('modal-realizada').textContent   = p.realizada;
    document.getElementById('modal-responsable').textContent = p.responsable || '—';
    document.getElementById('modal-solicitada').textContent  = p.solicitada === 'si' ? 'Sí' : 'No';
    document.getElementById('modal-turno').textContent       = p.turno ? p.turno.toUpperCase() : '—';
    document.getElementById('modal-estado').textContent      = p.estado ? p.estado.toUpperCase() : '—';
    document.getElementById('modal-overlay').style.display   = 'flex';
};

window.cerrarModal = () => document.getElementById('modal-overlay').style.display = 'none';

// ══ KPIs ══
function actualizarKpis() {
    const el = id => document.getElementById(id);
    if (!el('kpi-total')) return;
    el('kpi-total').textContent       = state.partesFiltrados.length;
    el('kpi-completados').textContent = state.partesFiltrados.filter(x => x.estado === 'completado').length;
    el('kpi-pendientes').textContent  = state.partesFiltrados.filter(x => x.estado === 'pendiente').length;
}

// ══ CHARTS ══
let chartSectores = null;
let chartEstados  = null;

function renderCharts() {
    const cSec = document.getElementById('chart-sectores');
    const cEst = document.getElementById('chart-estados');
    if (!cSec || !cEst) return;

    const chartDefaults = {
        color: '#8e9297',
        plugins: { legend: { labels: { color: '#8e9297', font: { family: 'DM Mono', size: 11 } } } }
    };

    // Por sector
    const sectores = {};
    state.partesFiltrados.forEach(p => { sectores[p.sector] = (sectores[p.sector] || 0) + 1; });
    if (chartSectores) chartSectores.destroy();
    chartSectores = new Chart(cSec, {
        type: 'bar',
        data: {
            labels: Object.keys(sectores),
            datasets: [{ data: Object.values(sectores), backgroundColor: '#e8452c88', borderColor: '#e8452c', borderWidth: 1 }]
        },
        options: {
            ...chartDefaults,
            plugins: { ...chartDefaults.plugins, legend: { display: false } },
            scales: {
                x: { ticks: { color: '#8e9297', font: { family: 'DM Mono', size: 10 } }, grid: { color: '#40444b55' } },
                y: { ticks: { color: '#8e9297', font: { family: 'DM Mono', size: 10 } }, grid: { color: '#40444b55' } }
            }
        }
    });

    // Por estado
    const estados = { completado: 0, pendiente: 0, 'en-progreso': 0 };
    state.partesFiltrados.forEach(p => { if (estados[p.estado] !== undefined) estados[p.estado]++; });
    if (chartEstados) chartEstados.destroy();
    chartEstados = new Chart(cEst, {
        type: 'doughnut',
        data: {
            labels: ['Completado', 'Pendiente', 'En Progreso'],
            datasets: [{ data: Object.values(estados), backgroundColor: ['#2d4a2e', '#66261d', '#5c4a14'], borderColor: ['#63b167', '#ff6b57', '#f5b324'], borderWidth: 1 }]
        },
        options: { ...chartDefaults }
    });
}

// ══ TABS ══
document.querySelectorAll('.vis-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const container = e.target.closest('.vis-tabs').parentElement;
        container.querySelectorAll('.vis-tab').forEach(t => t.classList.remove('active'));
        container.querySelectorAll('.vis-tab-content').forEach(c => {
            c.style.display = 'none';
            c.classList.remove('active');
        });
        e.target.classList.add('active');
        const target = document.getElementById(e.target.dataset.tab);
        if (target) {
            target.style.display = 'block';
            target.classList.add('active');
        }
    });
});
