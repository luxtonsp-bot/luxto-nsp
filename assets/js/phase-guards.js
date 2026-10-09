/**
 * phase-guards.js
 * Helpers puros para validar el estado de la sesión sin depender de Firebase.
 */

export function isStateAllowedForAction(currentPhase, allowedPhases) {
  if (!Array.isArray(allowedPhases)) return false;
  return allowedPhases.includes(currentPhase);
}
