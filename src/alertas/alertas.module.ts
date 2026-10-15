/**
 * ========================================================
 * Módulo de Alertas (Lukas te avisa)
 * ========================================================
 */

import { Module } from '@nestjs/common';
import { AlertasService } from './alertas.service';
import { TarjetasModule } from '../tarjetas/tarjetas.module';
import { ObligacionesModule } from '../obligaciones/obligaciones.module';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { CanalModule } from '../canal/canal.module';

@Module({
  imports: [TarjetasModule, ObligacionesModule, MovimientosModule, CanalModule],
  providers: [AlertasService],
  exports: [AlertasService],
})
export class AlertasModule {}
