/**
 * ========================================================
 * Módulo de Movimientos (Libro: Lukas anota)
 * ========================================================
 */

import { Module } from '@nestjs/common';
import { MovimientosService } from './movimientos.service';
import { TarjetasModule } from '../tarjetas/tarjetas.module';
import { UsuariosModule } from '../usuarios/usuarios.module';

@Module({
  imports: [TarjetasModule, UsuariosModule],
  providers: [MovimientosService],
  exports: [MovimientosService],
})
export class MovimientosModule {}
