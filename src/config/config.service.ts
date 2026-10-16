/**
 * ========================================================
 * Servicio de Configuración y Variables de Entorno
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  CANAL_PROVEEDOR: z.enum(['baileys', 'cloud_api', 'cli']).default('cli'),
  REGISTRO_MODO: z.enum(['abierto', 'invitacion', 'cerrado']).default('abierto'),
  ADMIN_EMAIL: z.string().default('admin@lukas.local'),

  IA_PROVEEDOR: z.enum(['openai', 'anthropic']).default('openai'),
  IA_MODELO: z.string().default('gpt-4o-mini'),
  OPENAI_API_KEY: z.string().default(''),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5434),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgrespassword'),
  DB_NAME: z.string().default('lukas_db'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgrespassword@localhost:5434/lukas_db'),

  MONEDA_DEFAULT: z.string().default('COP'),
  ZONA_HORARIA_DEFAULT: z.string().default('America/Bogota'),
  HORA_RECORDATORIOS_DEFAULT: z.string().default('08:00'),
});

export type EnvConfig = z.infer<typeof envSchema>;

@Injectable()
export class LukasConfigService {
  private readonly config: EnvConfig;

  constructor() {
    const parseResult = envSchema.safeParse(process.env);
    if (!parseResult.success) {
      console.error('❌ Error de validación en variables de entorno:', parseResult.error.format());
      throw new Error('Configuración inválida');
    }
    this.config = parseResult.data;
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config[key];
  }

  get canalProveedor(): 'baileys' | 'cloud_api' | 'cli' {
    return this.config.CANAL_PROVEEDOR;
  }

  get openaiApiKey(): string {
    return this.config.OPENAI_API_KEY;
  }

  get iaModelo(): string {
    return this.config.IA_MODELO;
  }

  get databaseUrl(): string {
    return this.config.DATABASE_URL;
  }
}
