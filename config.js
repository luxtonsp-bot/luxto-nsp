// config.js — Cargador de configuración centralizado
// Carga config.local.js (valores reales) si existe, sino usa config.template.js (placeholders)
// Incluye este script ANTES de cualquier otro script en tus HTMLs

(function() {
  // Intentar cargar config.local.js primero (valores reales, no en repo)
  const localScript = document.createElement('script');
  localScript.src = 'config.local.js';
  localScript.onload = function() {
    // config.local.js define window.LUXTO_CONFIG
    console.log('[config] Cargado config.local.js');
    window.dispatchEvent(new Event('luxto-config-ready'));
  };
  localScript.onerror = function() {
    // Fallback: config.template.js (placeholders, sí en repo)
    console.warn('[config] config.local.js no encontrado, cargando template (placeholders)');
    const templateScript = document.createElement('script');
    templateScript.src = 'config.template.js';
    templateScript.onload = function() {
      window.dispatchEvent(new Event('luxto-config-ready'));
    };
    document.head.appendChild(templateScript);
  };
  document.head.appendChild(localScript);
})();
