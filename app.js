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
    "mtto1": { password: "123", role: "mantenimiento", nombre: "Técnico Juan" },
    "supervisor1": { password: "123", role: "supervisor", nombre: "Gte. Producción" },
    "admin": { password: "123", role: "visualizador", nombre: "Admin Romero" }
};

const state = { role: null, currentUser: '', partes: [], turnoActivo: null, estadoActivo: null, unsub: null };

// --- LOGIN ---
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

function suscribirPartes() {
    const q = query(collection(db, COL), orderBy('timestamp', 'desc'));
    state.unsub = onSnapshot(q, (snap) => {
        state.partes = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        renderAll();
    });
}

function renderAll() {
    const cargaList = document.getElementById('historial-carga-list');
    const visList = document.getElementById('partes-list');

    const html = state.partes.map(p => {
        const estadoLabel = { 'completado': 'COMPLETADO', 'pendiente': 'PENDIENTE', 'en-progreso': 'EN PROGRESO' };
        return `
        <div class="parte-card estado-${p.estado}" onclick="verParte('${p.firestoreId}')">
            <div class="parte-header">
                <div class="parte-sector">${p.sector}</div>
                <div class="parte-estado ${p.estado}">${estadoLabel[p.estado]}</div>
            </div>
            <div style="font-size:10px; color:var(--muted); margin: 4px 0;">${p.fechaCorta} · TURNO ${p.turno.toUpperCase()}</div>
            <div style="font-size:13px;">${p.realizada}</div>
        </div>`;
    }).join('');

    if (cargaList) cargaList.innerHTML = html;
    if (visList) visList.innerHTML = html;
    actualizarKpis();
}

// --- CARGA ---
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

document.getElementById('btn-guardar-parte').addEventListener('click', async () => {
    const sector = document.getElementById('campo-sector').value;
    const realizada = document.getElementById('campo-realizada').value;
    const resp = document.getElementById('campo-responsable').value;

    if (!sector || !realizada || !state.turnoActivo || !state.estadoActivo) {
        showToast('Faltan datos obligatorios', true);
        return;
    }

    try {
        await addDoc(collection(db, COL), {
            timestamp: Date.now(),
            fechaCorta: new Date().toLocaleDateString(),
            turno: state.turnoActivo,
            sector,
            realizada,
            responsable: resp,
            estado: state.estadoActivo,
            usuario: state.currentUser
        });
        showToast('Guardado correctamente');
        resetForm();
    } catch (e) { showToast('Error al guardar', true); }
});

// --- UTILS ---
function showToast(m, err = false) {
    const t = document.getElementById('toast');
    t.textContent = m;
    t.className = `toast ${err ? 'err' : ''} show`;
    setTimeout(() => t.classList.remove('show'), 2500);
}

function resetForm() {
    document.getElementById('campo-realizada').value = '';
    document.querySelectorAll('.turno-btn, .estado-btn').forEach(b => b.classList.remove('selected'));
    state.turnoActivo = null; state.estadoActivo = null;
}

window.doLogout = () => location.reload();

window.verParte = (id) => {
    const p = state.partes.find(x => x.firestoreId === id);
    document.getElementById('modal-sector').textContent = p.sector;
    document.getElementById('modal-meta').textContent = `${p.fechaCorta} · Por ${p.usuario}`;
    document.getElementById('modal-realizada').textContent = p.realizada;
    document.getElementById('modal-responsable').textContent = p.responsable;
    document.getElementById('modal-turno').textContent = p.turno.toUpperCase();
    document.getElementById('modal-estado').textContent = p.estado.toUpperCase();
    document.getElementById('modal-overlay').style.display = 'flex';
};

window.cerrarModal = () => document.getElementById('modal-overlay').style.display = 'none';

function actualizarKpis() {
    if (!document.getElementById('kpi-total')) return;
    document.getElementById('kpi-total').textContent = state.partes.length;
    document.getElementById('kpi-completados').textContent = state.partes.filter(x => x.estado === 'completado').length;
    document.getElementById('kpi-pendientes').textContent = state.partes.filter(x => x.estado === 'pendiente').length;
}

// --- TABS ---
document.querySelectorAll('.vis-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const container = e.target.closest('.vis-tabs').parentElement;
        container.querySelectorAll('.vis-tab').forEach(t => t.classList.remove('active'));
        container.querySelectorAll('.vis-tab-content').forEach(c => c.style.display = 'none');
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).style.display = 'block';
    });
});
