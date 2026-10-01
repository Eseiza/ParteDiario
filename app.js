import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, updateDoc, deleteDoc, arrayUnion, doc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// ══ CONFIG FIREBASE ══
const firebaseConfig = {
  apiKey: "AIzaSyAmSTEfzcgGx-NbT_FCBDvECuNl0A2jbeY",
  authDomain: "partediarioromero.firebaseapp.com",
  databaseURL: "https://partediarioromero-default-rtdb.firebaseio.com",
  projectId: "partediarioromero",
  storageBucket: "partediarioromero.firebasestorage.app",
  messagingSenderId: "146566530037",
  appId: "1:146566530037:web:143b76fe54a9db05c1d6bc",
  measurementId: "G-REXHZQ7TXY"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const COL_PARTES    = "partes";
const COL_NOVEDADES = "novedades";
const COL_INFORMES  = "informes";
const COL_ORDENES   = "ordenesTrabajo";

// ══ USUARIOS ══
const USERS = {
    "mtto":       { password: "mtto12345",  role: "mantenimiento", nombre: "mtto" },
    "Javier":       { password: "mtto12345",  role: "mantenimiento", nombre: "Speroni" },
    "Joaquin":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Girard" },
    "Manuel":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Vidal" },
    "Matias":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Liway" },
    "Mateo":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Piedra" },
    "Ignacio":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Ledesma" },
    "JuanManuel":       { password: "mttoRomero",  role: "mantenimiento", nombre: "Cappelletti" },
    "supervisor1": { password: "super123", role: "supervisor",    nombre: "Supervisor" },
    "admin":       { password: "admin123",      role: "visualizador",  nombre: "Admin" }
};

// Usuarios (login) que además del autor pueden editar cualquier parte
const EDIT_PRIVILEGED_USERS = ["mtto", "Javier", "admin"];

// Puede editar el parte "p" quien lo cargó, o alguno de los usuarios con
// permiso ampliado (mtto, Javier, admin), siempre que no esté completado.
function puedeEditarParte(p) {
    return !!p
        && (p.usuario === state.currentUser || EDIT_PRIVILEGED_USERS.includes(state.username))
        && p.estado !== 'completado';
}

const state = {
    role: null,
    currentUser: '',
    username: '',
    partes: [],
    partesFiltrados: [],
    novedades: [],
    informes: [],
    informesFiltrados: [],
    turnoActivo:  null,
    estadoActivo: null,
    supTurno:     null,
    supTipo:      null,
    alcanceHistorial: 'grupo', // 'grupo' | 'individual' | 'todos' — a qué registros accede mantenimiento en su historial
    unsub:    null,
    unsubNov: null,
    unsubInformes: null
};

// ══ GRUPOS DE MANTENIMIENTO ══
// Se agrupa por el campo "nombre" (el que efectivamente se guarda como "usuario"
// en cada registro), no por el usuario de login.
// Grupo 1: JuanManuel (Cappe) y Ignacio (Ledesma)
// Grupo 2: Mateo (Piedra) y Matias (Liway)
// Grupo 3: Manuel (Vidal) y Joaquin (Girard)
const GROUPS = {
    "Cappelletti":   ["Cappelletti", "Ledesma"],
    "Ledesma": ["Cappelletti", "Ledesma"],
    "Piedra":  ["Piedra", "Liway"],
    "Liway":   ["Piedra", "Liway"],
    "Vidal":   ["Vidal", "Girard"],
    "Girard":  ["Vidal", "Girard"]
};

// Todos los "nombre" (los que se guardan en cada registro como "usuario") del equipo de mantenimiento
const ALL_MTTO_NOMBRES = Object.values(USERS).filter(u => u.role === 'mantenimiento').map(u => u.nombre);

// Usuarios que puede ver el usuario actual en su historial (él mismo + compañero de grupo).
// Si no pertenece a ningún grupo definido, solo ve lo propio.
function usuariosVisibles() {
    return GROUPS[state.currentUser] || [state.currentUser];
}

// Según el alcance elegido en el select de historial (grupo / individual / todos),
// devuelve la lista de "nombre" a mostrar, o null si no hay que filtrar (todos).
function usuariosSegunAlcance() {
    if (state.alcanceHistorial === 'individual') return [state.currentUser];
    if (state.alcanceHistorial === 'todos') return null;
    return usuariosVisibles(); // 'grupo' (default)
}

// Equipos de mantenimiento para filtrar en el panel de admin (mtto1 / mtto2 / mtto3)
const TEAMS = {
    mtto1: ["Cappelletti", "Ledesma"],   // Grupo 1: JuanManuel e Ignacio
    mtto2: ["Piedra", "Liway"],    // Grupo 2: Mateo y Matias
    mtto3: ["Vidal", "Girard"]     // Grupo 3: Manuel y Joaquin
};
const TEAM_LABELS = { mtto1: "Ledesma-Cappelletti", mtto2: "Piedra-Liway", mtto3: "Girard-Vidal" };

function equipoDe(nombre) {
    for (const key in TEAMS) {
        if (TEAMS[key].includes(nombre)) return TEAM_LABELS[key];
    }
    return null;
}

// ══ FECHA ══
const fechaHoy = new Date().toLocaleDateString('es-AR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
['fecha-actual', 'fecha-sup', 'fecha-ot'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = fechaHoy;
});

// ══ LOGIN ══
document.getElementById('login-role').addEventListener('change', (e) => {
    state.role = e.target.value;
});

// Select de alcance en el historial de mantenimiento (grupo / individual / todos)
document.getElementById('historial-alcance')?.addEventListener('change', (e) => {
    state.alcanceHistorial = e.target.value;
    renderPartes();
    renderInformes();
});

document.getElementById('login-btn').addEventListener('click', () => {
    const username = document.getElementById('login-user').value.trim();
    const pass     = document.getElementById('login-pass').value.trim();
    const user     = USERS[username];

    if (!user || user.password !== pass || user.role !== state.role) {
        showToast('Acceso denegado', true); return;
    }

    state.currentUser = user.nombre;
    state.username = username;
    document.getElementById('screen-login').style.display = 'none';

    if (state.role === 'mantenimiento') {
        document.getElementById('screen-carga').style.display = 'block';
        document.getElementById('carga-nombre').textContent = user.nombre;
        if (state.username === 'Javier') {
            const navTodos = document.getElementById('nav-mtto-todos');
            if (navTodos) navTodos.classList.remove('hidden-tab');
        }
        suscribirPartes();
        suscribirInformes();
        suscribirNovedadesMtto();

    } else if (state.role === 'supervisor') {
        document.getElementById('screen-supervisor').style.display = 'block';
        document.getElementById('sup-nombre').textContent = user.nombre;
        suscribirNovedadesSup();
        suscribirInformes();

    } else {
        document.getElementById('screen-vis').style.display = 'block';
        document.getElementById('vis-nombre').textContent = user.nombre;
        suscribirPartes();
        suscribirNovedadesVis();
        suscribirInformes();
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

// ══ FIRESTORE: NOVEDADES (mantenimiento: puede comentar y actualizar estado) ══
function suscribirNovedadesMtto() {
    const q = query(collection(db, COL_NOVEDADES), orderBy('timestamp', 'desc'));
    state.unsubNov = onSnapshot(q, snap => {
        state.novedades = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        renderNovedadesMtto();
        refrescarModalNovedad(); // si el modal está abierto, se actualiza en vivo
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
        refrescarModalNovedad();
    });
}

// ══ FIRESTORE: INFORMES (mantenimiento + supervisor + visualizador) ══
function suscribirInformes() {
    const q = query(collection(db, COL_INFORMES), orderBy('timestamp', 'desc'));
    state.unsubInformes = onSnapshot(q, snap => {
        state.informes = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        state.informesFiltrados = [...state.informes];
        renderInformes();
    });
}

// ══ RENDER PARTES ══
function renderPartes() {
    const listCarga = document.getElementById('historial-carga-list');
    const listVis   = document.getElementById('partes-list');

    if (listCarga) {
        // Mantenimiento ve su historial según el alcance elegido (grupo / individual / todos)
        let visibles = state.partesFiltrados;
        if (state.role === 'mantenimiento') {
            const permitidos = usuariosSegunAlcance();
            visibles = permitidos
                ? state.partesFiltrados.filter(p => permitidos.includes(p.usuario))
                : state.partesFiltrados;
        }
        listCarga.innerHTML = buildPartesHtml(visibles);
    }
    if (listVis) listVis.innerHTML = buildPartesHtml(state.partesFiltrados);

    // Pestaña extra de Javier: todos los partes de mantenimiento, sin filtrar
    const listMttoTodos = document.getElementById('mtto-todos-partes-list');
    if (listMttoTodos) listMttoTodos.innerHTML = buildPartesHtml(state.partesFiltrados);
}

function buildPartesHtml(arr) {
    if (!arr.length) return emptyMsg('Sin registros.');
    const labels = {
        completado:    'COMPLETADO',
        pendiente:     'PENDIENTE',
        'en-proceso':  'EN PROCESO',
        'en-progreso': 'EN PROCESO'
    };
    return arr.map(p => {
        const puedeEditar = puedeEditarParte(p);
        return `
        <div class="parte-card estado-${p.estado}" onclick="verParte('${p.firestoreId}')">
            <div class="parte-header">
                <div class="parte-sector">${p.sector}</div>
                <div style="display:flex;align-items:center;gap:6px">
                    <div class="parte-estado ${p.estado}">${labels[p.estado] || p.estado}</div>
                    ${puedeEditar ? `<button type="button" class="btn-editar-informe" onclick="event.stopPropagation(); editarParte('${p.firestoreId}')">EDITAR</button>` : ''}
                </div>
            </div>
            <div style="font-size:10px;color:var(--muted);margin:4px 0;font-family:var(--font-mono)">
                ${p.fechaCorta} · TURNO ${(p.turno||'').toUpperCase()}
            </div>
            <div style="font-size:13px;">${p.realizada}</div>
        </div>`;
    }).join('');
}

// ══ RENDER NOVEDADES ══
function renderHistorialSup() {
    const list = document.getElementById('historial-sup-list');
    if (!list) return;
    list.innerHTML = buildNovedadesHtml(state.novedades);
}

function renderNovedadesMtto() {
    const list = document.getElementById('mtto-novedades-list');
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
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end">
                    <span class="novedad-tipo-badge ${n.tipo}">${tipoLabel[n.tipo] || n.tipo}</span>
                    <span class="novedad-resuelto ${n.resuelto}">${resueltoLabel[n.resuelto] || n.resuelto}</span>
                    ${state.role === 'supervisor' && n.usuario === state.currentUser
                        ? `<button type="button" class="btn-editar-nov" onclick="event.stopPropagation(); editarNovedad('${n.firestoreId}')">✎ EDITAR</button>` : ''}
                </div>
            </div>
            <div style="font-size:10px;color:var(--muted);margin:4px 0;font-family:var(--font-mono)">
                ${n.fechaCorta} · TURNO ${(n.turno||'').toUpperCase()} · ${n.usuario}
            </div>
            <div style="font-size:13px;">${n.descripcion}</div>
            ${n.responsable ? `<div style="font-size:10px;color:var(--muted);margin-top:8px;font-family:var(--font-mono)">RESPONSABLE: ${n.responsable}</div>` : ''}
            ${respuestaMttoHtml(n)}
        </div>`).join('');
}

// Resumen de la respuesta de mantenimiento (último comentario / cambio de estado) dentro de la tarjeta
function respuestaMttoHtml(n) {
    const coms = n.comentarios || [];
    if (!coms.length && !n.usuarioActualizacion) return '';
    const esc = t => String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const ult = coms[coms.length - 1];
    return `
        <div class="nov-resp">
            <div class="nov-resp-label">RESPUESTA DE MANTENIMIENTO${coms.length > 1 ? ` · 💬 ${coms.length}` : ''}</div>
            ${ult ? `<div class="nov-resp-texto"><b>${esc(ult.usuario)}:</b> ${esc(ult.texto)}</div>` : ''}
            ${n.usuarioActualizacion ? `<div class="nov-resp-meta">Estado actualizado por ${esc(n.usuarioActualizacion)}${n.fechaActualizacion ? ' · ' + new Date(n.fechaActualizacion).toLocaleString('es-AR') : ''}</div>` : ''}
        </div>`;
}

// ══ RENDER INFORMES ══
function renderInformes() {
    // Mantenimiento: ve sus informes según el alcance elegido (grupo / individual / todos)
    const listMtto = document.getElementById('mtto-informes-list');
    if (listMtto) {
        const permitidos = usuariosSegunAlcance();
        const visibles = permitidos
            ? state.informes.filter(inf => permitidos.includes(inf.usuarioCreador))
            : state.informes;
        listMtto.innerHTML = buildInformesHtml(visibles, 'mtto');
    }

    // Pestaña extra de Javier: todos los informes, sin filtrar
    const listMttoTodos = document.getElementById('mtto-todos-informes-list');
    if (listMttoTodos) listMttoTodos.innerHTML = buildInformesHtml(state.informes, 'mtto');

    // Supervisor (Producción): ve todos los informes, salvo los de mantenimiento (no le corresponden)
    const listSup = document.getElementById('sup-informes-list');
    if (listSup) {
        const visiblesSup = state.informes.filter(inf => !ALL_MTTO_NOMBRES.includes(inf.usuarioCreador));
        listSup.innerHTML = buildInformesHtml(visiblesSup, 'sup');
    }

    // Visualizador/admin: ve todos, con filtros propios
    renderInformesVis();
}

function buildInformesHtml(arr, prefix) {
    if (!arr.length) return emptyMsg('Sin informes.');
    return arr.map(inf => {
        const fc = inf.fechaCreacion ? new Date(inf.fechaCreacion).toLocaleString('es-AR') : '—';
        const fe = inf.fechaEdicion  ? new Date(inf.fechaEdicion).toLocaleString('es-AR')  : null;
        const esPropio = inf.usuarioCreador === state.currentUser;
        return `
        <div class="informe-card" onclick="verInforme('${inf.firestoreId}')">
            <div class="informe-header">
                <div class="informe-asunto">${inf.asunto}</div>
                ${esPropio ? `
                <div class="informe-acciones">
                    <button type="button" class="btn-editar-informe" onclick="event.stopPropagation(); editarInforme_${prefix}('${inf.firestoreId}')">EDITAR</button>
                    <button type="button" class="btn-borrar-informe" onclick="event.stopPropagation(); borrarInforme('${inf.firestoreId}')">BORRAR</button>
                </div>` : ''}
            </div>
            <div class="informe-meta">
                De: ${inf.usuarioCreador || '—'} · Creado: ${fc}${fe ? ` · Editado: ${fe}` : ''}
            </div>
        </div>`;
    }).join('');
}

// ══ INFORMES — VISUALIZADOR (solo lectura, filtrable) ══
function renderInformesVis() {
    const el = document.getElementById('informes-vis-list');
    if (!el) return;
    el.innerHTML = buildInformesHtmlSoloLectura(state.informesFiltrados);
}

function buildInformesHtmlSoloLectura(arr) {
    if (!arr.length) return emptyMsg('Sin informes.');
    return arr.map(inf => {
        const fc = inf.fechaCreacion ? new Date(inf.fechaCreacion).toLocaleString('es-AR') : '—';
        const fe = inf.fechaEdicion  ? new Date(inf.fechaEdicion).toLocaleString('es-AR')  : null;
        const equipo = equipoDe(inf.usuarioCreador);
        return `
        <div class="informe-card" onclick="verInforme('${inf.firestoreId}')">
            <div class="informe-header">
                <div class="informe-asunto">${inf.asunto}</div>
            </div>
            <div class="informe-meta">
                De: ${inf.usuarioCreador || '—'}${equipo ? ` (${equipo})` : ''} · Creado: ${fc}${fe ? ` · Editado: ${fe}` : ''}
            </div>
        </div>`;
    }).join('');
}

// ══ VER INFORME (detalle, formato carta) ══
window.verInforme = (id) => {
    const inf = state.informes.find(x => x.firestoreId === id);
    if (!inf) return;
    const fc = inf.fechaCreacion ? new Date(inf.fechaCreacion).toLocaleString('es-AR') : '—';
    const fe = inf.fechaEdicion  ? new Date(inf.fechaEdicion).toLocaleString('es-AR')  : null;
    const equipo = equipoDe(inf.usuarioCreador);

    let meta = `${fc} · Por ${inf.usuarioCreador || '—'}`;
    if (equipo) meta += ` (${equipo})`;
    if (fe) meta += ` · Editado ${fe} por ${inf.usuarioEdicion || '—'}`;

    document.getElementById('modal-informe-asunto').textContent = inf.asunto;
    document.getElementById('modal-informe-meta').textContent   = meta;
    document.getElementById('modal-informe-cuerpo').innerHTML   = (inf.cuerpo || '').replace(/\n/g, '<br>');
    document.getElementById('modal-informe-overlay').style.display = 'flex';
};
window.cerrarModalInforme = () => document.getElementById('modal-informe-overlay').style.display = 'none';

// ══ BORRAR INFORME (solo el propio autor) ══
window.borrarInforme = async (id) => {
    const inf = state.informes.find(x => x.firestoreId === id);
    if (!inf || inf.usuarioCreador !== state.currentUser) return;
    if (!confirm(`¿Borrar el informe "${inf.asunto}"? Esta acción no se puede deshacer.`)) return;
    try {
        await deleteDoc(doc(db, COL_INFORMES, id));
        showToast('✓ Informe borrado');
    } catch (e) {
        showToast('Error al borrar', true);
        console.error(e);
    }
};

document.getElementById('informes-btn-filtrar')?.addEventListener('click', aplicarFiltrosInformes);
document.getElementById('informes-btn-limpiar')?.addEventListener('click', () => {
    ['informes-filtro-desde','informes-filtro-hasta'].forEach(id => document.getElementById(id).value = '');
    const sel = document.getElementById('informes-filtro-usuario');
    if (sel) sel.value = '';
    state.informesFiltrados = [...state.informes];
    renderInformesVis();
});

function aplicarFiltrosInformes() {
    const desde   = document.getElementById('informes-filtro-desde').value;
    const hasta   = document.getElementById('informes-filtro-hasta').value;
    const usuario = document.getElementById('informes-filtro-usuario')?.value || '';
    const equipo  = TEAMS[usuario] || null;

    state.informesFiltrados = state.informes.filter(inf => {
        const fecha = new Date(inf.fechaCreacion || inf.timestamp);
        if (desde && fecha < new Date(desde)) return false;
        if (hasta && fecha > new Date(hasta + 'T23:59:59')) return false;
        if (equipo) {
            if (!equipo.includes(inf.usuarioCreador)) return false;
        } else if (usuario && inf.usuarioCreador !== usuario) {
            return false;
        }
        return true;
    });
    renderInformesVis();
}

// ══ MÓDULO INFORME (compartido entre mantenimiento y supervisor) ══
// Activa una pestaña buscando el botón de navegación por su atributo data-*
function activarTab(attr, tabId) {
    document.querySelector(`[${attr}="${tabId}"]`)?.click();
}

function crearModuloInformes(prefix, tabAttr, tabId) {
    const asuntoEl = document.getElementById(`${prefix}-informe-asunto`);
    const cuerpoEl = document.getElementById(`${prefix}-informe-cuerpo`);
    const btnEl    = document.getElementById(`${prefix}-btn-informe`);
    const cancelEl = document.getElementById(`${prefix}-btn-informe-cancelar`);
    if (!asuntoEl || !cuerpoEl || !btnEl) return;

    let editId = null;

    function resetForm() {
        asuntoEl.value = '';
        cuerpoEl.value = '';
        editId = null;
        btnEl.textContent = 'REGISTRAR INFORME';
        if (cancelEl) cancelEl.style.display = 'none';
    }

    btnEl.addEventListener('click', async () => {
        const asunto = asuntoEl.value.trim();
        const cuerpo = cuerpoEl.value.trim();
        if (!asunto || !cuerpo) { showToast('Faltan datos obligatorios', true); return; }

        btnEl.disabled = true;
        btnEl.textContent = 'GUARDANDO...';

        try {
            if (editId) {
                await updateDoc(doc(db, COL_INFORMES, editId), {
                    asunto,
                    cuerpo,
                    fechaEdicion:   Date.now(),
                    usuarioEdicion: state.currentUser
                });
                showToast('✓ Informe actualizado correctamente');
            } else {
                await addDoc(collection(db, COL_INFORMES), {
                    timestamp:      Date.now(),
                    asunto,
                    cuerpo,
                    usuarioCreador: state.currentUser,
                    fechaCreacion:  Date.now(),
                    fechaEdicion:   null,
                    usuarioEdicion: null
                });
                showToast('✓ Informe registrado correctamente');
            }
            resetForm();
        } catch (e) {
            showToast('Error al guardar', true);
            console.error(e);
        } finally {
            btnEl.disabled = false;
            if (!editId) btnEl.textContent = 'REGISTRAR INFORME';
        }
    });

    if (cancelEl) {
        cancelEl.style.display = 'none';
        cancelEl.addEventListener('click', resetForm);
    }

    window[`editarInforme_${prefix}`] = (id) => {
        const inf = state.informes.find(x => x.firestoreId === id);
        if (!inf) return;
        editId = id;
        asuntoEl.value = inf.asunto || '';
        cuerpoEl.value = inf.cuerpo || '';
        btnEl.textContent = 'GUARDAR CAMBIOS';
        if (cancelEl) cancelEl.style.display = 'block';
        activarTab(tabAttr, tabId);               // salta a la pestaña donde vive el formulario
        asuntoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
}

crearModuloInformes('mtto', 'data-ctab', 'tab-informe');
crearModuloInformes('sup',  'data-stab', 'tab-sup-informe');

// ══ SIDEBAR ══
function renderSidebar() {
    renderSidebarNovedades();
    renderSidebarResumen();
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

// ══ ORDEN DE TRABAJO — MANTENIMIENTO TERCIARIZADO ══
configurarCampoOtro('ot-tecnico', 'ot-tecnico-otro');

document.getElementById('ot-sector')?.addEventListener('change', function () {
    const wrap = document.getElementById('ot-sector-otro-wrap');
    if (!wrap) return;
    wrap.style.display = this.value === 'Otros' ? 'block' : 'none';
    if (this.value !== 'Otros') document.getElementById('ot-sector-otro').value = '';
});

document.querySelectorAll('.ot-estado-btn').forEach(b => b.addEventListener('click', e => {
    document.querySelectorAll('.ot-estado-btn').forEach(x => x.classList.remove('selected'));
    e.currentTarget.classList.add('selected');
}));

document.getElementById('btn-guardar-orden')?.addEventListener('click', async () => {
    const trabajador = obtenerValorConOtro('ot-tecnico', 'ot-tecnico-otro');
    const sectorSelect = document.getElementById('ot-sector')?.value || '';
    const sectorOtro = document.getElementById('ot-sector-otro')?.value.trim() || '';
    const trabajo = document.getElementById('ot-trabajo')?.value.trim() || '';
    const estado = document.querySelector('.ot-estado-btn.selected')?.dataset.otEstado || '';
    const paroProduccion = document.querySelector('input[name="ot-paro-produccion"]:checked')?.value || 'no';
    const sector = sectorSelect === 'Otros' ? sectorOtro : sectorSelect;

    if (!trabajador || !sector || !trabajo || !estado) {
        showToast('Faltan datos obligatorios', true); return;
    }

    const btn = document.getElementById('btn-guardar-orden');
    btn.disabled = true;
    btn.textContent = 'GUARDANDO...';
    try {
        await addDoc(collection(db, COL_ORDENES), {
            timestamp: Date.now(),
            fechaCorta: new Date().toLocaleDateString('es-AR'),
            trabajadorTerciarizado: trabajador,
            sector,
            trabajo,
            paroProduccion,
            estado,
            usuarioCreador: state.currentUser
        });
        showToast('✓ Orden de trabajo registrada correctamente');
        document.getElementById('ot-tecnico').value = '';
        document.getElementById('ot-tecnico-otro').value = '';
        document.getElementById('ot-tecnico-otro').style.display = 'none';
        document.getElementById('ot-sector').value = '';
        document.getElementById('ot-sector-otro').value = '';
        document.getElementById('ot-sector-otro-wrap').style.display = 'none';
        document.getElementById('ot-trabajo').value = '';
        const otNo = document.querySelector('input[name="ot-paro-produccion"][value="no"]');
        if (otNo) otNo.checked = true;
        document.querySelectorAll('.ot-estado-btn').forEach(x => x.classList.remove('selected'));
    } catch (e) {
        showToast('Error al guardar la orden', true);
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.textContent = 'REGISTRAR ORDEN DE TRABAJO';
    }
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

// ══ SUB-NAV "PARTES MTTO" (Javier): alternar Partes / Informes ══
document.querySelectorAll('#tab-mtto-todos [data-mtsub]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#tab-mtto-todos [data-mtsub]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('#tab-mtto-todos [id$="-panel"]').forEach(p => p.style.display = 'none');
        const target = document.getElementById(btn.dataset.mtsub);
        if (target) target.style.display = 'block';
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
    const solicitante  = document.getElementById('campo-solicitante').value.trim();
    const paroProduccion = document.querySelector('input[name="paroProduccion"]:checked')?.value || 'no';

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
        if (editPartId) {
            const original = state.partes.find(x => x.firestoreId === editPartId);
            if (!puedeEditarParte(original)) {
                showToast('No podés editar este parte', true);
            } else {
                await updateDoc(doc(db, COL_PARTES, editPartId), {
                    turno: state.turnoActivo,
                    sector,
                    realizada,
                    solicitante,
                    paroProduccion,
                    estado: state.estadoActivo
                });
                showToast('✓ Parte actualizado correctamente');
            }
        } else {
            await addDoc(collection(db, COL_PARTES), {
                timestamp:   Date.now(),
                fechaCorta:  new Date().toLocaleDateString('es-AR'),
                turno:       state.turnoActivo,
                sector,
                realizada,
                solicitante,
                paroProduccion,
                estado:      state.estadoActivo,
                usuario:     state.currentUser
            });
            showToast('✓ Parte registrado correctamente');
        }
        resetFormMtto();
    } catch (e) {
        showToast('Error al guardar', true);
        console.error(e);
    } finally {
        btn.disabled = false;
        if (!editPartId) btn.textContent = 'REGISTRAR PARTE';
    }
});

// ══ RESPONSABLE / MTTO TERCIARIZADO (PRODUCCIÓN) ══
function configurarCampoOtro(selectId, inputId) {
    const select = document.getElementById(selectId);
    const input = document.getElementById(inputId);
    if (!select || !input) return;
    const actualizar = () => {
        const esOtro = select.value === 'otro';
        input.style.display = esOtro ? 'block' : 'none';
        if (!esOtro) input.value = '';
    };
    select.addEventListener('change', actualizar);
    actualizar();
}

configurarCampoOtro('sup-responsable', 'sup-responsable-otro');

function obtenerValorConOtro(selectId, inputId) {
    const select = document.getElementById(selectId);
    const input = document.getElementById(inputId);
    if (!select) return '';
    return select.value === 'otro' ? (input?.value.trim() || '') : select.value;
}

function cargarValorConOtro(selectId, inputId, valor) {
    const select = document.getElementById(selectId);
    const input = document.getElementById(inputId);
    if (!select) return;
    const opciones = [...select.options].map(o => o.value);
    if (!valor) {
        select.value = '';
        if (input) { input.value = ''; input.style.display = 'none'; }
    } else if (opciones.includes(valor)) {
        select.value = valor;
        if (input) { input.value = ''; input.style.display = 'none'; }
    } else {
        select.value = 'otro';
        if (input) { input.value = valor; input.style.display = 'block'; }
    }
}

// ══ GUARDAR NOVEDAD ══
document.getElementById('btn-guardar-novedad')?.addEventListener('click', async () => {
    const sector      = document.getElementById('sup-sector').value;
    const descripcion = document.getElementById('sup-descripcion').value.trim();
    const resp        = obtenerValorConOtro('sup-responsable', 'sup-responsable-otro');
    const resuelto    = document.querySelector('input[name="resuelto"]:checked')?.value || 'no';
    const paroProduccion = document.querySelector('input[name="sup-paro-produccion"]:checked')?.value || 'no';

    if (!sector || !descripcion || !state.supTurno || !state.supTipo) {
        showToast('Faltan datos obligatorios', true); return;
    }

    const btn = document.getElementById('btn-guardar-novedad');
    btn.disabled = true;
    btn.textContent = 'GUARDANDO...';

    try {
        if (editNovId) {
            const orig = state.novedades.find(x => x.firestoreId === editNovId);
            if (!orig || orig.usuario !== state.currentUser) {
                showToast('No podés editar esta novedad', true); return;
            }
            await updateDoc(doc(db, COL_NOVEDADES, editNovId), {
                turno:          state.supTurno,
                sector,
                tipo:           state.supTipo,
                descripcion,
                responsable:    resp,
                paroProduccion,
                resuelto,
                fechaEdicion:   Date.now(),
                usuarioEdicion: state.currentUser
            });
            showToast('✓ Novedad actualizada correctamente');
        } else {
            await addDoc(collection(db, COL_NOVEDADES), {
                timestamp:   Date.now(),
                fechaCorta:  new Date().toLocaleDateString('es-AR'),
                turno:       state.supTurno,
                sector,
                tipo:        state.supTipo,
                descripcion,
                responsable: resp,
                paroProduccion,
                resuelto,
                usuario:     state.currentUser
            });
            showToast('✓ Novedad registrada correctamente');
        }
        resetFormSup();
    } catch (e) {
        showToast('Error al guardar', true);
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.textContent = editNovId ? 'GUARDAR CAMBIOS' : 'REGISTRAR NOVEDAD';
    }
});

// ══ EDITAR NOVEDAD (producción, solo las propias) ══
let editNovId = null;

function editarNovedad(id) {
    const n = state.novedades.find(x => x.firestoreId === id);
    if (!n || n.usuario !== state.currentUser) { showToast('No podés editar esta novedad', true); return; }
    editNovId = id;

    document.getElementById('sup-sector').value      = n.sector || '';
    document.getElementById('sup-descripcion').value = n.descripcion || '';
    cargarValorConOtro('sup-responsable', 'sup-responsable-otro', n.responsable || '');
    const paroSup = document.querySelector(`input[name="sup-paro-produccion"][value="${n.paroProduccion === 'si' ? 'si' : 'no'}"]`);
    if (paroSup) paroSup.checked = true;
    const rad = document.querySelector(`input[name="resuelto"][value="${n.resuelto || 'no'}"]`);
    if (rad) rad.checked = true;

    document.querySelectorAll('.turno-btn.turno-sup').forEach(b => b.classList.toggle('selected', b.dataset.turno === n.turno));
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.toggle('selected', b.dataset.tipo === n.tipo));
    state.supTurno = n.turno || null;
    state.supTipo  = n.tipo  || null;

    document.getElementById('btn-guardar-novedad').textContent = 'GUARDAR CAMBIOS';
    document.getElementById('btn-cancelar-novedad').style.display = 'block';
    document.getElementById('edit-nov-banner').style.display = 'block';
    activarTab('data-stab', 'tab-sup-nuevo');
    document.getElementById('sup-descripcion').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
window.editarNovedad = editarNovedad;

document.getElementById('btn-cancelar-novedad')?.addEventListener('click', () => resetFormSup());

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
    document.getElementById('campo-realizada').value    = '';
    document.getElementById('campo-solicitante').value  = '';
    document.getElementById('campo-sector').value       = '';
    document.getElementById('campo-sector-otro').value  = '';
    document.getElementById('campo-sector-otro-wrap').style.display = 'none';
    document.querySelectorAll('.turno-btn:not(.turno-sup), .estado-btn')
        .forEach(b => b.classList.remove('selected'));
    const no = document.querySelector('input[name="paroProduccion"][value="no"]');
    if (no) no.checked = true;
    state.turnoActivo = null; state.estadoActivo = null;

    editPartId = null;
    const btnGuardar = document.getElementById('btn-guardar-parte');
    const btnCancelar = document.getElementById('btn-cancelar-parte');
    if (btnGuardar) btnGuardar.textContent = 'REGISTRAR PARTE';
    if (btnCancelar) btnCancelar.style.display = 'none';
}

// ══ EDITAR PARTE (solo el propio autor, y solo si no está completada) ══
let editPartId = null;

window.editarParte = (id) => {
    const p = state.partes.find(x => x.firestoreId === id);
    if (!p) return;
    if (!puedeEditarParte(p)) {
        showToast('No podés editar este parte', true);
        return;
    }

    editPartId = id;

    document.getElementById('campo-solicitante').value = p.solicitante || '';
    document.getElementById('campo-realizada').value   = p.realizada || '';

    const sectoresConocidos = Array.from(document.getElementById('campo-sector').options).map(o => o.value);
    if (sectoresConocidos.includes(p.sector)) {
        document.getElementById('campo-sector').value = p.sector;
        document.getElementById('campo-sector-otro-wrap').style.display = 'none';
    } else {
        document.getElementById('campo-sector').value = 'Otros';
        document.getElementById('campo-sector-otro-wrap').style.display = 'block';
        document.getElementById('campo-sector-otro').value = p.sector || '';
    }

    const paro = document.querySelector(`input[name="paroProduccion"][value="${p.paroProduccion === 'si' ? 'si' : 'no'}"]`);
    if (paro) paro.checked = true;

    document.querySelectorAll('.turno-btn:not(.turno-sup)').forEach(b => {
        b.classList.toggle('selected', b.dataset.turno === p.turno);
    });
    state.turnoActivo = p.turno || null;

    const estadoNorm = p.estado === 'en-progreso' ? 'en-proceso' : p.estado;
    document.querySelectorAll('.estado-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.estado === estadoNorm);
    });
    state.estadoActivo = estadoNorm || null;

    const btnGuardar = document.getElementById('btn-guardar-parte');
    const btnCancelar = document.getElementById('btn-cancelar-parte');
    if (btnGuardar) btnGuardar.textContent = 'GUARDAR CAMBIOS';
    if (btnCancelar) btnCancelar.style.display = 'block';

    activarTab('data-ctab', 'tab-nuevo');
    document.getElementById('campo-realizada').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

document.getElementById('btn-cancelar-parte')?.addEventListener('click', resetFormMtto);

function resetFormSup() {
    document.getElementById('sup-descripcion').value = '';
    cargarValorConOtro('sup-responsable', 'sup-responsable-otro', '');
    const paroSupNo = document.querySelector('input[name="sup-paro-produccion"][value="no"]');
    if (paroSupNo) paroSupNo.checked = true;
    document.getElementById('sup-sector').value      = '';
    document.querySelectorAll('.turno-btn.turno-sup, .tipo-btn')
        .forEach(b => b.classList.remove('selected'));
    const no = document.querySelector('input[name="resuelto"][value="no"]');
    if (no) no.checked = true;
    state.supTurno = null; state.supTipo = null;
    editNovId = null;
    const bg = document.getElementById('btn-guardar-novedad');
    if (bg) bg.textContent = 'REGISTRAR NOVEDAD';
    const bc = document.getElementById('btn-cancelar-novedad');
    if (bc) bc.style.display = 'none';
    const bn = document.getElementById('edit-nov-banner');
    if (bn) bn.style.display = 'none';
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
    document.getElementById('modal-responsable').textContent = p.solicitante || '—';
    document.getElementById('modal-solicitada').textContent  = p.paroProduccion === 'si' ? 'Sí' : 'No';
    document.getElementById('modal-turno').textContent       = (p.turno || '').toUpperCase();
    document.getElementById('modal-estado').textContent      = estadoLabels[p.estado] || (p.estado||'').toUpperCase();

    // Puede editar el propio autor, o los usuarios con permiso ampliado
    // (mtto, Javier, admin), siempre que la tarea no esté completada.
    const btnEditar = document.getElementById('modal-btn-editar-parte');
    const editWrap  = document.getElementById('modal-edit-wrap');
    if (editWrap) editWrap.style.display = 'none';
    const puedeEditar = puedeEditarParte(p);
    if (btnEditar) {
        btnEditar.style.display = puedeEditar ? 'block' : 'none';
        btnEditar.onclick = () => {
            if (state.role === 'mantenimiento') {
                // El usuario tiene su propia pantalla de carga: reutilizamos ese formulario.
                cerrarModal();
                editarParte(id);
            } else {
                // Usuarios sin pantalla de carga (ej. admin): edición dentro del mismo modal.
                abrirEdicionEnModal(id);
            }
        };
    }

    document.getElementById('modal-overlay').style.display   = 'flex';
};
window.cerrarModal = () => document.getElementById('modal-overlay').style.display = 'none';

// ══ EDICIÓN DE PARTE DESDE EL MODAL (usuarios sin pantalla de carga propia) ══
function abrirEdicionEnModal(id) {
    const p = state.partes.find(x => x.firestoreId === id);
    if (!p || !puedeEditarParte(p)) {
        showToast('No podés editar este parte', true);
        return;
    }

    document.getElementById('modal-edit-realizada').value   = p.realizada || '';
    document.getElementById('modal-edit-responsable').value = p.solicitante || '';
    const paro = document.querySelector(`input[name="modal-edit-paro"][value="${p.paroProduccion === 'si' ? 'si' : 'no'}"]`);
    if (paro) paro.checked = true;
    document.getElementById('modal-edit-turno').value  = p.turno || 'mañana';
    document.getElementById('modal-edit-estado').value = p.estado === 'en-progreso' ? 'en-proceso' : (p.estado || 'pendiente');

    document.getElementById('modal-btn-editar-parte').style.display = 'none';
    document.getElementById('modal-edit-wrap').style.display = 'block';

    const btnGuardar  = document.getElementById('modal-edit-guardar');
    const btnCancelar = document.getElementById('modal-edit-cancelar');

    btnCancelar.onclick = () => cerrarModal();

    btnGuardar.onclick = async () => {
        const realizada   = document.getElementById('modal-edit-realizada').value.trim();
        const solicitante = document.getElementById('modal-edit-responsable').value.trim();
        const paroSel     = document.querySelector('input[name="modal-edit-paro"]:checked')?.value || 'no';
        const turno       = document.getElementById('modal-edit-turno').value;
        const estado      = document.getElementById('modal-edit-estado').value;

        if (!realizada) { showToast('Faltan datos obligatorios', true); return; }

        const original = state.partes.find(x => x.firestoreId === id);
        if (!puedeEditarParte(original)) {
            showToast('No podés editar este parte', true);
            return;
        }

        btnGuardar.disabled = true;
        btnGuardar.textContent = 'GUARDANDO...';
        try {
            await updateDoc(doc(db, COL_PARTES, id), {
                turno, realizada, solicitante, paroProduccion: paroSel, estado
            });
            showToast('✓ Parte actualizado correctamente');
            cerrarModal();
        } catch (e) {
            showToast('Error al guardar', true);
            console.error(e);
        } finally {
            btnGuardar.disabled = false;
            btnGuardar.textContent = 'GUARDAR CAMBIOS';
        }
    };
}

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
    document.getElementById('modal-nov-paro-produccion').textContent = n.paroProduccion === 'si' ? 'Sí' : 'No';
    document.getElementById('modal-nov-resuelto').textContent = (resueltoLabel[n.resuelto] || n.resuelto)
        + (n.usuarioActualizacion ? ` — actualizado por ${n.usuarioActualizacion}${n.fechaActualizacion ? ' · ' + new Date(n.fechaActualizacion).toLocaleString('es-AR') : ''}` : '');
    document.getElementById('modal-nov-turno').textContent    = (n.turno || '').toUpperCase();
    const tipoBadge = document.getElementById('modal-nov-tipo');
    tipoBadge.textContent = tipoLabel[n.tipo] || n.tipo;
    tipoBadge.className   = `modal-badge modal-badge-tipo ${n.tipo}`;

    state.novedadAbierta = id;
    renderComentariosNovedad(n);

    // Producción puede editar sus propias novedades
    const btnEdNov = document.getElementById('modal-nov-btn-editar');
    if (btnEdNov) {
        const puede = state.role === 'supervisor' && n.usuario === state.currentUser;
        btnEdNov.style.display = puede ? 'block' : 'none';
        btnEdNov.onclick = () => { cerrarModalNov(); editarNovedad(id); };
    }

    // Mantenimiento y visualizador pueden comentar y actualizar el estado
    const panelMtto = document.getElementById('modal-nov-mtto');
    if (panelMtto) {
        panelMtto.style.display = puedeGestionarNovedad() ? 'block' : 'none';
        document.getElementById('modal-nov-estado').value = n.resuelto || 'no';
        document.getElementById('modal-nov-comentario').value = '';
    }
    document.getElementById('modal-nov-overlay').style.display = 'flex';
};
window.cerrarModalNov = () => {
    state.novedadAbierta = null;
    document.getElementById('modal-nov-overlay').style.display = 'none';
};

function renderComentariosNovedad(n) {
    const el = document.getElementById('modal-nov-comentarios');
    if (!el) return;
    const coms = n.comentarios || [];
    if (!coms.length) { el.innerHTML = '<div class="nov-com-vacio">Sin comentarios.</div>'; return; }
    const esc = t => String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    el.innerHTML = coms.map(c => `
        <div class="nov-com">
            <div class="nov-com-meta">${esc(c.usuario)} · ${c.fecha ? new Date(c.fecha).toLocaleString('es-AR') : '—'}</div>
            <div class="nov-com-texto">${esc(c.texto).replace(/\n/g, '<br>')}</div>
        </div>`).join('');
}

// Si el modal de la novedad está abierto y llegan cambios, se re-dibuja con los datos nuevos
function refrescarModalNovedad() {
    if (!state.novedadAbierta) return;
    const n = state.novedades.find(x => x.firestoreId === state.novedadAbierta);
    if (!n) return;
    const resueltoLabel = { si: 'Sí, se resolvió', no: 'No se resolvió', 'en-curso': 'Se inició pero no se terminó' };
    document.getElementById('modal-nov-resuelto').textContent = (resueltoLabel[n.resuelto] || n.resuelto)
        + (n.usuarioActualizacion ? ` — actualizado por ${n.usuarioActualizacion}${n.fechaActualizacion ? ' · ' + new Date(n.fechaActualizacion).toLocaleString('es-AR') : ''}` : '');
    renderComentariosNovedad(n);
}

// Mismo permiso que mantenimiento para comentar y actualizar el estado de una novedad
function puedeGestionarNovedad() {
    return state.role === 'mantenimiento' || state.role === 'visualizador';
}

// ══ MANTENIMIENTO / VISUALIZADOR: comentar / actualizar estado de una novedad de producción ══
document.getElementById('modal-nov-guardar')?.addEventListener('click', async () => {
    if (!puedeGestionarNovedad() || !state.novedadAbierta) return;
    const n = state.novedades.find(x => x.firestoreId === state.novedadAbierta);
    if (!n) return;

    const nuevoEstado = document.getElementById('modal-nov-estado').value;
    const texto = document.getElementById('modal-nov-comentario').value.trim();
    const cambioEstado = nuevoEstado !== n.resuelto;

    if (!cambioEstado && !texto) { showToast('No hay nada para guardar', true); return; }

    const btn = document.getElementById('modal-nov-guardar');
    btn.disabled = true;
    btn.textContent = 'GUARDANDO...';
    try {
        const cambios = {};
        if (cambioEstado) {
            cambios.resuelto = nuevoEstado;
            cambios.fechaActualizacion = Date.now();
            cambios.usuarioActualizacion = state.currentUser;
        }
        if (texto) {
            cambios.comentarios = arrayUnion({ usuario: state.currentUser, texto, fecha: Date.now() });
        }
        await updateDoc(doc(db, COL_NOVEDADES, state.novedadAbierta), cambios);
        document.getElementById('modal-nov-comentario').value = '';
        showToast('✓ Novedad actualizada');
    } catch (e) {
        showToast('Error al guardar', true);
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.textContent = 'GUARDAR';
    }
});

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

// Lista detallada "POR SECTOR" (con barras y conteo), movida a ESTADÍSTICAS, al final.
function renderStatsSectoresList() {
    const el = document.getElementById('stats-sectores-list');
    if (!el) return;
    // Por sector: partes de mantenimiento + novedades de producción (con el estado que les dejó mantenimiento)
    const map = {};
    const get = s => map[s] || (map[s] = { partes: 0, nov: 0, si: 0, curso: 0, no: 0, atendidas: 0 });
    state.partesFiltrados.forEach(p => { get(p.sector).partes++; });
    state.novedades.forEach(n => {
        const s = get(n.sector);
        s.nov++;
        if (n.resuelto === 'si') s.si++;
        else if (n.resuelto === 'en-curso') s.curso++;
        else s.no++;
        if (n.usuarioActualizacion) s.atendidas++; // estado actualizado por mantenimiento
    });
    const entries = Object.entries(map).sort((a, b) => (b[1].partes + b[1].nov) - (a[1].partes + a[1].nov));
    const max = entries[0] ? (entries[0][1].partes + entries[0][1].nov) || 1 : 1;
    const colorClasses = ['', 'amb', 'grn', 'blu'];
    if (!entries.length) { el.innerHTML = emptyMsg('Sin datos.'); return; }
    el.innerHTML = entries.map(([sector, s], i) => {
        const total = s.partes + s.nov;
        return `
        <div class="sb-bar-row sector-det">
            <div class="sb-bar-label"><span>${sector}</span><span>${total}</span></div>
            <div class="sb-bar-track">
                <div class="sb-bar-fill ${colorClasses[i % colorClasses.length]}" style="width:${Math.round((total/max)*100)}%"></div>
            </div>
            <div class="sector-det-chips">
                <span class="sdc">${s.partes} partes</span>
                ${s.nov ? `
                <span class="sdc">${s.nov} novedades</span>
                <span class="novedad-resuelto si">${s.si} RESUELTAS</span>
                <span class="novedad-resuelto en-curso">${s.curso} SE INICIÓ</span>
                <span class="novedad-resuelto no">${s.no} PENDIENTES</span>
                ${s.atendidas ? `<span class="sdc sdc-mtto">${s.atendidas} atendidas por MTTO</span>` : ''}` : ''}
            </div>
        </div>`;
    }).join('');
}


function renderCharts() {
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
    renderStatsSectoresList();
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
        // Apilado por estado (el estado lo actualiza mantenimiento)
        const sectores = [...new Set(state.novedades.map(n => n.sector))];
        const cuenta = (sec, est) => state.novedades.filter(n => n.sector === sec &&
            (est === 'si' ? n.resuelto === 'si' : est === 'en-curso' ? n.resuelto === 'en-curso' : (n.resuelto !== 'si' && n.resuelto !== 'en-curso'))).length;
        const ds = (label, est, bg, bd) => ({ label, data: sectores.map(s => cuenta(s, est)), backgroundColor: bg, borderColor: bd, borderWidth: 1, borderRadius: 2 });
        charts.novSectores = new Chart(cNovSec, {
            type: 'bar',
            data: { labels: sectores, datasets: [
                ds('Resuelto',   'si',       '#2d4a2e', '#63b167'),
                ds('Se inició',  'en-curso', '#5c4a14', '#f5b324'),
                ds('Pendiente',  'no',       '#66261d', '#ff6b57')
            ] },
            options: { plugins:{legend:legendStyle}, scales:{ x:{stacked:true,ticks:tickStyle,grid:{color:gridColor}}, y:{stacked:true,ticks:{...tickStyle,stepSize:1},grid:{color:gridColor},beginAtZero:true} } }
        });
    }
}
