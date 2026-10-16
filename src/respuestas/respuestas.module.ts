/**
 * ========================================================
 * Módulo de Respuestas (Lukas habla)
 * ========================================================
 */

import { Module } from '@nestjs/common';
import { RespuestasService } from './respuestas.service';

@Module({
  providers: [RespuestasService],
  exports: [RespuestasService],
})
export class RespuestasModule {}
