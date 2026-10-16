/**
 * ========================================================
 * Pruebas de Tipos de Consulta para Lukas
 * Valida la detección y ruteo de:
 * - tarjetas (listar tarjetas registradas)
 * - saldo (cupo disponible / usado)
 * - ciclo_tarjeta (fechas de corte y pago)
 * - total_periodo (hoy, semana, mes, mes pasado)
 * - total_categoria (comida, transporte, etc.)
 * - deudas (resumen de deudas fijas y saldos de tarjeta)
 * - balance / resumen
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { describe, it, expect } from 'vitest';
import { OpenAiProvider } from '../src/parser/openai.provider';
import { ContextoMensaje } from '../src/parser/parser.interface';

describe('Pruebas de Clasificación de Consultas Lukas', () => {
  const provider = new OpenAiProvider();

  const contexto: ContextoMensaje = {
    fechaActual: '2026-10-15',
    tarjetasActivas: [
      { id: '1', nombre: 'Diners Club', banco: 'Davivienda' },
      { id: '2', nombre: 'Gold', banco: 'Bancolombia' },
      { id: '3', nombre: 'Nu', banco: 'Nubank' },
    ],
    obligacionesActivas: [
      { id: '1', nombre: 'Crédito Vehículo' },
    ],
    ultimaTransaccion: null,
  };

  it('Debe identificar consulta tipo "tarjetas" para listar tarjetas registradas', () => {
    const mensajes = [
      'muestrame mis tarjetas',
      'muestrame las tarjetas que tengo registradas',
      'qué tarjetas tengo',
      'mis tarjetas',
      'ver tarjetas',
      'tarjetas registradas',
    ];

    for (const m of mensajes) {
      const res = provider.interpretarFallback(m, contexto);
      expect(res.intencion).toBe('consulta');
      expect(res.consulta?.tipoConsulta).toBe('tarjetas');
    }
  });

  it('Debe identificar consulta tipo "saldo" con o sin tarjeta específica', () => {
    const r1 = provider.interpretarFallback('cuánto cupo tengo en la diners', contexto);
    expect(r1.intencion).toBe('consulta');
    expect(r1.consulta?.tipoConsulta).toBe('saldo');
    expect(r1.consulta?.tarjeta).toBe('Diners Club');

    const r2 = provider.interpretarFallback('cuánto me queda de saldo', contexto);
    expect(r2.intencion).toBe('consulta');
    expect(r2.consulta?.tipoConsulta).toBe('saldo');
  });

  it('Debe identificar consulta tipo "ciclo_tarjeta" (fechas de corte y pago)', () => {
    const r1 = provider.interpretarFallback('cuándo corta la nu', contexto);
    expect(r1.intencion).toBe('consulta');
    expect(r1.consulta?.tipoConsulta).toBe('ciclo_tarjeta');
    expect(r1.consulta?.tarjeta).toBe('Nu');

    const r2 = provider.interpretarFallback('fechas de corte', contexto);
    expect(r2.intencion).toBe('consulta');
    expect(r2.consulta?.tipoConsulta).toBe('ciclo_tarjeta');
  });

  it('Debe identificar consulta tipo "total_periodo" (hoy, semana, mes_pasado)', () => {
    const rHoy = provider.interpretarFallback('cuánto he gastado hoy', contexto);
    expect(rHoy.intencion).toBe('consulta');
    expect(rHoy.consulta?.tipoConsulta).toBe('total_periodo');
    expect(rHoy.consulta?.periodo).toBe('hoy');

    const rSemana = provider.interpretarFallback('gastos de esta semana', contexto);
    expect(rSemana.intencion).toBe('consulta');
    expect(rSemana.consulta?.tipoConsulta).toBe('total_periodo');
    expect(rSemana.consulta?.periodo).toBe('semana');

    const rMesPasado = provider.interpretarFallback('cuánto gasté el mes pasado', contexto);
    expect(rMesPasado.intencion).toBe('consulta');
    expect(rMesPasado.consulta?.tipoConsulta).toBe('total_periodo');
    expect(rMesPasado.consulta?.periodo).toBe('mes_pasado');
  });

  it('Debe identificar consulta tipo "total_categoria"', () => {
    const rComida = provider.interpretarFallback('cuánto he gastado en comida este mes', contexto);
    expect(rComida.intencion).toBe('consulta');
    expect(rComida.consulta?.tipoConsulta).toBe('total_categoria');
    expect(rComida.consulta?.categoriaConsulta).toBe('Comida');

    const rTrans = provider.interpretarFallback('cuánto he gastado en transporte', contexto);
    expect(rTrans.intencion).toBe('consulta');
    expect(rTrans.consulta?.tipoConsulta).toBe('total_categoria');
    expect(rTrans.consulta?.categoriaConsulta).toBe('Transporte');
  });

  it('Debe identificar consulta tipo "deudas" y "resumen"', () => {
    const rDeudas = provider.interpretarFallback('cuánto debo en total', contexto);
    expect(rDeudas.intencion).toBe('consulta');
    expect(rDeudas.consulta?.tipoConsulta).toBe('deudas');

    const rResumen = provider.interpretarFallback('cómo voy este mes', contexto);
    expect(rResumen.intencion).toBe('consulta');
    expect(rResumen.consulta?.tipoConsulta).toBe('resumen');
  });
});
