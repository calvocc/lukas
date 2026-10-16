/**
 * ========================================================
 * Servicio de Voz (Lukas habla)
 * Respuestas cercanas en español colombiano y formato `$39.000`
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable } from '@nestjs/common';
import { formatearMoneda, formatearFechaCorta, formatearFechaLarga, formatearPorcentaje } from './formateador';
import { RecomendacionTarjeta, Transaccion, Tarjeta, Obligacion, Cuenta } from '../domain/types';

@Injectable()
export class RespuestasService {
  mensajeCuentaGuardada(cuenta: Cuenta): string {
    const icono =
      cuenta.tipo === 'efectivo'
        ? '💵'
        : cuenta.tipo === 'billetera'
          ? '📱'
          : '🏦';

    const tipoLabel =
      cuenta.tipo === 'debito'
        ? 'Tarjeta Débito'
        : cuenta.tipo === 'ahorros'
          ? 'Cuenta de Ahorros'
          : cuenta.tipo === 'corriente'
            ? 'Cuenta Corriente'
            : cuenta.tipo === 'billetera'
              ? 'Billetera Digital'
              : 'Dinero en Efectivo';

    return `${icono} *¡Cuenta registrada con éxito!*

• Nombre: *${cuenta.nombre}*
• Tipo: *${tipoLabel}*${cuenta.banco ? ` (${cuenta.banco})` : ''}
• 💰 Saldo disponible inicial: *${formatearMoneda(cuenta.saldo)}*

💡 *¿Cómo funciona?*
• Cada compra con débito o retiro en efectivo descontará automáticamente de este saldo.
• Y cuando registres un ingreso (nómina o transferencia), se sumará a tus cuentas de liquidez.`;
  }
  mensajeBienvenida(): string {
    return `👋 ¡Hola! Soy *Lukas*, tu asistente de finanzas personales por WhatsApp para Colombia 🇨🇴.

Te ayudo a registrar tus gastos e ingresos sin planillas, llevar tus deudas fijas y aplicar *El Método Lukas* para hackear tus tarjetas de crédito a 1 cuota y financiarte gratis hasta 50 días sin pagar un peso de intereses.

🔐 Antes de comenzar, para proteger tu privacidad conforme a la *Ley 1581 de 2012 (Habeas Data)*:
¿Aceptas el tratamiento seguro de tus datos personales para uso exclusivo de tus finanzas en Lukas?

👉 Responde *"Acepto"* o *"Sí"* para continuar.`;
  }

  mensajePedirNombre(): string {
    return `¡Excelente decisión! 🤝 Tus datos están seguros y aislados.

¿Cómo te gustaría que te llame? (Escribe tu nombre o apodo)`;
  }

  mensajeCuentaActivada(nombre: string): string {
    return `🎉 ¡Bienvenido a Lukas, *${nombre}*!

A partir de ahora puedes hablarme con total naturalidad:
• 📝 *Lukas anota:* _"85000 mercado en efectivo"_ o _"120000 gasolina nu"_
• 💳 *El Método Lukas:* _"¿Qué tarjeta uso hoy para 600 mil?"_
• 📊 *Lukas te muestra:* _"¿Cómo voy este mes?"_ o _"¿Cuánto debo en total?"_
• ⏰ *Lukas te avisa:* Te recordaré tus cortes y fechas límites de pago para pagar el TOTAL a tiempo.

💡 *Paso inicial recomendado:* Registra tus tarjetas escribiendo:
_"Registrar tarjeta Nu cupo 3 millones corte 15 pago 5"_

¿Qué compra o tarjeta quieres registrar hoy?`;
  }

  mensajeAyuda(): string {
    return `🤖 *¿Qué puede hacer Lukas por ti?*

1. 📝 *Lukas anota:*
   • _"45000 almuerzo en efectivo"_
   • _"120000 supermercado bancolombia a 1 cuota"_
   • _"Me pagaron 3500000"_
   • _"Borra el último"_ (deshace el último registro)

2. 💳 *El Método Lukas (Hackea tus tarjetas):*
   • _"¿Qué tarjeta uso hoy para 800 mil?"_ (te dice cuál da más días gratis)
   • _"Ya pagué la gold"_ (marca pagado y libera cupo)
   • _"Ya pasé la de amazon a 1 cuota"_ (cancela alerta de intereses)

3. 📋 *Lukas lleva tus cuentas:*
   • _"Pagué la cuota del kona"_ o _"Pagué el arriendo"_
   • _"¿Cuánto debo en total?"_

4. 🛡️ *Umbral de gasto:*
   • _"Mi presupuesto este mes es 3 millones"_

5. 📊 *Lukas te muestra:*
   • _"¿Cómo voy este mes?"_ o _"Balance"_`;
  }

  mensajeRecomendacionTarjeta(
    monto: number,
    recomendaciones: readonly RecomendacionTarjeta[],
  ): string {
    if (recomendaciones.length === 0) {
      return `💳 No tienes tarjetas activas registradas para compras.
Registra una diciendo: _"Registrar tarjeta Nu cupo 3 millones corte 15 pago 5"_.`;
    }

    const mejor = recomendaciones[0];
    if (!mejor) {
      return 'No hay tarjetas disponibles.';
    }

    let texto = `💳 *Recomendación Inteligente para compra de ${formatearMoneda(monto)}:*\n\n`;

    if (mejor.cumpleMonto) {
      texto += `🏆 *Usa tu tarjeta: ${mejor.tarjeta.nombre}* (${mejor.tarjeta.banco})\n`;
      texto += `• 🎯 *Días de financiamiento gratis:* *${mejor.diasHastaPago} días* a tasa 0%\n`;
      texto += `• 📅 *Fecha límite de pago:* ${formatearFechaLarga(mejor.fechaPago)}\n`;
      texto += `• ✂️ *Próximo corte:* ${formatearFechaCorta(mejor.fechaCorte)}\n`;
      texto += `• 💰 *Cupo disponible restante:* ${formatearMoneda(mejor.cupoDisponibleDespues)}\n`;
      if (mejor.tarjeta.tasaInteresEa) {
        texto += `• 📈 *Tasa de interés:* ${mejor.tarjeta.tasaInteresEa}% E.A. (ahorro en compras a varias cuotas)\n`;
      }
      texto += `• 💡 ${mejor.mensajeEstrategico}\n`;
    } else {
      texto += `⚠️ Ninguna de tus tarjetas tiene cupo disponible suficiente para ${formatearMoneda(monto)}.\n`;
      texto += `Tu tarjeta con más cupo es *${mejor.tarjeta.nombre}* con ${formatearMoneda(mejor.tarjeta.cupoDisponible ?? 0)} disponibles.`;
      return texto;
    }

    // Segunda opción si existe
    if (recomendaciones.length > 1 && recomendaciones[1]?.cumpleMonto) {
      const segunda = recomendaciones[1];
      texto += `\n🥈 *Segunda opción:* ${segunda.tarjeta.nombre} (${segunda.diasHastaPago} días para pagar, vence el ${formatearFechaCorta(segunda.fechaPago)}).`;
    }

    return texto;
  }

  mensajeRegistroExitoso(
    transaccion: Transaccion,
    tarjeta?: Tarjeta | null,
    cuenta?: Cuenta | null,
    gastoAcumuladoMes?: number,
    limitePresupuesto?: number | null,
  ): string {
    const signo = transaccion.tipo === 'gasto' ? '💸' : '💰';
    const montoStr = formatearMoneda(transaccion.monto);
    let texto = `${signo} *${transaccion.tipo === 'gasto' ? 'Gasto' : 'Ingreso'} registrado:* ${montoStr}`;

    if (transaccion.descripcion) {
      texto += ` en _${transaccion.descripcion}_`;
    }

    if (transaccion.medioPago === 'tarjeta' && tarjeta) {
      texto += `\n💳 *Medio de pago:* ${tarjeta.nombre} (${transaccion.cuotas} ${transaccion.cuotas === 1 ? 'cuota' : 'cuotas'})`;
      if (tarjeta.cupoDisponible !== null) {
        texto += `\n💰 *Cupo restante:* ${formatearMoneda(tarjeta.cupoDisponible)}`;
      }

      // Advertencia de cuotas > 1
      if (transaccion.cuotas > 1) {
        texto += `\n\n🚨 *¡Ojo con los intereses!*`;
        texto += `\nEsta compra quedó a *${transaccion.cuotas} cuotas*. Muchos comercios difieren automáticamente.`;
        texto += `\n👉 Para no regalarle intereses al banco, redifiérela a *1 cuota* en la app de ${tarjeta.banco} antes de tu corte del día ${tarjeta.diaCorte}.`;
        texto += `\nCuando lo hagas, solo dime: _"ya pasé la de ${transaccion.descripcion ?? 'esa'} a 1 cuota"_.`;
      }
    } else if (cuenta) {
      const icono = cuenta.tipo === 'efectivo' ? '💵' : cuenta.tipo === 'billetera' ? '📱' : '💳';
      texto += `\n${icono} *Medio de pago:* ${cuenta.nombre} (${cuenta.tipo})`;
      texto += `\n💰 *Saldo disponible en ${cuenta.nombre}:* ${formatearMoneda(cuenta.saldo)}`;
    } else {
      texto += `\n💵 *Medio de pago:* ${transaccion.medioPago}`;
    }

    // Alerta de umbral de gasto si aplica
    if (gastoAcumuladoMes && limitePresupuesto && limitePresupuesto > 0) {
      const porcentaje = (gastoAcumuladoMes / limitePresupuesto) * 100;
      if (porcentaje >= 80) {
        texto += `\n\n⚠️ *Alerta de Presupuesto:*`;
        texto += `\nLlevas ${formatearMoneda(gastoAcumuladoMes)} de tu límite de ${formatearMoneda(limitePresupuesto)} (${formatearPorcentaje(porcentaje)}).`;
        if (porcentaje >= 100) {
          texto += `\n🔴 *¡Has alcanzado o superado tu presupuesto mensual planeado!*`;
        } else {
          texto += `\n🟡 Te quedan ${formatearMoneda(limitePresupuesto - gastoAcumuladoMes)} para el resto del mes.`;
        }
      }
    }

    return texto;
  }

  mensajePagoTarjetaRegistrado(tarjetaNombre: string, totalPagado: number, nuevoCupo: number): string {
    return `🎉 *¡Pago registrado con éxito para ${tarjetaNombre}!*

• Saldo liquidado: *${formatearMoneda(totalPagado)}*
• Cupo disponible restablecido: *${formatearMoneda(nuevoCupo)}*
• Estado: *Al día*, $0 pesos pagados en intereses. ¡Hack completado a la perfección! 🚀`;
  }

  mensajePagoObligacionRegistrado(nombre: string, valor: number, cuotasRestantes: number | null): string {
    let texto = `✅ *Pago registrado para ${nombre}:* ${formatearMoneda(valor)}`;
    if (cuotasRestantes !== null) {
      texto += `\n📉 Te quedan *${cuotasRestantes}* ${cuotasRestantes === 1 ? 'cuota' : 'cuotas'} para liquidar esta deuda por completo.`;
    }
    return texto;
  }

  mensajeCuotasActualizadas(cuotas: number): string {
    return `✅ *¡Excelente jugada!*
Compra actualizada a *${cuotas} ${cuotas === 1 ? 'cuota' : 'cuotas'}*.
Se garantiza el 0% de interés y se desactiva la alerta de rediferir. ¡Así se hackea el sistema! 💳`;
  }

  mensajeUltimaBorrada(transaccion: Transaccion): string {
    return `🗑️ Listo, borré tu última transacción de *${formatearMoneda(transaccion.monto)}* (${transaccion.tipo}).
${transaccion.medioPago === 'tarjeta' ? 'El cupo de tu tarjeta ha sido restablecido.' : ''}`;
  }

  mensajePresupuestoActualizado(limite: number, gastoMes: number): string {
    const restante = Math.max(0, limite - gastoMes);
    const pct = limite > 0 ? (gastoMes / limite) * 100 : 0;
    return `🎯 *Umbral de gasto mensual actualizado a ${formatearMoneda(limite)}*

• Gasto acumulado este mes: *${formatearMoneda(gastoMes)}* (${formatearPorcentaje(pct)})
• Margen disponible: *${formatearMoneda(restante)}*
• Te avisaré automáticamente al llegar al 80% y 100%.`;
  }

  mensajeResumenDeudas(
    tarjetas: readonly Tarjeta[],
    obligaciones: readonly Obligacion[],
  ): string {
    let texto = `📊 *Resumen de tus Cuentas y Deudas:*\n\n`;

    if (tarjetas.length > 0) {
      texto += `💳 *Tarjetas de Crédito:*\n`;
      for (const t of tarjetas) {
        const usado = (t.cupo ?? 0) - (t.cupoDisponible ?? t.cupo ?? 0);
        texto += `• *${t.nombre}:* Saldo en uso ${formatearMoneda(usado)} (Corte: día ${t.diaCorte}, Pago: día ${t.diaPago})\n`;
      }
      texto += `\n`;
    }

    if (obligaciones.length > 0) {
      texto += `📋 *Deudas y Pagos Fijos:*\n`;
      for (const o of obligaciones) {
        texto += `• *${o.nombre}:* Cuota ${formatearMoneda(o.cuota)} (Vence el día ${o.diaPago})`;
        if (o.cuotasRestantes !== null) {
          texto += ` - ${o.cuotasRestantes} cuotas restantes`;
        }
        texto += `\n`;
      }
    }

    if (tarjetas.length === 0 && obligaciones.length === 0) {
      texto += `No tienes tarjetas ni obligaciones registradas aún.`;
    }

    return texto;
  }

  mensajeListadoTarjetas(tarjetas: readonly Tarjeta[]): string {
    if (tarjetas.length === 0) {
      return `💳 Aún no tienes tarjetas de crédito registradas.

Puedes registrar una fácilmente escribiendo:
_"Registrar tarjeta Diners Davivienda cupo de 14.000.000 corte los 20 pago los 5"_
o simplemente diciendo: _"registremos una tarjeta"_ y te pediré los datos paso a paso.`;
    }

    let texto = `💳 *Tus Tarjetas de Crédito Registradas:*\n\n`;
    tarjetas.forEach((t, i) => {
      const cupoTotal = t.cupo ?? 0;
      const cupoDisp = t.cupoDisponible ?? cupoTotal;
      const usado = Math.max(0, cupoTotal - cupoDisp);

      texto += `${i + 1}. 💳 *${t.nombre}* (${t.banco})\n`;
      texto += `   • 💰 *Cupo total:* ${formatearMoneda(cupoTotal)}\n`;
      texto += `   • 🟢 *Cupo disponible:* ${formatearMoneda(cupoDisp)}\n`;
      if (usado > 0) {
        texto += `   • 🔴 *Saldo utilizado:* ${formatearMoneda(usado)}\n`;
      }
      texto += `   • ✂️ *Corte:* día ${t.diaCorte} de cada mes\n`;
      texto += `   • 📅 *Pago límite:* día ${t.diaPago} de cada mes\n`;
      texto += `   • 📈 *Tasa de interés:* ${t.tasaInteresEa ? `${t.tasaInteresEa}% E.A.` : '28.0% E.A. (estándar)'}\n`;
      texto += `   • 🛡️ *Compras a 1 cuota:* ${t.cobraInteresUnaCuota ? 'Cobra interés' : '0% interés (ideal)'}\n\n`;
    });

    texto += `💡 *El Método Lukas:* Pregúntame _"¿Qué tarjeta uso hoy para 500 mil?"_ y te diré cuál te da más días de financiamiento gratis.`;
    return texto.trim();
  }

  mensajeConsultaSaldo(
    tarjeta: Tarjeta | null,
    tarjetas: readonly Tarjeta[],
    cuentaSeleccionada?: Cuenta | null,
    cuentas: readonly Cuenta[] = [],
  ): string {
    if (cuentaSeleccionada) {
      const icono =
        cuentaSeleccionada.tipo === 'efectivo'
          ? '💵'
          : cuentaSeleccionada.tipo === 'billetera'
            ? '📱'
            : '🏦';

      return `${icono} *Saldo disponible en ${cuentaSeleccionada.nombre}:*

• 🟢 *Saldo actual disponible:* ${formatearMoneda(cuentaSeleccionada.saldo)}
• 🏷️ Tipo: ${cuentaSeleccionada.tipo}${cuentaSeleccionada.banco ? ` (${cuentaSeleccionada.banco})` : ''}
• 🛡️ No genera intereses ni tiene fechas de corte.`;
    }

    if (tarjeta) {
      const cupoTotal = tarjeta.cupo ?? 0;
      const cupoDisp = tarjeta.cupoDisponible ?? cupoTotal;
      const usado = Math.max(0, cupoTotal - cupoDisp);

      return `💳 *Saldo y Cupo de ${tarjeta.nombre}* (${tarjeta.banco}):

• 🟢 *Cupo disponible para compras:* ${formatearMoneda(cupoDisp)}
• 🔴 *Saldo en uso / utilizado:* ${formatearMoneda(usado)}
• 💰 *Cupo total asignado:* ${formatearMoneda(cupoTotal)}
• 📈 *Tasa de interés:* ${tarjeta.tasaInteresEa ? `${tarjeta.tasaInteresEa}% E.A.` : '28.0% E.A. (estándar)'}
• ✂️ *Corte:* día ${tarjeta.diaCorte} | 📅 *Pago límite:* día ${tarjeta.diaPago}`;
    }

    if (tarjetas.length === 0 && cuentas.length === 0) {
      return `💳 No tienes tarjetas ni cuentas registradas aún. Di _"registremos una tarjeta"_ o _"registrar débito bancolombia"_ para comenzar.`;
    }

    let texto = `📊 *Resumen de Liquidez y Tarjetas:*\n\n`;

    // 1. Cuentas de liquidez / Dinero propio
    let totalLiquido = 0;
    if (cuentas.length > 0) {
      texto += `🟢 *Tu Dinero Propio (Liquidez):*\n`;
      for (const c of cuentas) {
        totalLiquido += c.saldo;
        const icono = c.tipo === 'efectivo' ? '💵' : c.tipo === 'billetera' ? '📱' : '💳';
        texto += `• ${icono} *${c.nombre}:* ${formatearMoneda(c.saldo)}\n`;
      }
      texto += `💰 *Total dinero propio disponible:* *${formatearMoneda(totalLiquido)}*\n\n`;
    }

    // 2. Tarjetas de crédito
    let totalCupoCredito = 0;
    let totalDeudaCredito = 0;
    if (tarjetas.length > 0) {
      texto += `💳 *Tarjetas de Crédito (Apalancamiento):*\n`;
      for (const t of tarjetas) {
        const total = t.cupo ?? 0;
        const disp = t.cupoDisponible ?? total;
        const usado = Math.max(0, total - disp);
        totalCupoCredito += total;
        totalDeudaCredito += usado;
        texto += `• *${t.nombre}:* Cupo libre ${formatearMoneda(disp)} (En uso: ${formatearMoneda(usado)})\n`;
      }
      texto += `🔴 *Deuda total en tarjetas:* *${formatearMoneda(totalDeudaCredito)}* (Cupo total: ${formatearMoneda(totalCupoCredito)})\n\n`;
    }

    // 3. Balance neto si tiene ambos
    if (cuentas.length > 0 && tarjetas.length > 0) {
      const balanceNeto = totalLiquido - totalDeudaCredito;
      const signoNeto = balanceNeto >= 0 ? '🟢' : '🔴';
      texto += `⚖️ *Balance Neto (Dinero propio - Deuda actual):* ${signoNeto} *${formatearMoneda(balanceNeto)}*`;
    }

    return texto.trim();
  }

  mensajeConsultaCiclo(tarjeta: Tarjeta | null, tarjetas: readonly Tarjeta[]): string {
    if (tarjeta) {
      return `🗓️ *Fechas de Ciclo para ${tarjeta.nombre}* (${tarjeta.banco}):

• ✂️ *Día de corte:* ${tarjeta.diaCorte} de cada mes
• 📅 *Día límite de pago:* ${tarjeta.diaPago} de cada mes
• 🎯 *Estrategia Lukas:* Si compras justo el día después del corte (${tarjeta.diaCorte + 1 <= 31 ? tarjeta.diaCorte + 1 : 1}), tienes entre *45 y 55 días de financiamiento gratis* a tasa 0% pagando a 1 cuota.`;
    }

    if (tarjetas.length === 0) {
      return `💳 No tienes tarjetas registradas aún. Di _"registremos una tarjeta"_ para comenzar.`;
    }

    let texto = `🗓️ *Fechas de Corte y Pago de tus Tarjetas:*\n\n`;
    tarjetas.forEach((t) => {
      texto += `• 💳 *${t.nombre}:* Corte día *${t.diaCorte}* | Pago día *${t.diaPago}*\n`;
    });
    texto += `\n💡 *Recuerda:* Compra siempre después del corte para maximizar tus días libres de interés.`;
    return texto;
  }

  mensajeGastoPeriodo(
    periodo: string,
    gasto: number,
    limitePresupuesto?: number | null,
    transacciones?: readonly Transaccion[],
    tarjetas?: readonly Tarjeta[],
  ): string {
    const periodoLabel =
      periodo === 'hoy'
        ? 'hoy'
        : periodo === 'semana'
          ? 'esta semana'
          : periodo === 'mes_pasado'
            ? 'el mes pasado'
            : 'este mes';

    let texto = `📊 *Gastos acumulados ${periodoLabel}:*\n\n• Total gastado: *${formatearMoneda(gasto)}*`;

    if (periodo === 'mes' && limitePresupuesto && limitePresupuesto > 0) {
      const pct = Math.round((gasto / limitePresupuesto) * 100);
      const restante = Math.max(0, limitePresupuesto - gasto);
      texto += `\n• Presupuesto mensual: *${formatearMoneda(limitePresupuesto)}* (${pct}% consumido)`;
      texto += `\n• Margen restante: *${formatearMoneda(restante)}*`;
    }

    if (transacciones && transacciones.length > 0) {
      texto += `\n\n📝 *Detalle de compras (${transacciones.length}):*`;
      for (const t of transacciones) {
        const desc = t.descripcion ? t.descripcion : 'Gasto';
        let medio = '';
        if (t.medioPago === 'tarjeta' && t.tarjetaId && tarjetas) {
          const tar = tarjetas.find((x) => x.id === t.tarjetaId);
          medio = tar ? ` (${tar.nombre})` : ' (tarjeta)';
        } else if (t.medioPago) {
          medio = ` (${t.medioPago})`;
        }
        texto += `\n• ${desc}: *${formatearMoneda(t.monto)}*${medio}`;
      }
    }

    return texto;
  }

  mensajeGastoCategoria(categoria: string, total: number, count: number): string {
    if (total === 0) {
      return `🏷️ No tienes gastos registrados en la categoría *${categoria}* este mes.`;
    }

    return `🏷️ *Gastos en ${categoria} (este mes):*\n\n• Total acumulado: *${formatearMoneda(total)}*\n• Número de compras: *${count}*`;
  }
}
