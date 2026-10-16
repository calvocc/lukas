/**
 * ========================================================
 * Servicio de Reportes (Lukas te muestra)
 * Totales por período, categoría, balance y gráficas
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import QuickChart from 'quickchart-js';
import { DatabaseService } from '../database/database.service';
import { formatearMoneda } from '../respuestas/formateador';

interface GastoCategoriaRow {
  categoria: string;
  total: string;
}

@Injectable()
export class ReportesService {
  private readonly logger = new Logger(ReportesService.name);

  constructor(private readonly db: DatabaseService) {}

  async obtenerGastosPorCategoriaMes(usuarioId: string): Promise<readonly { categoria: string; total: number }[]> {
    const ahora = new Date();
    const primerDia = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split('T')[0];

    const rows = await this.db.query<GastoCategoriaRow>(
      `SELECT c.nombre as categoria, SUM(t.monto) as total
       FROM transacciones t
       JOIN categorias c ON t.categoria_id = c.id
       WHERE t.usuario_id = $1 AND t.tipo = 'gasto' AND t.fecha >= $2
       GROUP BY c.nombre
       ORDER BY total DESC`,
      [usuarioId, primerDia],
    );

    return rows.map((r) => ({
      categoria: r.categoria,
      total: Number(r.total),
    }));
  }

  /**
   * Genera una gráfica de barras con los gastos por categoría del mes usando QuickChart
   */
  async generarUrlGraficaGastosMes(usuarioId: string): Promise<string | null> {
    const gastos = await this.obtenerGastosPorCategoriaMes(usuarioId);
    if (gastos.length === 0) {
      return null;
    }

    const labels = gastos.map((g) => g.categoria);
    const data = gastos.map((g) => g.total);

    const chart = new QuickChart();
    chart.setConfig({
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Gastos por Categoría ($ COP)',
            data,
            backgroundColor: 'rgba(54, 162, 235, 0.7)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Distribución de Gastos del Mes - Lukas' },
        },
      },
    });

    chart.setWidth(600);
    chart.setHeight(400);

    return chart.getUrl();
  }
}
