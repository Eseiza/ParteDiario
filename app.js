import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  addDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

/* ══ FIREBASE — reemplazá con tu config ══ */
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
const COL = "partes";

/* ══ USUARIOS ══ */
const USERS = {
  "mtto1":       { password: "Mtto.2026",  role: "mantenimiento", nombre: "Técnico 1" },
  "mtto2":       { password: "Mtto.2026",  role: "mantenimiento", nombre: "Técnico 2" },
  "mtto3":       { password: "Mtto.2026",  role: "mantenimiento", nombre: "Técnico 3" },
  "supervisor1": { password: "Super.2026", role: "supervisor",    nombre: "Supervisor 1" },
  "supervisor2": { password: "Super.2026", role: "supervisor",    nombre: "Supervisor 2" },
  "Admin":       { password: "Admin.2026", role: "visualizador",  nombre: "Administrador" },
};

/* ══ STATE ══ */
const state = {
  role:        null,
  currentUser: '',
  partes:      [],
  turnoActivo: null,
  estadoActivo: null,
  unsubPartes: null,
};

/* ══════════════════════════════════════
   UTILS
══════════════════════════════════════ */
function showToast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function formatFecha(iso) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

/* ══════════════════════════════════════
   FIRESTORE
══════════════════════════════════════ */
function suscribirPartes() {
  const q = query(collection(db, COL), orderBy('timestamp', 'desc'));
  state.unsubPartes = onSnapshot(q, (snap) => {
    state.partes = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
    refrescarVistas();
  }, (err) => showToast('Error Firestore: ' + err.message, true));
}

function refrescarVistas() {
  if (state.role === 'visualizador') {
    aplicarFiltros();
    actualizarKpis();
    const tabStats = document.getElementById('tab-stats');
    if (tabStats && tabStats.style.display !== 'none') setTimeout(renderGraficos, 120);
  } else {
    renderHistorialCarga();
  }
}

/* ══════════════════════════════════════
   LOGIN / LOGOUT
══════════════════════════════════════ */
document.querySelectorAll('.role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.role = btn.dataset.role;
  });
});

['login-user', 'login-pass'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
});

document.getElementById('login-btn').addEventListener('click', doLogin);

function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  if (!username || !password) { showToast('Ingresá usuario y contraseña', true); return; }
  if (!state.role)            { showToast('Seleccioná un rol', true); return; }

  const user = USERS[username];
  if (!user || user.password !== password) { showToast('Usuario o contraseña incorrectos', true); return; }
  if (user.role !== state.role) { showToast(`Este usuario es "${user.role}"`, true); return; }

  state.currentUser = user.nombre;
  document.getElementById('screen-login').style.display = 'none';

  if (state.role === 'visualizador') {
    document.getElementById('screen-vis').style.display = 'flex';
    document.getElementById('vis-nombre').textContent   = user.nombre;
  } else {
    document.getElementById('screen-carga').style.cssText = 'display:flex;flex-direction:column;min-height:100vh;width:100%';
    document.getElementById('carga-nombre').textContent = user.nombre;
    const tag = document.getElementById('carga-role-tag');
    tag.textContent  = state.role === 'supervisor' ? 'SUPERVISOR' : 'MANTENIMIENTO';
    tag.className    = 'role-tag ' + (state.role === 'supervisor' ? 'sup' : 'mtto');
    // Actualizar fecha/hora
    actualizarFecha();
    setInterval(actualizarFecha, 60000);
  }

  suscribirPartes();
}

window.doLogout = function() {
  if (state.unsubPartes) state.unsubPartes();
  state.role        = null;
  state.currentUser = '';
  state.partes      = [];
  state.turnoActivo  = null;
  state.estadoActivo = null;
  document.getElementById('screen-carga').style.display = 'none';
  document.getElementById('screen-vis').style.display   = 'none';
  document.getElementById('screen-login').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
};

function actualizarFecha() {
  const ahora = new Date();
  document.getElementById('fecha-actual').textContent =
    ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) +
    ' · ' + ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ══════════════════════════════════════
   TABS — PANTALLA CARGA
══════════════════════════════════════ */
document.querySelectorAll('#screen-carga .vis-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#screen-carga .vis-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#screen-carga .vis-tab-content').forEach(c => c.style.display = 'none');
    tab.classList.add('active');
    const content = document.getElementById(tab.dataset.tab);
    content.style.display = 'block';
    if (tab.dataset.tab === 'tab-historial-carga') renderHistorialCarga();
  });
});

/* ══════════════════════════════════════
   TABS — PANTALLA VISUALIZADOR
══════════════════════════════════════ */
document.querySelectorAll('#screen-vis .vis-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#screen-vis .vis-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#screen-vis .vis-tab-content').forEach(c => c.style.display = 'none');
    tab.classList.add('active');
    const content = document.getElementById(tab.dataset.tab);
    content.style.display = 'block';
    if (tab.dataset.tab === 'tab-stats') setTimeout(renderGraficos, 120);
    if (tab.dataset.tab === 'tab-partes') aplicarFiltros();
  });
});

/* ══════════════════════════════════════
   TURNO Y ESTADO SELECTORS
══════════════════════════════════════ */
document.querySelectorAll('.turno-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.turno-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.turnoActivo = btn.dataset.turno;
  });
});

document.querySelectorAll('.estado-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.estado-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.estadoActivo = btn.dataset.estado;
  });
});

/* Mostrar/ocultar campo sector otro */
document.getElementById('campo-sector').addEventListener('change', function() {
  const wrap = document.getElementById('campo-sector-otro-wrap');
  wrap.style.display = this.value === 'Otros' ? 'block' : 'none';
});

/* ══════════════════════════════════════
   GUARDAR PARTE
══════════════════════════════════════ */
document.getElementById('btn-guardar-parte').addEventListener('click', async () => {
  const sector      = document.getElementById('campo-sector').value;
  const sectorOtro  = document.getElementById('campo-sector-otro').value.trim();
  const responsable = document.getElementById('campo-responsable').value.trim();
  const solicitada  = document.getElementById('campo-solicitada').value.trim();
  const realizada   = document.getElementById('campo-realizada').value.trim();
  const esSolicitada = document.querySelector('input[name="solicitada"]:checked').value;

  if (!sector)      { showToast('Seleccioná un sector', true); return; }
  if (sector === 'Otros' && !sectorOtro) { showToast('Especificá el sector', true); return; }
  if (!state.turnoActivo)  { showToast('Seleccioná el turno', true); return; }
  if (!state.estadoActivo) { showToast('Seleccioná el estado', true); return; }
  if (!responsable) { showToast('Ingresá el responsable', true); return; }
  if (!solicitada && !realizada) { showToast('Completá al menos una descripción', true); return; }

  const ahora = new Date();
  const parte = {
    timestamp:    ahora.getTime(),
    fecha:        ahora.toISOString(),
    fechaCorta:   fechaCorta(ahora.toISOString()),
    hora:         ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    turno:        state.turnoActivo,
    sector:       sector === 'Otros' ? sectorOtro : sector,
    esSolicitada: esSolicitada === 'si',
    responsable,
    solicitada,
    realizada,
    estado:       state.estadoActivo,
    usuario:      state.currentUser,
    rol:          state.role,
  };

  const btn = document.getElementById('btn-guardar-parte');
  btn.disabled = true;

  try {
    await addDoc(collection(db, COL), parte);
    showToast('✓ Parte guardado');
    limpiarFormulario();
  } catch (e) {
    showToast('Error al guardar: ' + e.message, true);
  } finally {
    btn.disabled = false;
  }
});

function limpiarFormulario() {
  document.getElementById('campo-sector').value      = '';
  document.getElementById('campo-sector-otro').value = '';
  document.getElementById('campo-responsable').value = '';
  document.getElementById('campo-solicitada').value  = '';
  document.getElementById('campo-realizada').value   = '';
  document.getElementById('campo-sector-otro-wrap').style.display = 'none';
  document.querySelector('input[name="solicitada"][value="no"]').checked = true;
  document.querySelectorAll('.turno-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.estado-btn').forEach(b => b.classList.remove('selected'));
  state.turnoActivo  = null;
  state.estadoActivo = null;
}

/* ══════════════════════════════════════
   HISTORIAL CARGA
══════════════════════════════════════ */
function renderHistorialCarga() {
  const list = document.getElementById('historial-carga-list');
  if (!list) return;

  // Mantenimiento ve solo los suyos, supervisor ve todos
  const items = state.role === 'supervisor'
    ? state.partes
    : state.partes.filter(p => p.usuario === state.currentUser);

  if (!items.length) {
    list.innerHTML = '<div class="empty-msg">No hay partes registrados todavía.</div>';
    return;
  }

  list.innerHTML = items.map(p => buildParteCard(p)).join('');
}

/* ══════════════════════════════════════
   VISUALIZADOR — FILTROS Y LISTA
══════════════════════════════════════ */
document.getElementById('btn-filtrar').addEventListener('click', aplicarFiltros);

document.getElementById('btn-limpiar').addEventListener('click', () => {
  document.getElementById('filtro-desde').value       = '';
  document.getElementById('filtro-hasta').value       = '';
  document.getElementById('filtro-sector').value      = '';
  document.getElementById('filtro-turno').value       = '';
  document.getElementById('filtro-estado').value      = '';
  document.getElementById('filtro-responsable').value = '';
  aplicarFiltros();
});

function aplicarFiltros() {
  const desde       = document.getElementById('filtro-desde').value;
  const hasta       = document.getElementById('filtro-hasta').value;
  const sector      = document.getElementById('filtro-sector').value;
  const turno       = document.getElementById('filtro-turno').value;
  const estado      = document.getElementById('filtro-estado').value;
  const responsable = document.getElementById('filtro-responsable').value.toLowerCase().trim();

  let items = [...state.partes];
  if (desde)       items = items.filter(p => p.fecha.slice(0,10) >= desde);
  if (hasta)       items = items.filter(p => p.fecha.slice(0,10) <= hasta);
  if (sector)      items = items.filter(p => p.sector === sector);
  if (turno)       items = items.filter(p => p.turno  === turno);
  if (estado)      items = items.filter(p => p.estado === estado);
  if (responsable) items = items.filter(p => p.responsable.toLowerCase().includes(responsable));

  const list = document.getElementById('partes-list');
  if (!items.length) {
    list.innerHTML = '<div class="empty-msg">Sin partes para los filtros aplicados.</div>';
    return;
  }
  list.innerHTML = items.map(p => buildParteCard(p)).join('');
  actualizarKpis();
}

function buildParteCard(p) {
  const turnoLabel = { 'mañana': '🌅 MAÑANA', 'tarde': '☀️ TARDE', 'noche': '🌙 NOCHE' };
  const estadoLabel = { 'completado': 'COMPLETADO', 'pendiente': 'PENDIENTE', 'en-progreso': 'EN PROGRESO' };
  const desc = p.realizada || p.solicitada || '—';
  return `
  <div class="parte-card estado-${p.estado}" onclick="verParte('${p.firestoreId}')">
    <div class="parte-header">
      <div class="parte-sector">${p.sector}</div>
      <div class="parte-estado ${p.estado}">${estadoLabel[p.estado] || p.estado}</div>
    </div>
    <div class="parte-meta">
      ${formatFecha(p.fecha)}
      <span class="badge-turno ${p.turno}">${turnoLabel[p.turno] || p.turno}</span>
      ${p.esSolicitada ? '<span class="badge-solicitada">SOLICITADA</span>' : ''}
    </div>
    <div class="parte-desc">${desc}</div>
    <div class="parte-responsable">👤 ${p.responsable} · ${p.usuario}</div>
  </div>`;
}

/* ══════════════════════════════════════
   MODAL VER PARTE
══════════════════════════════════════ */
window.verParte = function(firestoreId) {
  const p = state.partes.find(x => x.firestoreId === firestoreId);
  if (!p) return;

  const turnoLabel  = { 'mañana': '🌅 MAÑANA', 'tarde': '☀️ TARDE', 'noche': '🌙 NOCHE' };
  const estadoLabel = { 'completado': '✅ COMPLETADO', 'pendiente': '⏳ PENDIENTE', 'en-progreso': '🔄 EN PROGRESO' };

  document.getElementById('modal-sector').textContent     = p.sector;
  document.getElementById('modal-meta').textContent       = `${formatFecha(p.fecha)} · ${p.usuario}`;
  document.getElementById('modal-solicitada').textContent = p.solicitada || '—';
  document.getElementById('modal-realizada').textContent  = p.realizada  || '—';
  document.getElementById('modal-responsable').textContent= p.responsable;
  document.getElementById('modal-turno').textContent      = turnoLabel[p.turno]  || p.turno;
  document.getElementById('modal-estado').textContent     = estadoLabel[p.estado] || p.estado;
  document.getElementById('modal-solicitada-badge').textContent = p.esSolicitada ? '📌 TAREA SOLICITADA' : '— NO SOLICITADA';

  document.getElementById('modal-overlay').style.display = 'flex';
};

window.cerrarModal = function() {
  document.getElementById('modal-overlay').style.display = 'none';
};

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) cerrarModal();
});

/* ══════════════════════════════════════
   KPIs
══════════════════════════════════════ */
function actualizarKpis() {
  const p = state.partes;
  document.getElementById('kpi-total').textContent      = p.length;
  document.getElementById('kpi-completados').textContent = p.filter(x => x.estado === 'completado').length;
  document.getElementById('kpi-pendientes').textContent  = p.filter(x => x.estado === 'pendiente').length;
}

/* ══════════════════════════════════════
   GRÁFICOS
══════════════════════════════════════ */
const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function renderGraficos() {
  if (typeof Chart === 'undefined') { setTimeout(renderGraficos, 300); return; }
  const tab = document.getElementById('tab-stats');
  if (!tab || tab.style.display === 'none') return;

  Chart.defaults.color       = '#6a8f6e';
  Chart.defaults.borderColor = '#2a3d2e';
  Chart.defaults.font.family = 'DM Mono, monospace';
  Chart.defaults.font.size   = 11;

  const p = state.partes;

  /* 1. Por sector */
  const porSector = {};
  p.forEach(x => { porSector[x.sector] = (porSector[x.sector] || 0) + 1; });
  const sectores = Object.entries(porSector).sort((a,b) => b[1]-a[1]);

  destroyChart('sectores');
  chartInstances['sectores'] = new Chart(document.getElementById('chart-sectores'), {
    type: 'bar',
    data: {
      labels: sectores.map(s => s[0]),
      datasets: [{ label: 'Partes', data: sectores.map(s => s[1]),
        backgroundColor: 'rgba(76,175,80,0.7)', borderColor: '#4caf50', borderWidth: 1, borderRadius: 3 }]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 10 } } } }
    }
  });

  /* 2. Por turno */
  const porTurno = { 'mañana': 0, 'tarde': 0, 'noche': 0 };
  p.forEach(x => { if (porTurno[x.turno] !== undefined) porTurno[x.turno]++; });

  destroyChart('turnos');
  chartInstances['turnos'] = new Chart(document.getElementById('chart-turnos'), {
    type: 'doughnut',
    data: {
      labels: ['Mañana', 'Tarde', 'Noche'],
      datasets: [{ data: Object.values(porTurno),
        backgroundColor: ['rgba(200,134,10,0.8)', 'rgba(76,175,80,0.8)', 'rgba(42,122,181,0.8)'],
        borderColor: ['#c8860a', '#4caf50', '#2a7ab5'], borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#6a8f6e' } } }
    }
  });

  /* 3. Por estado */
  const porEstado = { 'completado': 0, 'pendiente': 0, 'en-progreso': 0 };
  p.forEach(x => { if (porEstado[x.estado] !== undefined) porEstado[x.estado]++; });

  destroyChart('estados');
  chartInstances['estados'] = new Chart(document.getElementById('chart-estados'), {
    type: 'doughnut',
    data: {
      labels: ['Completado', 'Pendiente', 'En progreso'],
      datasets: [{ data: Object.values(porEstado),
        backgroundColor: ['rgba(76,175,80,0.8)', 'rgba(232,69,44,0.8)', 'rgba(200,134,10,0.8)'],
        borderColor: ['#4caf50', '#e8452c', '#c8860a'], borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#6a8f6e' } } }
    }
  });

  /* 4. Por día */
  const porDia = {};
  p.forEach(x => {
    const dia = x.fecha ? x.fecha.slice(0,10) : '';
    if (dia) porDia[dia] = (porDia[dia] || 0) + 1;
  });
  const dias = Object.keys(porDia).sort();

  destroyChart('dias');
  chartInstances['dias'] = new Chart(document.getElementById('chart-dias'), {
    type: 'line',
    data: {
      labels: dias.map(d => { const [y,m,day] = d.split('-'); return `${day}/${m}`; }),
      datasets: [{ label: 'Partes', data: dias.map(d => porDia[d]),
        borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.1)',
        pointBackgroundColor: '#4caf50', pointRadius: 4, fill: true, tension: 0.3 }]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: {}, y: { beginAtZero: true } }
    }
  });

  setTimeout(() => { Object.values(chartInstances).forEach(c => { try { c.resize(); } catch {} }); }, 100);
}
