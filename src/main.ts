/**
 * ========================================================
 * Punto de Entrada Principal (Bootstrap)
 * Lukas: Asistente de Finanzas Personales por WhatsApp
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  logger.log('Iniciando Lukas: Asistente de Finanzas Personales...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.enableShutdownHooks();

  logger.log('Lukas Bot listo y escuchando en el canal configurado.');
}

void bootstrap();
