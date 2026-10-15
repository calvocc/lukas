/**
 * ========================================================
 * Interfaz de Proveedor de IA para el Intérprete
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { ParserResult, Tarjeta, Obligacion, Transaccion, RecomendacionCompraPendiente } from '../domain/types';

export interface ContextoMensaje {
  readonly fechaActual: string; // YYYY-MM-DD
  readonly tarjetasActivas: readonly { readonly id: string; readonly nombre: string; readonly banco: string }[];
  readonly obligacionesActivas: readonly { readonly id: string; readonly nombre: string }[];
  readonly ultimaTransaccion: Transaccion | null;
  readonly recomendacionPrevia?: RecomendacionCompraPendiente | null;
}

export interface ProveedorIA {
  interpretar(mensaje: string, contexto: ContextoMensaje): Promise<ParserResult>;
}
