/**
 * ========================================================
 * Servicio de Cuentas de Liquidez
 * Maneja Tarjetas Débito, Cuentas de Ahorros, Billeteras y Efectivo
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Cuenta, TipoCuenta } from '../domain/types';

interface CuentaRow {
  id: string;
  usuario_id: string;
  nombre: string;
  tipo: TipoCuenta;
  banco: string | null;
  saldo: string;
  moneda: string;
  es_default: boolean;
  activa: boolean;
  creado_en: string;
  actualizada_en: string;
}

function mapearCuenta(row: CuentaRow): Cuenta {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    nombre: row.nombre,
    tipo: row.tipo,
    banco: row.banco,
    saldo: Number(row.saldo),
    moneda: row.moneda,
    esDefault: row.es_default,
    activa: row.activa,
    creadoEn: new Date(row.creado_en),
    actualizadaEn: new Date(row.actualizada_en),
  };
}

@Injectable()
export class CuentasService {
  private readonly logger = new Logger(CuentasService.name);

  constructor(private readonly db: DatabaseService) {}

  async listarPorUsuario(usuarioId: string): Promise<readonly Cuenta[]> {
    const rows = await this.db.query<CuentaRow>(
      'SELECT * FROM cuentas WHERE usuario_id = $1 AND activa = true ORDER BY creado_en ASC',
      [usuarioId],
    );
    return rows.map(mapearCuenta);
  }

  async buscarPorId(cuentaId: string): Promise<Cuenta | null> {
    const row = await this.db.queryOne<CuentaRow>(
      'SELECT * FROM cuentas WHERE id = $1',
      [cuentaId],
    );
    return row ? mapearCuenta(row) : null;
  }

  async buscarPorNombreOAlias(usuarioId: string, texto: string): Promise<Cuenta | null> {
    const limpio = texto.trim().toLowerCase();
    const cuentas = await this.listarPorUsuario(usuarioId);

    const encontrada = cuentas.find((c) => {
      const nombreLimpio = c.nombre.toLowerCase();
      const bancoLimpio = c.banco?.toLowerCase() ?? '';
      return (
        nombreLimpio === limpio ||
        bancoLimpio === limpio ||
        nombreLimpio.includes(limpio) ||
        (bancoLimpio.length > 0 && bancoLimpio.includes(limpio)) ||
        limpio.includes(nombreLimpio) ||
        (bancoLimpio.length > 0 && limpio.includes(bancoLimpio))
      );
    });

    return encontrada ?? null;
  }

  async crear(
    usuarioId: string,
    datos: {
      nombre: string;
      tipo: TipoCuenta;
      banco?: string | null;
      saldo: number;
      esDefault?: boolean;
    },
  ): Promise<Cuenta> {
    const row = await this.db.queryOne<CuentaRow>(
      `INSERT INTO cuentas (
        usuario_id, nombre, tipo, banco, saldo, moneda, es_default, activa
      ) VALUES ($1, $2, $3, $4, $5, 'COP', $6, true)
      ON CONFLICT (usuario_id, nombre) DO UPDATE SET
        saldo = EXCLUDED.saldo,
        banco = EXCLUDED.banco,
        tipo = EXCLUDED.tipo,
        activa = true,
        actualizada_en = NOW()
      RETURNING *`,
      [
        usuarioId,
        datos.nombre,
        datos.tipo,
        datos.banco ?? null,
        datos.saldo,
        datos.esDefault ?? false,
      ],
    );

    if (!row) {
      throw new Error('No se pudo guardar la cuenta de liquidez');
    }

    const cuenta = mapearCuenta(row);
    this.logger.log(`Cuenta guardada: ${cuenta.nombre} (${cuenta.tipo}) con saldo $${cuenta.saldo} para usuario ${usuarioId}`);
    return cuenta;
  }

  async actualizarSaldo(cuentaId: string, deltaMonto: number): Promise<Cuenta> {
    const row = await this.db.queryOne<CuentaRow>(
      `UPDATE cuentas
       SET saldo = saldo + $1, actualizada_en = NOW()
       WHERE id = $2
       RETURNING *`,
      [deltaMonto, cuentaId],
    );

    if (!row) {
      throw new Error(`Cuenta con id ${cuentaId} no encontrada`);
    }

    return mapearCuenta(row);
  }

  async ajustarSaldo(cuentaId: string, nuevoSaldo: number): Promise<Cuenta> {
    const row = await this.db.queryOne<CuentaRow>(
      `UPDATE cuentas
       SET saldo = $1, actualizada_en = NOW()
       WHERE id = $2
       RETURNING *`,
      [nuevoSaldo, cuentaId],
    );

    if (!row) {
      throw new Error(`Cuenta con id ${cuentaId} no encontrada`);
    }

    return mapearCuenta(row);
  }

  async calcularSaldoTotalLiquido(usuarioId: string): Promise<number> {
    interface TotalRow {
      total: string | null;
    }
    const row = await this.db.queryOne<TotalRow>(
      `SELECT SUM(saldo) as total FROM cuentas WHERE usuario_id = $1 AND activa = true`,
      [usuarioId],
    );
    return row?.total ? Number(row.total) : 0;
  }
}
