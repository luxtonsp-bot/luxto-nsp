// Módulo compartido de permisos por rol — usa uid_map + memberId permanente
// Roles con permisos de STAFF (servidores, coordinador, apoyos)
const STAFF_ROLES = ['servidor', 'coordinador', 'apoyo'];

// Páginas que requieren permisos de STAFF
const STAFF_PAGES = [
    'tomar-asistencia.html',
    'gestion-grupo.html',
    'tablas.html',
    'historial.html',
    'planificacion.html'
];

// Verificar si la página actual requiere permisos de staff
function isStaffPage() {
    const currentPage = window.location.pathname.split('/').pop();
    return STAFF_PAGES.includes(currentPage);
}

// Obtener memberId del usuario autenticado vía uid_map
async function getMemberIdFromAuth(uid) {
    if (!uid) return null;
    try {
        const uidMapRef = db.collection('uid_map').doc(uid);
        const snap = await uidMapRef.get();
        if (!snap.exists) return null;
        return snap.data().memberId;
    } catch (error) {
        console.error("Error getting memberId from uid_map:", error);
        return null;
    }
}

// Obtener rol del usuario actual desde members/{memberId}
async function getCurrentUserRole(uid) {
    const memberId = await getMemberIdFromAuth(uid);
    if (!memberId) return null;
    try {
        const memberRef = db.collection('members').doc(memberId);
        const snap = await memberRef.get();
        if (!snap.exists) return null;
        const data = snap.data();
        return (data.rol || data.role || '').toLowerCase();
    } catch (error) {
        console.error("Error getting user role:", error);
        return null;
    }
}

// Verificar si el usuario tiene permisos de staff
async function checkStaffPermission(uid) {
    const role = await getCurrentUserRole(uid);
    return role && STAFF_ROLES.includes(role);
}

// Obtener datos completos del miembro (para dashboards, etc.)
async function getMemberData(uid) {
    const memberId = await getMemberIdFromAuth(uid);
    if (!memberId) return null;
    try {
        const snap = await db.collection('members').doc(memberId).get();
        return snap.exists ? { memberId, ...snap.data() } : null;
    } catch (error) {
        console.error("Error getting member data:", error);
        return null;
    }
}

// Mostrar página de acceso denegado
function showAccessDenied(message = 'No tienes permisos para acceder a esta página') {
    document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; text-align:center; padding:24px;">
            <div style="font-size:48px; margin-bottom:16px;">🚫</div>
            <h2 style="color:var(--ink); margin-bottom:12px;">Acceso denegado</h2>
            <p style="color:var(--muted); max-width:400px; margin-bottom:24px;">${message}</p>
            <a href="dashboard.html" style="display:inline-block; margin-top:16px; padding:12px 24px; background:var(--grad); color:white; border-radius:100px; font-weight:700; text-decoration:none;">Volver al Dashboard</a>
        </div>
    `;
}

// Inicializar verificación de permisos (llamar en cada página que lo requiera)
async function initStaffPermissionCheck() {
    return new Promise((resolve) => {
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'login.html';
                return;
            }

            if (isStaffPage()) {
                const hasPermission = await checkStaffPermission(user.uid);
                if (!hasPermission) {
                    showAccessDenied('Solo servidores, coordinador y apoyos pueden acceder a esta sección.');
                    return;
                }
            }

            // Usuario autenticado y con permisos (o página que no requiere staff)
            resolve(user);
        });
    });
}

// Exportar para uso en módulos
window.AuthPermissions = {
    STAFF_ROLES,
    STAFF_PAGES,
    isStaffPage,
    getCurrentUserRole,
    checkStaffPermission,
    getMemberData,
    getMemberIdFromAuth,
    showAccessDenied,
    initStaffPermissionCheck
};