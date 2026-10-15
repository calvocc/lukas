/**
 * ========================================================
 * Formateador de Moneda y Textos en Español Colombiano
 * Especificación: valores en formato `$39.000`
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Formatea un número en formato de pesos colombianos con punto de miles.
 * Ejemplo: 39000 -> "$39.000" | 1850000 -> "$1.850.000"
 */
export function formatearMoneda(monto: number): string {
  const enteroRedondeado = Math.round(monto);
  const partes = enteroRedondeado.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${partes}`;
}

/**
 * Formatea una fecha en formato corto colombiano.
 * Ejemplo: new Date('2026-10-25') -> "25 de oct"
 */
export function formatearFechaCorta(fecha: Date): string {
  const dia = fecha.getDate();
  const mes = MESES_CORTOS[fecha.getMonth()] ?? '';
  return `${dia} de ${mes}`;
}

/**
 * Formatea una fecha en formato largo.
 * Ejemplo: new Date('2026-10-25') -> "25 de octubre de 2026"
 */
export function formatearFechaLarga(fecha: Date): string {
  const dia = fecha.getDate();
  const mes = MESES_LARGOS[fecha.getMonth()] ?? '';
  const anio = fecha.getFullYear();
  return `${dia} de ${mes} de ${anio}`;
}

/**
 * Formatea porcentaje sin decimales superfluos.
 */
export function formatearPorcentaje(valor: number): string {
  return `${Math.round(valor)}%`;
}
