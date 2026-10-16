/**
 * ========================================================
 * Módulo de Base de Datos
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { LukasConfigService } from '../config/config.service';

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
