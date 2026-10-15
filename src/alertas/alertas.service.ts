/**
 * ========================================================
 * Servicio de Alertas (Alertas: Lukas te avisa)
 * Cron programado cada 15 min para recordatorios a las 8:00 AM
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { TarjetasService } from '../tarjetas/tarjetas.service';
import { ObligacionesService } from '../obligaciones/obligaciones.service';
import { MovimientosService } from '../movimientos/movimientos.service';
import { CanalService } from '../canal/canal.service';
import { formatearMoneda, formatearFechaCorta } from '../respuestas/formateador';
import { calcularCicloParaCompra } from '../domain/cycle-calculator';

interface UsuarioActivoRow {
  id: string;
  numero_whatsapp: string;
  nombre: string | null;
  zona_horaria: string;
  hora_recordatorios: string;
}

@Injectable()
export class AlertasService {
  private readonly logger = new Logger(AlertasService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly tarjetasService: TarjetasService,
    private readonly obligacionesService: ObligacionesService,
    private readonly movimientosService: MovimientosService,
    private readonly canalService: CanalService,
  ) {}

  /**
   * Tarea programada cada 15 minutos para despachar recordatorios
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async ejecutarRecordatoriosProgramados(): Promise<void> {
    this.logger.log('Evaluando recordatorios financieros programados...');

    const usuarios = await this.db.query<UsuarioActivoRow>(
      "SELECT id, numero_whatsapp, nombre, zona_horaria, hora_recordatorios FROM usuarios WHERE estado = 'activo'",
    );

    const ahora = new Date();
    const diaHoy = ahora.getDate();

    for (const usuario of usuarios) {
      try {
        await this.evaluarRecordatoriosUsuario(usuario, ahora, diaHoy);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error evaluando recordatorios para usuario ${usuario.numero_whatsapp}:`, msg);
      }
    }
  }

  private async evaluarRecordatoriosUsuario(
    usuario: UsuarioActivoRow,
    ahora: Date,
    diaHoy: number,
  ): Promise<void> {
    const tarjetas = await this.tarjetasService.listarPorUsuario(usuario.id);
    const obligaciones = await this.obligacionesService.listarPorUsuario(usuario.id);

    // 1. Evaluar Tarjetas
    for (const t of tarjetas) {
      const ciclo = calcularCicloParaCompra(ahora, t.diaCorte, t.diaPago);
      const diaCorteAyer = t.diaCorte === 1 ? 30 : t.diaCorte - 1;

      // A. El día después del corte: Resumen del extracto cerrado y ventana dorada
      if (diaHoy === t.diaCorte + 1 || (t.diaCorte >= 30 && diaHoy === 1)) {
        const deuda = Math.max(0, (t.cupo ?? 0) - (t.cupoDisponible ?? t.cupo ?? 0));
        const msj = `🔔 *Lukas te avisa: cortó tu ${t.nombre}* (${t.banco}).
• Saldo del extracto: *${formatearMoneda(deuda)}*
• Paga antes del: *${formatearFechaCorta(ciclo.fechaPagoCiclo)}*
• Recuerda pagar el *TOTAL*, nunca el mínimo, para mantener 0% intereses.
💡 *Empieza un ciclo nuevo:* Lo que compres a partir de hoy lo pagarás en unos 45-50 días.`;
        await this.canalService.enviarMensaje(usuario.numero_whatsapp, msj);
      }

      // B. 3 días antes de la fecha de pago
      const diasHastaPago = ciclo.diasHastaPago;
      if (diasHastaPago === 3) {
        const deuda = Math.max(0, (t.cupo ?? 0) - (t.cupoDisponible ?? t.cupo ?? 0));
        if (deuda > 0) {
          const msj = `🔔 *Faltan 3 días para pagar la ${t.nombre}:* ${formatearMoneda(deuda)}.
Paga el *TOTAL* antes del ${formatearFechaCorta(ciclo.fechaPagoCiclo)}.`;
          await this.canalService.enviarMensaje(usuario.numero_whatsapp, msj);
        }
      }

      // C. El mismo día de pago
      if (diaHoy === t.diaPago) {
        const deuda = Math.max(0, (t.cupo ?? 0) - (t.cupoDisponible ?? t.cupo ?? 0));
        if (deuda > 0) {
          const msj = `🚨 *¡Hoy vence la ${t.nombre}!*
Paga el TOTAL de *${formatearMoneda(deuda)}* hoy antes de medianoche para evitar intereses de mora.
Responde _"ya pagué la ${t.nombre}"_ cuando lo hagas.`;
          await this.canalService.enviarMensaje(usuario.numero_whatsapp, msj);
        }
      }

      // D. Alerta de cuota de manejo (5 días antes del corte)
      const diasParaCorte = t.diaCorte - diaHoy;
      if (t.tieneCuotaManejo && t.metaExoneracion > 0 && diasParaCorte === 5) {
        const msj = `⚠️ *¡Alerta de Cuota de Manejo para ${t.nombre}!*
Tu fecha de corte es en 5 días (${t.diaCorte}).
Recuerda cumplir tu meta de compras para ahorrarte los *${formatearMoneda(t.valorCuotaManejo)}* de cuota de manejo.`;
        await this.canalService.enviarMensaje(usuario.numero_whatsapp, msj);
      }
    }

    // 2. Evaluar compras pendientes de rediferir a 1 cuota (2 días antes del corte)
    const pendientesRediferir = await this.movimientosService.listarPendientesDeRediferir(usuario.id);
    if (pendientesRediferir.length > 0) {
      for (const p of pendientesRediferir) {
        const tarjeta = tarjetas.find((t) => t.id === p.tarjetaId);
        if (tarjeta && tarjeta.diaCorte - diaHoy === 2) {
          const msj = `🚨 *Recordatorio antes de corte:*
Tu ${tarjeta.nombre} corta en 2 días.
Tienes una compra de *${formatearMoneda(p.monto)}* diferida a ${p.cuotas} cuotas.
👉 Cámbiala a *1 cuota* en la app de tu banco antes del corte para que no te cobren intereses.`;
          await this.canalService.enviarMensaje(usuario.numero_whatsapp, msj);
        }
      }
    }

    // 3. Evaluar Obligaciones fijas (2 días antes de pago)
    for (const o of obligaciones) {
      if (o.diaPago - diaHoy === 2) {
        const msj = `🔔 En 2 días vence tu pago de *${o.nombre}:* ${formatearMoneda(o.cuota)}.`;
        await this.canalService.enviarMensaje(usuario.numero_whatsapp, msj);
      }
    }
  }
}
