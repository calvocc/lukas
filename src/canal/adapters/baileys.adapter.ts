/**
 * ========================================================
 * Adaptador de WhatsApp con Baileys (WebSockets)
 * Código QR en consola y reconexión automática
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
} from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode-terminal';
import * as path from 'path';
import { CanalMensajeria, ManejadorMensaje } from '../canal.interface';

@Injectable()
export class BaileysAdapter implements CanalMensajeria {
  private readonly logger = new Logger(BaileysAdapter.name);
  private socket: WASocket | null = null;
  private manejador: ManejadorMensaje | null = null;
  private readonly authFolder = path.join(process.cwd(), 'auth_info_baileys');

  registrarManejador(manejador: ManejadorMensaje): void {
    this.manejador = manejador;
  }

  async iniciar(): Promise<void> {
    this.logger.log('Iniciando cliente de WhatsApp con Baileys...');

    const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      defaultQueryTimeoutMs: 60000,
    });

    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📲 ESCANEA ESTE CÓDIGO QR DESDE TU WHATSAPP (Dispositivos vinculados):\n');
        qrcode.generate(qr, { small: true });
        console.log('\n');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        const debeReconectar = statusCode !== DisconnectReason.loggedOut;

        this.logger.warn(`Conexión de WhatsApp cerrada (Razón: ${statusCode}). Reconectando: ${debeReconectar}`);
        if (debeReconectar) {
          setTimeout(() => {
            void this.iniciar();
          }, 3000);
        }
      } else if (connection === 'open') {
        this.logger.log(' Conexión establecida con WhatsApp exitosamente.');
      }
    });

    this.socket.ev.on('messages.upsert', async (event) => {
      const messages = event.messages;
      for (const msg of messages) {
        // Ignorar mensajes propios o sin contenido
        if (msg.key.fromMe || !msg.message) {
          continue;
        }

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid.endsWith('@g.us')) {
          // Ignorar grupos por ahora (Lukas es asistente personal 1 a 1)
          continue;
        }

        const texto = this.extraerTexto(msg.message);
        if (!texto) {
          continue;
        }

        const numeroLimpio = remoteJid.replace('@s.whatsapp.net', '');
        this.logger.log(`Mensaje recibido de ${numeroLimpio}: "${texto}"`);

        if (this.manejador) {
          try {
            const respuesta = await this.manejador(numeroLimpio, texto);
            if (respuesta && respuesta.trim().length > 0) {
              await this.socket?.sendMessage(remoteJid, { text: respuesta });
            }
          } catch (err: unknown) {
            const msgError = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error procesando mensaje de ${numeroLimpio}:`, msgError);
          }
        }
      }
    });
  }

  private extraerTexto(message: proto.IMessage): string | null {
    if (message.conversation) {
      return message.conversation;
    }
    if (message.extendedTextMessage?.text) {
      return message.extendedTextMessage.text;
    }
    return null;
  }

  async enviarTexto(numeroWhatsapp: string, texto: string): Promise<void> {
    if (!this.socket) {
      this.logger.warn(`No se pudo enviar mensaje a ${numeroWhatsapp}: socket no conectado.`);
      return;
    }
    const remoteJid = numeroWhatsapp.includes('@s.whatsapp.net')
      ? numeroWhatsapp
      : `${numeroWhatsapp.replace(/\D/g, '')}@s.whatsapp.net`;

    await this.socket.sendMessage(remoteJid, { text: texto });
    this.logger.log(`Mensaje enviado a ${remoteJid}: "${texto.slice(0, 50)}..."`);
  }
}
