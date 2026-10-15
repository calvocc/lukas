/**
 * ========================================================
 * Módulo del Intérprete (ParserModule)
 * ========================================================
 */

import { Module } from '@nestjs/common';
import { ParserService } from './parser.service';
import { OpenAiProvider } from './openai.provider';

@Module({
  providers: [OpenAiProvider, ParserService],
  exports: [ParserService],
})
export class ParserModule {}
