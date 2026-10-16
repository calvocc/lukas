/**
 * ========================================================
 * Interfaz de Canal de Mensajería (Puente)
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

export type ManejadorMensaje = (numeroWhatsapp: string, texto: string) => Promise<string>;

export interface CanalMensajeria {
  iniciar(): Promise<void>;
  enviarTexto(numeroWhatsapp: string, texto: string): Promise<void>;
  enviarImagen?(numeroWhatsapp: string, bufferImagen: Buffer, caption?: string): Promise<void>;
  registrarManejador(manejador: ManejadorMensaje): void;
}
