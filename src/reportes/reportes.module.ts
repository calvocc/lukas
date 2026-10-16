/**
 * ========================================================
 * Módulo de Reportes (Lukas te muestra)
 * ========================================================
 */

import { Module } from '@nestjs/common';
import { ReportesService } from './reportes.service';

@Module({
  providers: [ReportesService],
  exports: [ReportesService],
})
export class ReportesModule {}
