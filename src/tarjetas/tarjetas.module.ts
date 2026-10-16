/**
 * ========================================================
 * Módulo de Tarjetas (El Método Lukas)
 * ========================================================
 */

import { Module } from '@nestjs/common';
import { TarjetasService } from './tarjetas.service';

@Module({
  providers: [TarjetasService],
  exports: [TarjetasService],
})
export class TarjetasModule {}
