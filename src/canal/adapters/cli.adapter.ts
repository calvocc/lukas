/**
 * ========================================================
 * Adaptador de Consola Interactiva (CLI Simulator)
 * Permite probar y chatear con Lukas directamente en la terminal
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import * as readline from 'readline';
import { CanalMensajeria, ManejadorMensaje } from '../canal.interface';

@Injectable()
export class CliAdapter implements CanalMensajeria {
  private readonly logger = new Logger(CliAdapter.name);
  private manejador: ManejadorMensaje | null = null;
  private readonly numeroSimulado = '+573001234567';
  private rl: readline.Interface | null = null;

  registrarManejador(manejador: ManejadorMensaje): void {
    this.manejador = manejador;
  }

  async iniciar(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    this.logger.log('Iniciando Simulador CLI Interactivo de Lukas...');

    console.log('\n=============================================================');
    console.log('🤖 LUKAS: ASISTENTE DE FINANZAS PERSONALES (MODO CONSOLA)');
    console.log(`📱 Simulando número de WhatsApp: ${this.numeroSimulado}`);
    console.log('💡 Escribe "salir" para terminar o escribe como en WhatsApp.');
    console.log('=============================================================\n');

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Enviar primer saludo automático
    if (this.manejador) {
      const respuestaInicial = await this.manejador(this.numeroSimulado, 'hola');
      console.log(`\n🤖 Lukas:\n${respuestaInicial}\n`);
    }

    this.promptUser();
  }

  private promptUser(): void {
    if (!this.rl) return;

    this.rl.question('💬 Tú: ', async (input) => {
      const texto = input.trim();
      if (texto.toLowerCase() === 'salir') {
        console.log('\n👋 ¡Hasta luego! Cerrando sesión de Lukas.\n');
        process.exit(0);
      }

      if (texto.length > 0 && this.manejador) {
        try {
          const respuesta = await this.manejador(this.numeroSimulado, texto);
          console.log(`\n🤖 Lukas:\n${respuesta}\n`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`\n❌ Error: ${msg}\n`);
        }
      }

      this.promptUser();
    });
  }

  async enviarTexto(numeroWhatsapp: string, texto: string): Promise<void> {
    console.log(`\n🔔 [ALERTA / RECORDATORIO PARA ${numeroWhatsapp}]:\n${texto}\n`);
  }
}
