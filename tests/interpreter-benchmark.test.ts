/**
 * ========================================================
 * Set de Pruebas del Intérprete (Benchmark de Mensajes Reales)
 * Especificación: valida que el Intérprete extraiga el JSON esperado
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { describe, it, expect } from 'vitest';
import { OpenAiProvider } from '../src/parser/openai.provider';
import { ContextoMensaje } from '../src/parser/parser.interface';
import { LukasConfigService } from '../src/config/config.service';

describe('Set de Pruebas del Intérprete: Mensajes Reales en Español Colombiano', () => {
  const config = new LukasConfigService();
  const provider = new OpenAiProvider(config);

  const contexto: ContextoMensaje = {
    fechaActual: '2026-10-15',
    tarjetasActivas: [
      { id: 'c-1', nombre: 'Nubank', banco: 'Nu' },
      { id: 'c-2', nombre: 'Bancolombia Gold', banco: 'Bancolombia' },
      { id: 'c-3', nombre: 'Falabella CMR', banco: 'Falabella' },
    ],
    obligacionesActivas: [
      { id: 'o-1', nombre: 'Kona' },
      { id: 'o-2', nombre: 'Arriendo' },
    ],
    ultimaTransaccion: null,
  };

  // Categoría 1: Registros de Gastos
  describe('1. Registros de Gastos e Ingresos', () => {
    it('"85000 mercado en efectivo" -> Gasto comida efectivo', async () => {
      const res = await provider.interpretar('85000 mercado en efectivo', contexto);
      expect(res.intencion).toBe('registro');
      expect(res.transacciones?.[0]?.monto).toBe(85000);
      expect(res.transacciones?.[0]?.tipo).toBe('gasto');
    });

    it('"120000 gasolina nu a 1 cuota" -> Gasto transporte tarjeta Nu', async () => {
      const res = await provider.interpretar('120000 gasolina nu a 1 cuota', contexto);
      expect(res.intencion).toBe('registro');
      expect(res.transacciones?.[0]?.monto).toBe(120000);
      expect(res.transacciones?.[0]?.cuotas).toBe(1);
    });

    it('"500000 pasajes gold a 24 cuotas" -> Gasto con 24 cuotas', async () => {
      const res = await provider.interpretar('500000 pasajes gold a 24 cuotas', contexto);
      expect(res.intencion).toBe('registro');
      expect(res.transacciones?.[0]?.monto).toBe(500000);
      expect(res.transacciones?.[0]?.cuotas).toBe(24);
    });

    it('"me pagaron 9500000" -> Ingreso', async () => {
      const res = await provider.interpretar('me pagaron 9500000', contexto);
      expect(res.intencion).toBe('registro');
      expect(res.transacciones?.[0]?.tipo).toBe('ingreso');
      expect(res.transacciones?.[0]?.monto).toBe(9500000);
    });
  });

  // Categoría 2: Consultas y El Método Lukas
  describe('2. Consultas y Recomendaciones', () => {
    it('"¿Qué tarjeta uso hoy para 600 mil?" -> Consulta mejor_tarjeta con monto 600.000', async () => {
      const res = await provider.interpretar('¿Qué tarjeta uso hoy para 600 mil?', contexto);
      expect(res.intencion).toBe('consulta');
      expect(res.consulta?.tipoConsulta).toBe('mejor_tarjeta');
      expect(res.consulta?.montoSimulado).toBe(600000);
    });

    it('"¿Cuánto debo en total?" -> Consulta deudas', async () => {
      const res = await provider.interpretar('¿Cuánto debo en total?', contexto);
      expect(res.intencion).toBe('consulta');
      expect(res.consulta?.tipoConsulta).toBe('deudas');
    });

    it('"¿Cómo voy este mes?" -> Consulta resumen', async () => {
      const res = await provider.interpretar('¿Cómo voy este mes?', contexto);
      expect(res.intencion).toBe('consulta');
      expect(res.consulta?.tipoConsulta).toBe('resumen');
    });
  });

  // Categoría 3: Pagos de Tarjetas y Obligaciones
  describe('3. Pagos de Tarjetas y Obligaciones', () => {
    it('"ya pagué la gold" -> Pago tarjeta Bancolombia Gold', async () => {
      const res = await provider.interpretar('ya pagué la gold', contexto);
      expect(res.intencion).toBe('pago_tarjeta');
      expect(res.pagoTarjeta?.tarjeta).toBe('Bancolombia Gold');
    });

    it('"ya pagué nu" -> Pago tarjeta Nubank', async () => {
      const res = await provider.interpretar('ya pagué nu', contexto);
      expect(res.intencion).toBe('pago_tarjeta');
      expect(res.pagoTarjeta?.tarjeta).toBe('Nubank');
    });

    it('"pagué la cuota del kona" -> Pago obligación Kona', async () => {
      const res = await provider.interpretar('pagué la cuota del kona', contexto);
      expect(res.intencion).toBe('pago_obligacion');
      expect(res.pagoObligacion?.obligacion).toBe('Kona');
    });
  });

  // Categoría 4: Correcciones, Eliminación y Presupuesto
  describe('4. Corrección, Eliminación y Configuración', () => {
    it('"borra el último" -> Eliminación', async () => {
      const res = await provider.interpretar('borra el último', contexto);
      expect(res.intencion).toBe('eliminacion');
    });

    it('"ya pasé la de amazon a 1 cuota" -> Corrección cuotas', async () => {
      const res = await provider.interpretar('ya pasé la de amazon a 1 cuota', contexto);
      expect(res.intencion).toBe('correccion');
      expect(res.correccionCuotas?.nuevasCuotas).toBe(1);
    });

    it('"mi presupuesto este mes es 3 millones" -> Config presupuesto 3.000.000', async () => {
      const res = await provider.interpretar('mi presupuesto este mes es 3 millones', contexto);
      expect(res.intencion).toBe('config_presupuesto');
      expect(res.configPresupuesto?.limiteGastoMensual).toBe(3000000);
    });

    it('"ayuda" -> Intención ayuda', async () => {
      const res = await provider.interpretar('ayuda', contexto);
      expect(res.intencion).toBe('ayuda');
    });
  });

  // Categoría 5: Tarjetas y Formatos Colombianos (Casos Reales Reportados)
  describe('5. Registro y Consulta de Tarjetas con Formatos Colombianos', () => {
    it('"registar tarjeta dinner davivienda cupo de 14.000.000 corte los 20 pago los 5" -> config_tarjeta con 14 millones, corte 20 y pago 5', async () => {
      const res = await provider.interpretar(
        'registar tarjeta dinner davivienda cupo de 14.000.000 corte los 20 pago los 5',
        contexto,
      );
      expect(res.intencion).toBe('config_tarjeta');
      expect(res.configTarjeta?.cupo).toBe(14000000);
      expect(res.configTarjeta?.diaCorte).toBe(20);
      expect(res.configTarjeta?.diaPago).toBe(5);
      expect(res.configTarjeta?.banco).toBe('Davivienda');
      expect(res.configTarjeta?.nombre).toContain('Diners');
    });

    it('"muestrame las tarjetas que tengo registradas" -> Consulta tipo tarjetas', async () => {
      const res = await provider.interpretar('muestrame las tarjetas que tengo registradas', contexto);
      expect(res.intencion).toBe('consulta');
      expect(res.consulta?.tipoConsulta).toBe('tarjetas');
    });

    it('"mis tarjetas" -> Consulta tipo tarjetas', async () => {
      const res = await provider.interpretar('mis tarjetas', contexto);
      expect(res.intencion).toBe('consulta');
      expect(res.consulta?.tipoConsulta).toBe('tarjetas');
    });

    it('"hola me indicas que tarjetas tengo registradas/" -> Consulta tipo tarjetas', async () => {
      const res = await provider.interpretar('hola me indicas que tarjetas tengo registradas/', contexto);
      expect(res.intencion).toBe('consulta');
      expect(res.consulta?.tipoConsulta).toBe('tarjetas');
    });

    it('"registremos una tarjeta" -> Intención config_tarjeta', async () => {
      const res = await provider.interpretar('registremos una tarjeta', contexto);
      expect(res.intencion).toBe('config_tarjeta');
    });

    it('"85.000 mercado en efectivo" -> Gasto comida $85.000 respetando puntos de miles', async () => {
      const res = await provider.interpretar('85.000 mercado en efectivo', contexto);
      expect(res.intencion).toBe('registro');
      expect(res.transacciones?.[0]?.monto).toBe(85000);
    });
  });
});
