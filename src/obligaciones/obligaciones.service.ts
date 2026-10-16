/**
 * ========================================================
 * Servicio de Obligaciones (Compromisos: Lukas lleva tus cuentas)
 * Deudas a Cuotas y Pagos Fijos (Kona, Arriendo, Servicios)
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Obligacion, TipoObligacion } from '../domain/types';
import { formatearMoneda } from '../respuestas/formateador';

interface ObligacionRow {
  id: string;
  usuario_id: string;
  nombre: string;
  tipo: TipoObligacion;
  entidad: string | null;
  saldo: string | null;
  tasa_mv: string | null;
  tasa_ea: string | null;
  cuota: string;
  dia_pago: number;
  cuotas_restantes: number | null;
  cuotas_totales: number | null;
  activa: boolean;
  creado_en: string;
}

function mapearObligacion(row: ObligacionRow): Obligacion {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    nombre: row.nombre,
    tipo: row.tipo,
    entidad: row.entidad ?? null,
    saldo: row.saldo ? Number(row.saldo) : null,
    tasaMv: row.tasa_mv ? Number(row.tasa_mv) : null,
    tasaEa: row.tasa_ea ? Number(row.tasa_ea) : null,
    cuota: Number(row.cuota),
    diaPago: row.dia_pago,
    cuotasRestantes: row.cuotas_restantes,
    cuotasTotales: row.cuotas_totales,
    activa: row.activa,
    creadoEn: new Date(row.creado_en),
  };
}

@Injectable()
export class ObligacionesService {
  private readonly logger = new Logger(ObligacionesService.name);

  constructor(private readonly db: DatabaseService) {}

  async listarPorUsuario(usuarioId: string): Promise<readonly Obligacion[]> {
    const rows = await this.db.query<ObligacionRow>(
      'SELECT * FROM obligaciones WHERE usuario_id = $1 AND activa = true ORDER BY dia_pago ASC',
      [usuarioId],
    );
    return rows.map(mapearObligacion);
  }

  async buscarPorNombre(usuarioId: string, nombre: string): Promise<Obligacion | null> {
    const limpio = nombre.trim().toLowerCase();
    const rows = await this.listarPorUsuario(usuarioId);
    const encontrada = rows.find(
      (o) => o.nombre.toLowerCase() === limpio || o.nombre.toLowerCase().includes(limpio),
    );
    return encontrada ?? null;
  }

  async crear(
    usuarioId: string,
    datos: {
      nombre: string;
      tipo: TipoObligacion;
      diaPago: number;
      cuota?: number | null;
      entidad?: string | null;
      saldo?: number | null;
      tasaEa?: number | null;
      tasaMv?: number | null;
      cuotasRestantes?: number | null;
      cuotasTotales?: number | null;
    },
  ): Promise<Obligacion> {
    const tasaEa = datos.tasaEa ?? (datos.tasaMv ? (Math.pow(1 + datos.tasaMv / 100, 12) - 1) * 100 : null);
    const tasaMv = datos.tasaMv ?? (tasaEa ? (Math.pow(1 + tasaEa / 100, 1 / 12) - 1) * 100 : null);
    const meses = datos.cuotasRestantes ?? datos.cuotasTotales ?? 12;

    let cuotaFinal = datos.cuota ?? 0;
    if ((!cuotaFinal || cuotaFinal <= 0) && datos.saldo && datos.saldo > 0) {
      cuotaFinal = calcularCuotaFrancesa(datos.saldo, tasaEa, tasaMv, meses);
    }

    const row = await this.db.queryOne<ObligacionRow>(
      `INSERT INTO obligaciones (
        usuario_id, nombre, tipo, entidad, saldo, tasa_mv, tasa_ea, cuota, dia_pago, cuotas_restantes, cuotas_totales
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        usuarioId,
        datos.nombre,
        datos.tipo,
        datos.entidad ?? null,
        datos.saldo ?? null,
        tasaMv ?? null,
        tasaEa ?? null,
        cuotaFinal,
        datos.diaPago,
        datos.cuotasRestantes ?? datos.cuotasTotales ?? null,
        datos.cuotasTotales ?? datos.cuotasRestantes ?? null,
      ],
    );

    if (!row) {
      throw new Error('Error al registrar obligación');
    }

    this.logger.log(`Obligación registrada: ${datos.nombre} ($${cuotaFinal}) para ${usuarioId}`);
    return mapearObligacion(row);
  }

  /**
   * Registra el pago mensual de una obligación ("pagué el kona")
   */
  async registrarPago(
    usuarioId: string,
    nombreOObligacionId: string,
    montoAbonado?: number,
  ): Promise<{ obligacion: Obligacion; valorPagado: number; cuotasRestantes: number | null }> {
    let obligacion = await this.buscarPorNombre(usuarioId, nombreOObligacionId);
    if (!obligacion) {
      const row = await this.db.queryOne<ObligacionRow>(
        'SELECT * FROM obligaciones WHERE id = $1 AND usuario_id = $2 LIMIT 1',
        [nombreOObligacionId, usuarioId],
      );
      if (row) {
        obligacion = mapearObligacion(row);
      }
    }

    if (!obligacion) {
      throw new Error(`No se encontró la obligación "${nombreOObligacionId}"`);
    }

    const valorPagado = montoAbonado ?? obligacion.cuota;
    const ahora = new Date();
    const periodo = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split('T')[0];

    // Registrar en pagos_obligacion
    await this.db.execute(
      `INSERT INTO pagos_obligacion (usuario_id, obligacion_id, periodo, valor)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (obligacion_id, periodo) DO UPDATE SET valor = EXCLUDED.valor, pagado_en = NOW()`,
      [usuarioId, obligacion.id, periodo, valorPagado],
    );

    // Si es deuda y tiene cuotas restantes, descontar 1 cuota
    let cuotasRestantes = obligacion.cuotasRestantes;
    if (obligacion.tipo === 'deuda' && cuotasRestantes !== null && cuotasRestantes > 0) {
      cuotasRestantes -= 1;
      const nuevoSaldo = obligacion.saldo ? Math.max(0, obligacion.saldo - valorPagado) : null;
      await this.db.execute(
        'UPDATE obligaciones SET cuotas_restantes = $1, saldo = $2 WHERE id = $3',
        [cuotasRestantes, nuevoSaldo, obligacion.id],
      );
    }

    this.logger.log(`Pago de obligación registrado: ${obligacion.nombre} ($${valorPagado})`);
    return {
      obligacion,
      valorPagado,
      cuotasRestantes,
    };
  }
}

/**
 * Calcula la cuota mensual fija usando amortización francesa:
 * C = P * [ i * (1 + i)^n ] / [ (1 + i)^n - 1 ]
 * Donde:
 * - P = Saldo o Capital prestado
 * - i = Tasa periódica mensual (si tasa es E.A.: i = (1 + EA)^(1/12) - 1)
 * - n = Número de cuotas / meses
 */
export function calcularCuotaFrancesa(
  saldo: number,
  tasaEa: number | null,
  tasaMv: number | null,
  meses: number,
): number {
  if (saldo <= 0 || meses <= 0) return 0;

  let i = 0;
  if (tasaMv !== null && tasaMv > 0) {
    i = tasaMv / 100;
  } else if (tasaEa !== null && tasaEa > 0) {
    i = Math.pow(1 + tasaEa / 100, 1 / 12) - 1;
  } else {
    // Si no se especifica tasa, referencia bancaria del 18% E.A.
    i = Math.pow(1 + 0.18, 1 / 12) - 1;
  }

  if (i <= 0) {
    return Math.round(saldo / meses);
  }

  const factor = Math.pow(1 + i, meses);
  const cuota = saldo * ((i * factor) / (factor - 1));
  return Math.round(cuota);
}

/**
 * Genera recomendación de aceleración y ahorro financiero mediante abonos a capital
 */
export function generarConsejoAceleracionDeuda(
  saldo: number,
  tasaEa: number | null,
  cuotasRestantes: number,
  cuotaMensual: number,
): string {
  if (saldo <= 0 || cuotasRestantes <= 6) {
    return 'Mantén tus pagos al día en tu fecha oportuna para proteger tu score crediticio.';
  }

  const i = tasaEa && tasaEa > 0
    ? Math.pow(1 + tasaEa / 100, 1 / 12) - 1
    : 0.01; // ~1% mensual por defecto

  // Abono sugerido (~10% de la cuota o mínimo $100.000 redondeado a $50.000)
  const abonoSugerido = Math.max(100000, Math.round((cuotaMensual * 0.1) / 50000) * 50000);
  const nuevaCuotaEfectiva = cuotaMensual + abonoSugerido;

  let mesesAhorrados = 0;
  let ahorroIntereses = 0;

  if (nuevaCuotaEfectiva > saldo * i) {
    const nuevosMesesExactos = -Math.log(1 - (saldo * i) / nuevaCuotaEfectiva) / Math.log(1 + i);
    const nuevosMeses = Math.ceil(nuevosMesesExactos);
    mesesAhorrados = Math.max(1, cuotasRestantes - nuevosMeses);

    const totalOriginal = cuotaMensual * cuotasRestantes;
    const totalNuevo = nuevaCuotaEfectiva * nuevosMeses;
    ahorroIntereses = Math.max(0, Math.round((totalOriginal - totalNuevo) / 10000) * 10000);
  }

  let consejo = `💡 *El Método Lukas para pagar más rápido:*\n`;
  if (mesesAhorrados > 0 && ahorroIntereses > 0) {
    consejo += `Si realizas un abono a capital recurrente de *${formatearMoneda(abonoSugerido)}/mes* solicitando _"reducción de plazo"_, terminarás de pagar *${mesesAhorrados} meses antes* y te ahorrarás aprox. *${formatearMoneda(ahorroIntereses)}* en intereses bancarios.`;
  } else {
    consejo += `Cualquier abono extraordinario a capital que hagas directamente a _"reducción de plazo"_ reduce los intereses totales de inmediato.`;
  }

  return consejo;
}
