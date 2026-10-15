/**
 * ========================================================
 * Módulo Global de Configuración
 * ========================================================
 */

import { Module, Global } from '@nestjs/common';
import { LukasConfigService } from './config.service';

@Global()
@Module({
  providers: [LukasConfigService],
  exports: [LukasConfigService],
})
export class ConfigModule {}
