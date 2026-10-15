/**
 * ========================================================
 * Servicio de Conexión a Base de Datos PostgreSQL
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { LukasConfigService } from '../config/config.service';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly config: LukasConfigService = new LukasConfigService()) {
    this.iniciarPool();
  }

  onModuleInit(): void {
    this.iniciarPool();
  }

  private iniciarPool(): void {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: this.config.databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      this.pool.on('error', (err: Error) => {
        this.logger.error('Error inesperado en el pool de PostgreSQL:', err.message);
      });

      this.logger.log(`Conectando a PostgreSQL en ${this.config.get('DB_HOST')}:${this.config.get('DB_PORT')}...`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('Pool de PostgreSQL cerrado correctamente.');
    }
  }

  /**
   * Ejecuta una consulta SQL tipada y devuelve un arreglo de filas.
   * Sin usar tipo any.
   */
  async query<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<readonly T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<T>(sql, params as unknown[]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Ejecuta una consulta SQL y devuelve la primera fila o null si no hay resultados.
   */
  async queryOne<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /**
   * Ejecuta una instrucción SQL de modificación (INSERT, UPDATE, DELETE) y devuelve el número de filas afectadas.
   */
  async execute(sql: string, params: readonly unknown[] = []): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params as unknown[]);
      return result.rowCount ?? 0;
    } finally {
      client.release();
    }
  }
}
