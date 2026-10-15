/**
 * ========================================================
 * Servicio de Tarjetas (El Método Lukas)
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Tarjeta, TipoExoneracion, RecomendacionTarjeta } from '../domain/types';
import { optimizarMejorTarjeta } from '../domain/card-optimizer';
import { calcularCicloParaCompra } from '../domain/cycle-calculator';

interface TarjetaRow {
  id: string;
  usuario_id: string;
  nombre: string;
  banco: string;
  dia_corte: number;
  dia_pago: number;
  cupo: string | null;
  cupo_disponible: string | null;
  limite_ciclo: string | null;
  cobra_interes_una_cuota: boolean;
  acepta_compras: boolean;
  es_default: boolean;
  tiene_cuota_manejo: boolean;
  valor_cuota_manejo: string | null;
  tipo_exoneracion: TipoExoneracion;
  meta_exoneracion: string | null;
  activa: boolean;
  creado_en: string;
}

function mapearTarjeta(row: TarjetaRow): Tarjeta {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    nombre: row.nombre,
    banco: row.banco,
    diaCorte: row.dia_corte,
    diaPago: row.dia_pago,
    cupo: row.cupo ? Number(row.cupo) : null,
    cupoDisponible: row.cupo_disponible ? Number(row.cupo_disponible) : null,
    limiteCiclo: row.limite_ciclo ? Number(row.limite_ciclo) : null,
    cobraInteresUnaCuota: row.cobra_interes_una_cuota,
    aceptaCompras: row.acepta_compras,
    esDefault: row.es_default,
    tieneCuotaManejo: row.tiene_cuota_manejo,
    valorCuotaManejo: row.valor_cuota_manejo ? Number(row.valor_cuota_manejo) : 0,
    tipoExoneracion: row.tipo_exoneracion,
    metaExoneracion: row.meta_exoneracion ? Number(row.meta_exoneracion) : 0,
    activa: row.activa,
    creadoEn: new Date(row.creado_en),
  };
}

@Injectable()
export class TarjetasService {
  private readonly logger = new Logger(TarjetasService.name);

  constructor(private readonly db: DatabaseService) {}

  async listarPorUsuario(usuarioId: string): Promise<readonly Tarjeta[]> {
    const rows = await this.db.query<TarjetaRow>(
      'SELECT * FROM tarjetas WHERE usuario_id = $1 AND activa = true ORDER BY creado_en ASC',
      [usuarioId],
    );
    return rows.map(mapearTarjeta);
  }

  async eliminarTarjetasIncompletas(usuarioId: string): Promise<number> {
    const res = await this.db.execute(
      `DELETE FROM tarjetas WHERE usuario_id = $1 AND (nombre = 'Mi Tarjeta' OR banco = 'Banco')`,
      [usuarioId],
    );
    return res;
  }

  async eliminarPorNombre(usuarioId: string, nombre: string): Promise<boolean> {
    const res = await this.db.execute(
      'DELETE FROM tarjetas WHERE usuario_id = $1 AND LOWER(nombre) = LOWER($2)',
      [usuarioId, nombre],
    );
    return res > 0;
  }

  async buscarPorId(id: string): Promise<Tarjeta | null> {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!esUuid) {
      return null;
    }
    const row = await this.db.queryOne<TarjetaRow>(
      'SELECT * FROM tarjetas WHERE id = $1 LIMIT 1',
      [id],
    );
    return row ? mapearTarjeta(row) : null;
  }

  async buscarPorNombreOAlias(usuarioId: string, texto: string): Promise<Tarjeta | null> {
    const limpio = texto.trim().toLowerCase();
    const tarjetas = await this.listarPorUsuario(usuarioId);

    // Búsqueda exacta o contenida en nombre o banco
    const encontrada = tarjetas.find((t) => {
      const nombreLimpio = t.nombre.toLowerCase();
      const bancoLimpio = t.banco.toLowerCase();
      return (
        nombreLimpio === limpio ||
        bancoLimpio === limpio ||
        nombreLimpio.includes(limpio) ||
        bancoLimpio.includes(limpio) ||
        limpio.includes(nombreLimpio) ||
        limpio.includes(bancoLimpio)
      );
    });

    return encontrada ?? null;
  }

  async crear(
    usuarioId: string,
    datos: {
      nombre: string;
      banco: string;
      diaCorte: number;
      diaPago: number;
      cupo?: number | null;
      cupoDisponible?: number | null;
      limiteCiclo?: number | null;
      cobraInteresUnaCuota?: boolean;
      aceptaCompras?: boolean;
      esDefault?: boolean;
      tieneCuotaManejo?: boolean;
      valorCuotaManejo?: number;
      tipoExoneracion?: TipoExoneracion;
      metaExoneracion?: number;
    },
  ): Promise<Tarjeta> {
    const cupoFinal = datos.cupo ?? 0;
    const cupoDisponibleFinal = datos.cupoDisponible ?? cupoFinal;

    const row = await this.db.queryOne<TarjetaRow>(
      `INSERT INTO tarjetas (
        usuario_id, nombre, banco, dia_corte, dia_pago,
        cupo, cupo_disponible, limite_ciclo,
        cobra_interes_una_cuota, acepta_compras, es_default,
        tiene_cuota_manejo, valor_cuota_manejo, tipo_exoneracion, meta_exoneracion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (usuario_id, nombre) DO UPDATE SET
        banco = EXCLUDED.banco,
        dia_corte = EXCLUDED.dia_corte,
        dia_pago = EXCLUDED.dia_pago,
        cupo = EXCLUDED.cupo,
        cupo_disponible = EXCLUDED.cupo_disponible,
        limite_ciclo = EXCLUDED.limite_ciclo,
        cobra_interes_una_cuota = EXCLUDED.cobra_interes_una_cuota,
        acepta_compras = EXCLUDED.acepta_compras,
        tiene_cuota_manejo = EXCLUDED.tiene_cuota_manejo,
        valor_cuota_manejo = EXCLUDED.valor_cuota_manejo,
        tipo_exoneracion = EXCLUDED.tipo_exoneracion,
        meta_exoneracion = EXCLUDED.meta_exoneracion,
        activa = true
      RETURNING *`,
      [
        usuarioId,
        datos.nombre,
        datos.banco,
        datos.diaCorte,
        datos.diaPago,
        cupoFinal,
        cupoDisponibleFinal,
        datos.limiteCiclo ?? null,
        datos.cobraInteresUnaCuota ?? false,
        datos.aceptaCompras ?? true,
        datos.esDefault ?? false,
        datos.tieneCuotaManejo ?? false,
        datos.valorCuotaManejo ?? 0,
        datos.tipoExoneracion ?? 'ninguna',
        datos.metaExoneracion ?? 0,
      ],
    );

    if (!row) {
      throw new Error('Error al registrar o actualizar tarjeta');
    }

    this.logger.log(`Tarjeta ${datos.nombre} guardada para usuario ${usuarioId}`);
    return mapearTarjeta(row);
  }

  async actualizarCupoDisponible(id: string, nuevoCupo: number): Promise<void> {
    await this.db.execute(
      'UPDATE tarjetas SET cupo_disponible = $1 WHERE id = $2',
      [nuevoCupo, id],
    );
  }

  async descontarCupoDisponible(id: string, monto: number): Promise<void> {
    await this.db.execute(
      'UPDATE tarjetas SET cupo_disponible = GREATEST(0, COALESCE(cupo_disponible, cupo, 0) - $1) WHERE id = $2',
      [monto, id],
    );
  }

  async restituirCupoDisponible(id: string, monto: number): Promise<void> {
    await this.db.execute(
      'UPDATE tarjetas SET cupo_disponible = LEAST(COALESCE(cupo, 0), COALESCE(cupo_disponible, 0) + $1) WHERE id = $2',
      [monto, id],
    );
  }

  async recomendarMejorTarjeta(usuarioId: string, monto: number): Promise<readonly RecomendacionTarjeta[]> {
    const tarjetas = await this.listarPorUsuario(usuarioId);
    return optimizarMejorTarjeta(tarjetas, monto, new Date());
  }

  /**
   * Obtiene la suma total gastada en el ciclo actual de una tarjeta
   */
  async calcularGastosCicloActual(
    usuarioId: string,
    tarjetaId: string,
  ): Promise<{ totalCiclo: number; comprasCount: number; fechaLimite: Date }> {
    const tarjeta = await this.buscarPorId(tarjetaId);
    if (!tarjeta) {
      throw new Error('Tarjeta no encontrada');
    }

    const ciclo = calcularCicloParaCompra(new Date(), tarjeta.diaCorte, tarjeta.diaPago);

    interface SumaRow {
      total: string | null;
      cantidad: string | null;
    }

    const row = await this.db.queryOne<SumaRow>(
      `SELECT SUM(monto) as total, COUNT(*) as cantidad
       FROM transacciones
       WHERE usuario_id = $1
         AND tarjeta_id = $2
         AND tipo = 'gasto'
         AND fecha >= $3`,
      [
        usuarioId,
        tarjetaId,
        ciclo.fechaCorteCiclo.toISOString().split('T')[0],
      ],
    );

    const totalCiclo = row?.total ? Number(row.total) : 0;
    const comprasCount = row?.cantidad ? Number(row.cantidad) : 0;

    return {
      totalCiclo,
      comprasCount,
      fechaLimite: ciclo.fechaPagoCiclo,
    };
  }

  /**
   * Registra el pago total del extracto del ciclo ("ya pagué la gold")
   * Libera el cupo disponible y crea el registro en pagos_tarjeta
   */
  async registrarPagoTotalCiclo(
    usuarioId: string,
    nombreOTarjetaId: string,
  ): Promise<{ tarjeta: Tarjeta; totalPagado: number; nuevoCupo: number }> {
    let tarjeta = await this.buscarPorId(nombreOTarjetaId);
    if (!tarjeta) {
      tarjeta = await this.buscarPorNombreOAlias(usuarioId, nombreOTarjetaId);
    }

    if (!tarjeta) {
      throw new Error(`No se encontró la tarjeta "${nombreOTarjetaId}"`);
    }

    const cupoTotal = tarjeta.cupo ?? 0;
    const cupoDisponibleActual = tarjeta.cupoDisponible ?? cupoTotal;
    // La deuda acumulada por pagar es la diferencia entre el cupo total y el cupo disponible
    const deudaCalculada = Math.max(0, cupoTotal - cupoDisponibleActual);

    // O consultar los gastos del ciclo si cupoDisponible es null
    let totalPagado = deudaCalculada;
    if (totalPagado === 0) {
      const gastos = await this.calcularGastosCicloActual(usuarioId, tarjeta.id);
      totalPagado = gastos.totalCiclo;
    }

    // Restablecer cupo al 100%
    const nuevoCupo = cupoTotal;
    await this.actualizarCupoDisponible(tarjeta.id, nuevoCupo);

    const ciclo = calcularCicloParaCompra(new Date(), tarjeta.diaCorte, tarjeta.diaPago);

    // Registrar en pagos_tarjeta
    await this.db.execute(
      `INSERT INTO pagos_tarjeta (
        usuario_id, tarjeta_id, ciclo_inicio, ciclo_fin, fecha_limite, total_ciclo, pagado, pagado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())`,
      [
        usuarioId,
        tarjeta.id,
        new Date(new Date().getFullYear(), new Date().getMonth() - 1, tarjeta.diaCorte).toISOString().split('T')[0],
        ciclo.fechaCorteCiclo.toISOString().split('T')[0],
        ciclo.fechaPagoCiclo.toISOString().split('T')[0],
        totalPagado,
      ],
    );

    this.logger.log(`Pago registrado para tarjeta ${tarjeta.nombre}: $${totalPagado}`);
    return {
      tarjeta,
      totalPagado,
      nuevoCupo,
    };
  }
}
