/**
 * ========================================================
 * Módulo Principal de Lukas Bot (NestJS)
 * 9 Módulos Organizados según la Especificación Oficial
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { TarjetasModule } from './tarjetas/tarjetas.module';
import { ObligacionesModule } from './obligaciones/obligaciones.module';
import { MovimientosModule } from './movimientos/movimientos.module';
import { ParserModule } from './parser/parser.module';
import { RespuestasModule } from './respuestas/respuestas.module';
import { AlertasModule } from './alertas/alertas.module';
import { ReportesModule } from './reportes/reportes.module';
import { CuentasModule } from './cuentas/cuentas.module';
import { CanalModule } from './canal/canal.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    UsuariosModule,
    TarjetasModule,
    CuentasModule,
    ObligacionesModule,
    MovimientosModule,
    ParserModule,
    RespuestasModule,
    AlertasModule,
    ReportesModule,
    CanalModule,
  ],
})
export class AppModule {}
