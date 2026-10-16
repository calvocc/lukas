/**
 * ========================================================
 * Servicio de Canal (Puente)
 * Selecciona e inicializa el adaptador (CLI o Baileys)
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { LukasConfigService } from '../config/config.service';
import { CanalRouterService } from './canal-router.service';
import { CliAdapter } from './adapters/cli.adapter';
import { BaileysAdapter } from './adapters/baileys.adapter';
import { CanalMensajeria } from './canal.interface';

@Injectable()
export class CanalService implements OnModuleInit {
  private readonly logger = new Logger(CanalService.name);
  private adapter!: CanalMensajeria;

  constructor(
    private readonly config: LukasConfigService,
    private readonly routerService: CanalRouterService,
    private readonly cliAdapter: CliAdapter,
    private readonly baileysAdapter: BaileysAdapter,
  ) {}

  async onModuleInit(): Promise<void> {
    const proveedor = this.config.canalProveedor;
    this.logger.log(`Canal seleccionado: ${proveedor.toUpperCase()}`);

    if (proveedor === 'baileys') {
      this.adapter = this.baileysAdapter;
    } else {
      this.adapter = this.cliAdapter;
    }

    // Conectar el enrutador de mensajes al adaptador
    this.adapter.registrarManejador(async (numero, texto) => {
      return this.routerService.procesarMensaje(numero, texto);
    });

    // Iniciar el adaptador
    await this.adapter.iniciar();
  }

  async enviarMensaje(numeroWhatsapp: string, texto: string): Promise<void> {
    if (this.adapter) {
      await this.adapter.enviarTexto(numeroWhatsapp, texto);
    }
  }
}
