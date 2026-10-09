/**
 * esc.js — Utilidad de escape HTML para prevenir XSS
 * Sin dependencias externas, exporta una única función.
 */

/**
 * Escapa caracteres especiales HTML para uso seguro en innerHTML y atributos.
 * @param {string|number|null|undefined} str - Valor a escapar
 * @returns {string} String con &, <, >, ", ' reemplazados por entidades HTML
 */
export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}