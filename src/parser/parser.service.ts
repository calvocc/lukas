/**
 * ========================================================
 * Servicio del Intérprete (ParserModule)
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable } from '@nestjs/common';
import { OpenAiProvider } from './openai.provider';
import { ParserResult } from '../domain/types';
import { ContextoMensaje } from './parser.interface';

@Injectable()
export class ParserService {
  constructor(private readonly provider: OpenAiProvider) {}

  async interpretar(mensaje: string, contexto: ContextoMensaje): Promise<ParserResult> {
    return this.provider.interpretar(mensaje, contexto);
  }
}
