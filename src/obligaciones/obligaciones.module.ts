/**
 * ========================================================
 * Módulo de Obligaciones (Compromisos: Lukas lleva tus cuentas)
 * ========================================================
 */

import { Module } from '@nestjs/common';
import { ObligacionesService } from './obligaciones.service';

@Module({
  providers: [ObligacionesService],
  exports: [ObligacionesService],
})
export class ObligacionesModule {}
