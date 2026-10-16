/**
 * ========================================================
 * Módulo de Canal (Puente)
 * ========================================================
 */

import { Module } from '@nestjs/common';
import { CanalService } from './canal.service';
import { CanalRouterService } from './canal-router.service';
import { CliAdapter } from './adapters/cli.adapter';
import { BaileysAdapter } from './adapters/baileys.adapter';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ParserModule } from '../parser/parser.module';
import { RespuestasModule } from '../respuestas/respuestas.module';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { TarjetasModule } from '../tarjetas/tarjetas.module';
import { CuentasModule } from '../cuentas/cuentas.module';
import { ObligacionesModule } from '../obligaciones/obligaciones.module';

@Module({
  imports: [
    UsuariosModule,
    ParserModule,
    RespuestasModule,
    MovimientosModule,
    TarjetasModule,
    CuentasModule,
    ObligacionesModule,
  ],
  providers: [CliAdapter, BaileysAdapter, CanalRouterService, CanalService],
  exports: [CanalService],
})
export class CanalModule {}
