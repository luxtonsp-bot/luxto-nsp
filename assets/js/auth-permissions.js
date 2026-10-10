// Módulo compartido de permisos por rol
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

// Obtener rol del usuario actual desde members collection
async function getCurrentUserRole(email) {
    if (!email) return null;
    try {
        const snapshot = await db.collection('members')
            .where('email', '==', email.toLowerCase())
            .limit(1)
            .get();
        if (snapshot.empty) return null;
        const memberData = snapshot.docs[0].data();
        return (memberData.rol || memberData.role || '').toLowerCase();
    } catch (error) {
        console.error("Error getting user role:", error);
        return null;
    }
}

// Verificar si el usuario tiene permisos de staff
async function checkStaffPermission(email) {
    const role = await getCurrentUserRole(email);
    return role && STAFF_ROLES.includes(role);
}

// Mostrar página de acceso denegado
function showAccessDenied(message = 'No tienes permisos para acceder a esta página') {
    document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; text-align:center; padding:24px;">
            <div style="font-size:48px; margin-bottom:16px;">🚫</div>
            <h2 style="color:var(--cream); margin-bottom:12px;">Acceso denegado</h2>
            <p style="color:var(--muted); max-width:400px; margin-bottom:24px;">${message}</p>
            <a href="dashboard.html" class="btn btn-primary">Volver al Dashboard</a>
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
                const hasPermission = await checkStaffPermission(user.email);
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
    showAccessDenied,
    initStaffPermissionCheck
};