/**
 * ========================================================
 * Servicio de Voz (Lukas habla)
 * Respuestas cercanas en español colombiano y formato `$39.000`
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable } from '@nestjs/common';
import { formatearMoneda, formatearFechaCorta, formatearFechaLarga, formatearPorcentaje } from './formateador';
import { RecomendacionTarjeta, Transaccion, Tarjeta, Obligacion } from '../domain/types';

@Injectable()
export class RespuestasService {
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
}
