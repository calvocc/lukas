/**
 * ========================================================
 * Módulo de Cuentas de Liquidez
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Module } from '@nestjs/common';
import { CuentasService } from './cuentas.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [CuentasService],
  exports: [CuentasService],
})
export class CuentasModule {}
