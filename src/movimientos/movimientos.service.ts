/**
 * ========================================================
 * Servicio de Movimientos (Libro: Lukas anota)
 * Gastos e Ingresos, Corrección y Control de Cuotas
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Transaccion, TipoTransaccion, MedioPago, Confianza, Categoria } from '../domain/types';
import { TarjetasService } from '../tarjetas/tarjetas.service';
import { UsuariosService } from '../usuarios/usuarios.service';

interface TransaccionRow {
  id: string;
  usuario_id: string;
  tipo: TipoTransaccion;
  monto: string;
  categoria_id: string;
  categoria_confianza: Confianza | null;
  descripcion: string | null;
  medio_pago: MedioPago;
  tarjeta_id: string | null;
  cuotas: number;
  cuotas_originales: number;
  pendiente_rediferir: boolean;
  fecha: string;
  creado_en: string;
}

interface CategoriaRow {
  id: string;
  nombre: string;
}

function mapearTransaccion(row: TransaccionRow): Transaccion {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    tipo: row.tipo,
    monto: Number(row.monto),
    categoriaId: row.categoria_id,
    categoriaConfianza: row.categoria_confianza,
    descripcion: row.descripcion,
    medioPago: row.medio_pago,
    tarjetaId: row.tarjeta_id,
    cuotas: row.cuotas,
    cuotasOriginales: row.cuotas_originales,
    pendienteRediferir: row.pendiente_rediferir,
    fecha: row.fecha,
    creadoEn: new Date(row.creado_en),
  };
}

@Injectable()
export class MovimientosService {
  private readonly logger = new Logger(MovimientosService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly tarjetasService: TarjetasService,
    private readonly usuariosService: UsuariosService,
  ) {}

  async obtenerCategorias(): Promise<readonly Categoria[]> {
    const rows = await this.db.query<CategoriaRow>('SELECT * FROM categorias ORDER BY nombre ASC');
    return rows.map((r) => ({ id: r.id, nombre: r.nombre }));
  }

  async resolverCategoriaId(nombreSugerido: string | null): Promise<string> {
    const categorias = await this.obtenerCategorias();
    if (!nombreSugerido) {
      const otros = categorias.find((c) => c.nombre.toLowerCase() === 'otros');
      return otros?.id ?? categorias[0]?.id ?? '';
    }

    const limpio = nombreSugerido.trim().toLowerCase();
    const encontrada = categorias.find((c) => c.nombre.toLowerCase() === limpio);
    if (encontrada) {
      return encontrada.id;
    }

    // Búsqueda aproximada básica
    const aproximada = categorias.find((c) =>
      limpio.includes(c.nombre.toLowerCase()) || c.nombre.toLowerCase().includes(limpio),
    );
    if (aproximada) {
      return aproximada.id;
    }

    const otros = categorias.find((c) => c.nombre.toLowerCase() === 'otros');
    return otros?.id ?? categorias[0]?.id ?? '';
  }

  async registrar(
    usuarioId: string,
    datos: {
      tipo: TipoTransaccion;
      monto: number;
      categoriaNombre?: string | null;
      categoriaConfianza?: Confianza;
      descripcion?: string | null;
      medioPago?: MedioPago;
      tarjetaId?: string | null;
      cuotas?: number;
      fecha?: string;
    },
  ): Promise<Transaccion> {
    const categoriaId = await this.resolverCategoriaId(datos.categoriaNombre ?? null);
    const cuotas = Math.max(1, datos.cuotas ?? 1);
    const pendienteRediferir = datos.medioPago === 'tarjeta' && cuotas > 1;

    const row = await this.db.queryOne<TransaccionRow>(
      `INSERT INTO transacciones (
        usuario_id, tipo, monto, categoria_id, categoria_confianza,
        descripcion, medio_pago, tarjeta_id, cuotas, cuotas_originales,
        pendiente_rediferir, fecha
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::date, CURRENT_DATE))
      RETURNING *`,
      [
        usuarioId,
        datos.tipo,
        datos.monto,
        categoriaId,
        datos.categoriaConfianza ?? 'alta',
        datos.descripcion ?? null,
        datos.medioPago ?? 'tarjeta',
        datos.tarjetaId ?? null,
        cuotas,
        cuotas,
        pendienteRediferir,
        datos.fecha ?? null,
      ],
    );

    if (!row) {
      throw new Error('Error al registrar la transacción');
    }

    const transaccion = mapearTransaccion(row);

    // Actualizar puntero de última transacción en usuario
    await this.usuariosService.actualizarUltimaTransaccion(usuarioId, transaccion.id);

    // Si fue con tarjeta, descontar del cupo disponible
    if (transaccion.medioPago === 'tarjeta' && transaccion.tarjetaId) {
      await this.tarjetasService.descontarCupoDisponible(transaccion.tarjetaId, transaccion.monto);
    }

    this.logger.log(
      `Transacción registrada [${transaccion.tipo}] $${transaccion.monto} (cuotas: ${cuotas})`,
    );

    return transaccion;
  }

  async obtenerUltimaTransaccion(usuarioId: string): Promise<Transaccion | null> {
    const usuario = await this.usuariosService.buscarPorId(usuarioId);
    if (!usuario || !usuario.ultimaTransaccionId) {
      // Buscar la más reciente por fecha de creación
      const row = await this.db.queryOne<TransaccionRow>(
        'SELECT * FROM transacciones WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT 1',
        [usuarioId],
      );
      return row ? mapearTransaccion(row) : null;
    }

    const row = await this.db.queryOne<TransaccionRow>(
      'SELECT * FROM transacciones WHERE id = $1 LIMIT 1',
      [usuario.ultimaTransaccionId],
    );
    return row ? mapearTransaccion(row) : null;
  }

  async borrarUltimaTransaccion(usuarioId: string): Promise<Transaccion | null> {
    const ultima = await this.obtenerUltimaTransaccion(usuarioId);
    if (!ultima) {
      return null;
    }

    // Si fue con tarjeta, restituir cupo disponible
    if (ultima.medioPago === 'tarjeta' && ultima.tarjetaId) {
      await this.tarjetasService.restituirCupoDisponible(ultima.tarjetaId, ultima.monto);
    }

    // Borrar registro
    await this.db.execute('DELETE FROM transacciones WHERE id = $1', [ultima.id]);

    // Limpiar puntero en usuario
    await this.usuariosService.actualizarUltimaTransaccion(usuarioId, null);

    this.logger.log(`Última transacción eliminada: ${ultima.id} ($${ultima.monto})`);
    return ultima;
  }

  /**
   * Actualiza las cuotas de una compra (ej: cuando el usuario la pasa a 1 cuota en la app bancaria)
   */
  async actualizarCuotas(
    usuarioId: string,
    nuevasCuotas: number,
    tarjetaNombreOId?: string,
  ): Promise<Transaccion | null> {
    let sql = `
      SELECT * FROM transacciones 
      WHERE usuario_id = $1 AND tipo = 'gasto' AND medio_pago = 'tarjeta'
    `;
    const params: unknown[] = [usuarioId];

    if (tarjetaNombreOId) {
      const tarjeta = await this.tarjetasService.buscarPorNombreOAlias(usuarioId, tarjetaNombreOId);
      if (tarjeta) {
        sql += ' AND tarjeta_id = $2';
        params.push(tarjeta.id);
      }
    }

    sql += ' ORDER BY creado_en DESC LIMIT 1';

    const row = await this.db.queryOne<TransaccionRow>(sql, params);
    if (!row) {
      return null;
    }

    const cuotasFinales = Math.max(1, nuevasCuotas);
    const pendienteRediferir = cuotasFinales > 1;

    const rowActualizado = await this.db.queryOne<TransaccionRow>(
      `UPDATE transacciones 
       SET cuotas = $1, pendiente_rediferir = $2
       WHERE id = $3
       RETURNING *`,
      [cuotasFinales, pendienteRediferir, row.id],
    );

    return rowActualizado ? mapearTransaccion(rowActualizado) : null;
  }

  /**
   * Calcula el gasto total acumulado en el mes en curso sumando todas las tarjetas y medios de pago
   */
  async calcularGastoMesActual(usuarioId: string): Promise<number> {
    const ahora = new Date();
    const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split('T')[0];

    interface TotalRow {
      total: string | null;
    }

    const row = await this.db.queryOne<TotalRow>(
      `SELECT SUM(monto) as total
       FROM transacciones
       WHERE usuario_id = $1 AND tipo = 'gasto' AND fecha >= $2`,
      [usuarioId, primerDiaMes],
    );

    return row?.total ? Number(row.total) : 0;
  }

  /**
   * Obtiene compras pendientes de rediferir (cuotas > 1) que cortan pronto
   */
  async listarPendientesDeRediferir(usuarioId: string): Promise<readonly Transaccion[]> {
    const rows = await this.db.query<TransaccionRow>(
      `SELECT * FROM transacciones
       WHERE usuario_id = $1 AND pendiente_rediferir = true
       ORDER BY creado_en DESC`,
      [usuarioId],
    );
    return rows.map(mapearTransaccion);
  }
}
