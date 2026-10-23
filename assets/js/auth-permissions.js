// Módulo compartido de permisos por rol — usa uid_map + memberId permanente
// Usa Firebase COMPAT SDK global (window.firebase)
// Roles: coordinador | servidor | apoyo | miembro

const STAFF_ROLES = ['coordinador', 'servidor', 'apoyo'];

// Páginas que requieren ser STAFF (coordinador/servidor/apoyo)
const STAFF_PAGES = [
    'tomar-asistencia.html',
    'gestion-grupo.html',
    'tablas.html',
    'historial.html',
    'planificacion.html'
];

// Solo admin.html requiere COORDINADOR
const COORDINATOR_ONLY_PAGES = ['admin.html'];

function getFirebase() {
    if (!window.firebase || !window.firebase.apps.length) {
        throw new Error('Firebase compat SDK no inicializado');
    }
    return window.firebase;
}

function getDb() { return getFirebase().firestore(); }
function getAuth() { return getFirebase().auth(); }

function isStaffPage() {
    const currentPage = window.location.pathname.split('/').pop();
    return STAFF_PAGES.includes(currentPage);
}

function isCoordinatorOnlyPage() {
    const currentPage = window.location.pathname.split('/').pop();
    return COORDINATOR_ONLY_PAGES.includes(currentPage);
}

async function getMemberIdFromAuth(uid) {
    if (!uid) return null;
    try {
        const db = getDb();
        const snap = await db.collection('uid_map').doc(uid).get();
        return snap.exists ? snap.data().memberId : null;
    } catch { return null; }
}

async function getUserRole(uid) {
    const memberId = await getMemberIdFromAuth(uid);
    if (!memberId) return null;
    try {
        const db = getDb();
        const snap = await db.collection('members').doc(memberId).get();
        return snap.exists ? (snap.data().rol || snap.data().role || '').toLowerCase() : null;
    } catch { return null; }
}

async function checkPermission(uid) {
    const role = await getUserRole(uid);
    if (!role) return false;

    const currentPage = window.location.pathname.split('/').pop();

    // Coordinador: acceso a TODO
    if (role === 'coordinador') return true;

    // Servidor/Apoyo: acceso a STAFF_PAGES, NO a admin.html
    if (['servidor', 'apoyo'].includes(role)) {
        if (COORDINATOR_ONLY_PAGES.includes(currentPage)) return false;
        return STAFF_PAGES.includes(currentPage) || !isStaffPage() && !isCoordinatorOnlyPage();
    }

    // Miembro: solo páginas públicas (no staff, no coordinator-only)
    return !isStaffPage() && !isCoordinatorOnlyPage();
}

function showAccessDenied(message = 'No tienes permisos para acceder a esta sección') {
    document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; text-align:center; padding:24px;">
            <div style="font-size:48px; margin-bottom:16px;">🚫</div>
            <h2 style="color:var(--ink); margin-bottom:12px;">Acceso denegado</h2>
            <p style="color:var(--muted); max-width:400px; margin-bottom:24px;">${message}</p>
            <a href="dashboard.html" style="display:inline-block; margin-top:16px; padding:12px 24px; background:var(--grad); color:white; border-radius:100px; font-weight:700; text-decoration:none;">Volver al Dashboard</a>
        </div>
    `;
}

async function initStaffPermissionCheck() {
    return new Promise((resolve) => {
        const auth = getFirebase().auth();
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'login.html';
                return;
            }

            const hasPermission = await checkPermission(user.uid);
            if (!hasPermission) {
                const role = await getUserRole(user.uid);
                const currentPage = window.location.pathname.split('/').pop();
                let msg = 'No tienes permisos para acceder a esta sección.';
                if (currentPage === 'admin.html' && role !== 'coordinador') {
                    msg = 'Solo el coordinador puede acceder al Panel de Administración.';
                }
                showAccessDenied(msg);
                return;
            }

            resolve(user);
        });
    });
}

window.AuthPermissions = {
    initStaffPermissionCheck,
    getUserRole,
    checkPermission
};