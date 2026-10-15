/**
 * ========================================================
 * Servicio de Usuarios (Cuenta: Bienvenido a Lukas)
 * Ley 1581 de 2012 (Habeas Data)
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Usuario, EstadoUsuario, MedioPago, TonoVoz } from '../domain/types';

interface UsuarioRow {
  id: string;
  numero_whatsapp: string;
  nombre: string | null;
  estado: EstadoUsuario;
  acepto_datos_en: string | null;
  zona_horaria: string;
  hora_recordatorios: string;
  medio_pago_default: MedioPago;
  tono_preferido: TonoVoz;
  plan: string;
  limite_gasto_mensual: string | null;
  ultima_transaccion_id: string | null;
  creado_en: string;
}

function mapearUsuario(row: UsuarioRow): Usuario {
  return {
    id: row.id,
    numeroWhatsapp: row.numero_whatsapp,
    nombre: row.nombre,
    estado: row.estado,
    aceptoDatosEn: row.acepto_datos_en ? new Date(row.acepto_datos_en) : null,
    zonaHoraria: row.zona_horaria,
    horaRecordatorios: row.hora_recordatorios,
    medioPagoDefault: row.medio_pago_default,
    tonoPreferido: row.tono_preferido,
    plan: row.plan,
    limiteGastoMensual: row.limite_gasto_mensual ? Number(row.limite_gasto_mensual) : null,
    ultimaTransaccionId: row.ultima_transaccion_id,
    creadoEn: new Date(row.creado_en),
  };
}

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(private readonly db: DatabaseService) {}

  async buscarPorNumero(numeroWhatsapp: string): Promise<Usuario | null> {
    const row = await this.db.queryOne<UsuarioRow>(
      'SELECT * FROM usuarios WHERE numero_whatsapp = $1 LIMIT 1',
      [numeroWhatsapp],
    );
    return row ? mapearUsuario(row) : null;
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    const row = await this.db.queryOne<UsuarioRow>(
      'SELECT * FROM usuarios WHERE id = $1 LIMIT 1',
      [id],
    );
    return row ? mapearUsuario(row) : null;
  }

  async registrarNuevo(numeroWhatsapp: string): Promise<Usuario> {
    const row = await this.db.queryOne<UsuarioRow>(
      `INSERT INTO usuarios (numero_whatsapp, estado)
       VALUES ($1, 'registrando')
       ON CONFLICT (numero_whatsapp) DO UPDATE SET estado = 'registrando'
       RETURNING *`,
      [numeroWhatsapp],
    );
    if (!row) {
      throw new Error('No se pudo registrar el usuario');
    }
    this.logger.log(`Nuevo usuario registrado en proceso: ${numeroWhatsapp}`);
    return mapearUsuario(row);
  }

  async aceptarPoliticaDatos(usuarioId: string): Promise<void> {
    await this.db.execute(
      `UPDATE usuarios 
       SET acepto_datos_en = NOW()
       WHERE id = $1`,
      [usuarioId],
    );
    this.logger.log(`Usuario ${usuarioId} aceptó la política de datos (Ley 1581)`);
  }

  async actualizarNombre(usuarioId: string, nombre: string): Promise<void> {
    await this.db.execute(
      "UPDATE usuarios SET nombre = $1, estado = 'activo' WHERE id = $2",
      [nombre, usuarioId],
    );
    this.logger.log(`Usuario ${usuarioId} activó su cuenta con el nombre: ${nombre}`);
  }

  async actualizarLimiteGastoMensual(usuarioId: string, limite: number | null): Promise<void> {
    await this.db.execute(
      'UPDATE usuarios SET limite_gasto_mensual = $1 WHERE id = $2',
      [limite, usuarioId],
    );
    this.logger.log(`Usuario ${usuarioId} actualizó su umbral mensual de gasto a: ${limite}`);
  }

  async actualizarUltimaTransaccion(usuarioId: string, transaccionId: string | null): Promise<void> {
    await this.db.execute(
      'UPDATE usuarios SET ultima_transaccion_id = $1 WHERE id = $2',
      [transaccionId, usuarioId],
    );
  }

  async eliminarCuenta(usuarioId: string): Promise<void> {
    // Marcado lógico y borrado en cascada
    await this.db.execute(
      "UPDATE usuarios SET estado = 'eliminado' WHERE id = $1",
      [usuarioId],
    );
    this.logger.log(`Cuenta de usuario ${usuarioId} marcada como eliminada`);
  }
}
