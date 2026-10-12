/**
 * phase-guards.js
 * Helpers puros para validar el estado de la sesión sin depender de Firebase.
 */

export function isStateAllowedForAction(currentPhase, allowedPhases) {
  if (!Array.isArray(allowedPhases)) return false;
  return allowedPhases.includes(currentPhase);
}

export function getSessionCleanupPaths() {
  return [
    'asamblea/preguntaActual',
    'asamblea/respuestas',
    'asamblea/conectados',
    'asamblea/sesion/puntos',
    'asamblea/sesion/resumen',
    'asamblea/sesion/cerradas',
    'asamblea/sesion/hostUid',
    'asamblea/sesion/acumulada',
    'asamblea/sesion/sesionId',
    'asamblea/sesion/indice',
    'asamblea/sesion/cola'
  ];
}
