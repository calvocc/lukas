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

interface ObligacionRow {
  id: string;
  usuario_id: string;
  nombre: string;
  tipo: TipoObligacion;
  saldo: string | null;
  tasa_mv: string | null;
  cuota: string;
  dia_pago: number;
  cuotas_restantes: number | null;
  activa: boolean;
  creado_en: string;
}

function mapearObligacion(row: ObligacionRow): Obligacion {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    nombre: row.nombre,
    tipo: row.tipo,
    saldo: row.saldo ? Number(row.saldo) : null,
    tasaMv: row.tasa_mv ? Number(row.tasa_mv) : null,
    cuota: Number(row.cuota),
    diaPago: row.dia_pago,
    cuotasRestantes: row.cuotas_restantes,
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
      cuota: number;
      diaPago: number;
      saldo?: number | null;
      tasaMv?: number | null;
      cuotasRestantes?: number | null;
    },
  ): Promise<Obligacion> {
    const row = await this.db.queryOne<ObligacionRow>(
      `INSERT INTO obligaciones (
        usuario_id, nombre, tipo, saldo, tasa_mv, cuota, dia_pago, cuotas_restantes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        usuarioId,
        datos.nombre,
        datos.tipo,
        datos.saldo ?? null,
        datos.tasaMv ?? null,
        datos.cuota,
        datos.diaPago,
        datos.cuotasRestantes ?? null,
      ],
    );

    if (!row) {
      throw new Error('Error al registrar obligación');
    }

    this.logger.log(`Obligación registrada: ${datos.nombre} ($${datos.cuota}) para ${usuarioId}`);
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
