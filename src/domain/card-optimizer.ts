/**
 * ========================================================
 * Motor de Optimización y Recomendación de Tarjetas
 * "El Hack de Lukas"
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Tarjeta, RecomendacionTarjeta } from './types';
import { calcularCicloParaCompra } from './cycle-calculator';

export interface EvaluacionOpcionTarjeta {
  readonly tarjeta: Tarjeta;
  readonly recomendacion: RecomendacionTarjeta;
  readonly calificacion: number; // Score numérico para ordenar
}

/**
 * Evalúa todas las tarjetas activas de un usuario y recomienda la mejor opción
 * para maximizar los días de gracia libre de intereses a 1 cuota.
 */
export function optimizarMejorTarjeta(
  tarjetas: readonly Tarjeta[],
  montoCompra: number,
  fechaCompra: Date = new Date(),
): readonly RecomendacionTarjeta[] {
  // Filtrar tarjetas que aceptan compras y están activas
  const tarjetasCandidatas = tarjetas.filter((t) => t.activa && t.aceptaCompras);

  if (tarjetasCandidatas.length === 0) {
    return [];
  }

  const evaluaciones: EvaluacionOpcionTarjeta[] = tarjetasCandidatas.map((tarjeta) => {
    const ciclo = calcularCicloParaCompra(fechaCompra, tarjeta.diaCorte, tarjeta.diaPago);
    const cupoActual = tarjeta.cupoDisponible ?? tarjeta.cupo ?? 0;
    const cupoDisponibleDespues = cupoActual - montoCompra;
    const cumpleMonto = cupoDisponibleDespues >= 0;

    // Verificar si tiene cuota de manejo pendiente de exonerar
    const requiereAtencionCuotaManejo =
      tarjeta.tieneCuotaManejo &&
      tarjeta.tipoExoneracion !== 'ninguna' &&
      tarjeta.tipoExoneracion !== 'siempre_exenta';

    // Generar mensaje estratégico
    let mensajeEstrategico = '';
    if (tarjeta.cobraInteresUnaCuota) {
      mensajeEstrategico = '⚠️ Esta tarjeta cobra intereses desde el día 1 incluso a 1 cuota.';
    } else if (ciclo.esVentanaOptima) {
      mensajeEstrategico = `🔥 ¡Ventana dorada! Tu corte fue hace ${ciclo.diasDesdeCorte} día(s). Ganas ${ciclo.diasHastaPago} días de crédito gratis.`;
    } else {
      mensajeEstrategico = `Corte próximo en ${tarjeta.diaCorte - fechaCompra.getDate()} días. Tendrás ${ciclo.diasHastaPago} días para pagar.`;
    }

    if (requiereAtencionCuotaManejo && montoCompra <= 50000) {
      mensajeEstrategico += ` 💡 Ideal para compra pequeña y avanzar en la exoneración de cuota de manejo ($${tarjeta.valorCuotaManejo.toLocaleString('es-CO')}).`;
    }

    if (tarjeta.tasaInteresEa) {
      mensajeEstrategico += ` 📈 Tasa: ${tarjeta.tasaInteresEa}% E.A.`;
    }

    // Calcular Score para ordenar:
    // Prioridad 1: Que no cobre intereses a 1 cuota (penalización severa si cobra)
    // Prioridad 2: Que tenga cupo suficiente
    // Prioridad 3: Mayor cantidad de días hasta el pago (gracia)
    // Prioridad 4: Menor tasa de interés (ahorro si difiere a cuotas)
    // Prioridad 5: Mayor cupo disponible restante
    let score = ciclo.diasHastaPago * 100;

    if (!cumpleMonto) {
      score -= 100000; // Penalización por falta de cupo
    }
    if (tarjeta.cobraInteresUnaCuota) {
      score -= 500000; // Gran penalización
    }
    if (tarjeta.tasaInteresEa) {
      // Bonus por menor tasa de interés (ej: 25% E.A. vs 35% E.A. suma hasta 15 puntos)
      score += Math.max(0, 40 - tarjeta.tasaInteresEa);
    }
    score += Math.min(cupoDisponibleDespues / 100000, 50);

    const recomendacion: RecomendacionTarjeta = {
      tarjeta,
      diasHastaPago: ciclo.diasHastaPago,
      fechaPago: ciclo.fechaPagoCiclo,
      fechaCorte: ciclo.fechaCorteCiclo,
      cupoDisponibleDespues,
      cumpleMonto,
      requiereAtencionCuotaManejo,
      tasaInteresEa: tarjeta.tasaInteresEa,
      mensajeEstrategico,
    };

    return {
      tarjeta,
      recomendacion,
      calificacion: score,
    };
  });

  // Ordenar de mayor a menor según la calificación
  evaluaciones.sort((a, b) => b.calificacion - a.calificacion);

  return evaluaciones.map((e) => e.recomendacion);
}
