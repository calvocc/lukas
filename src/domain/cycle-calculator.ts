/**
 * ========================================================
 * Motor Matemático de Ciclos de Facturación y Gracia
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { InfoCicloCalculado } from './types';

/**
 * Ajusta un día de mes para que sea válido en un año y mes específicos.
 * Por ejemplo: día 31 en noviembre se convierte en 30 de noviembre;
 * día 30 en febrero se convierte en 28 o 29 según sea bisiesto.
 */
export function obtenerFechaValidaEnMes(anio: number, mesIndex: number, diaDeseado: number): Date {
  // Último día del mes (pasando día 0 del mes siguiente)
  const ultimoDiaMes = new Date(anio, mesIndex + 1, 0).getDate();
  const diaReal = Math.min(Math.max(1, diaDeseado), ultimoDiaMes);
  return new Date(anio, mesIndex, diaReal, 23, 59, 59, 999);
}

/**
 * Calcula las fechas de corte y de pago correspondientes a una compra realizada en una fecha dada.
 *
 * El "Hack" financiero a 1 cuota:
 * 1. Si la compra se hace en o antes del día de corte del mes en curso:
 *    - La compra entra en el extracto del mes en curso.
 *    - Se paga en la fecha límite de pago asociada a este corte (~15-20 días).
 * 2. Si la compra se hace después del día de corte del mes en curso:
 *    - La compra entra en el extracto del mes siguiente.
 *    - Se paga en la fecha límite de pago del mes subsiguiente (~45-55 días de financiamiento gratis al 0%).
 */
export function calcularCicloParaCompra(
  fechaCompra: Date,
  diaCorte: number,
  diaPago: number,
): InfoCicloCalculado {
  const anio = fechaCompra.getFullYear();
  const mesIndex = fechaCompra.getMonth();

  // Fecha de corte del mes actual
  const corteMesActual = obtenerFechaValidaEnMes(anio, mesIndex, diaCorte);

  let fechaCorteCiclo: Date;
  let esVentanaOptima = false;
  let fechaPagoCiclo: Date;

  if (fechaCompra.getTime() <= corteMesActual.getTime()) {
    // Caso 1: La compra entra en el corte de este mes
    fechaCorteCiclo = corteMesActual;

    // La fecha de pago es el día de pago del mes actual si diaPago > diaCorte,
    // o del mes siguiente si diaPago <= diaCorte (ej: corte 28, paga el 15 del siguiente mes)
    if (diaPago > diaCorte) {
      fechaPagoCiclo = obtenerFechaValidaEnMes(anio, mesIndex, diaPago);
    } else {
      fechaPagoCiclo = obtenerFechaValidaEnMes(anio, mesIndex + 1, diaPago);
    }
  } else {
    // Caso 2: ¡La compra se hace post-corte! Entra en el corte del mes siguiente
    esVentanaOptima = true;
    fechaCorteCiclo = obtenerFechaValidaEnMes(anio, mesIndex + 1, diaCorte);

    // La fecha de pago es en el mes siguiente (si diaPago > diaCorte) o dos meses adelante (si diaPago <= diaCorte)
    if (diaPago > diaCorte) {
      fechaPagoCiclo = obtenerFechaValidaEnMes(anio, mesIndex + 1, diaPago);
    } else {
      fechaPagoCiclo = obtenerFechaValidaEnMes(anio, mesIndex + 2, diaPago);
    }
  }

  // Días restantes hasta el pago
  const diffTiempo = fechaPagoCiclo.getTime() - fechaCompra.getTime();
  const diasHastaPago = Math.max(0, Math.ceil(diffTiempo / (1000 * 60 * 60 * 24)));

  // Días transcurridos desde el último corte
  let ultimoCorte: Date;
  if (fechaCompra.getTime() > corteMesActual.getTime()) {
    ultimoCorte = corteMesActual;
  } else {
    ultimoCorte = obtenerFechaValidaEnMes(anio, mesIndex - 1, diaCorte);
  }
  const diffDesdeCorte = fechaCompra.getTime() - ultimoCorte.getTime();
  const diasDesdeCorte = Math.max(0, Math.floor(diffDesdeCorte / (1000 * 60 * 60 * 24)));

  return {
    fechaCorteCiclo,
    fechaPagoCiclo,
    diasHastaPago,
    esVentanaOptima,
    diasDesdeCorte,
  };
}
