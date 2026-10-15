/**
 * ========================================================
 * Pruebas Unitarias para Utilidades del Parser Colombiano
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { describe, it, expect } from 'vitest';
import { extraerMontoColombiano, extraerDetallesTarjeta } from '../src/parser/parser.utils';

describe('Utilidades del Parser: Moneda y Tarjetas en Colombia', () => {
  describe('extraerMontoColombiano', () => {
    it('extrae montos con puntos de miles (ej: 14.000.000, 85.000)', () => {
      expect(extraerMontoColombiano('14.000.000')).toBe(14000000);
      expect(extraerMontoColombiano('$14.000.000')).toBe(14000000);
      expect(extraerMontoColombiano('85.000')).toBe(85000);
      expect(extraerMontoColombiano('1.500.000')).toBe(1500000);
    });

    it('extrae montos con comillas o apostrofes (ej: 14\'000.000)', () => {
      expect(extraerMontoColombiano("14'000.000")).toBe(14000000);
    });

    it('extrae montos expresados con "millones" o "m"', () => {
      expect(extraerMontoColombiano('14 millones')).toBe(14000000);
      expect(extraerMontoColombiano('14.5 millones')).toBe(14500000);
      expect(extraerMontoColombiano('14m')).toBe(14000000);
      expect(extraerMontoColombiano('3 mill')).toBe(3000000);
    });

    it('extrae montos expresados con "mil" o "k"', () => {
      expect(extraerMontoColombiano('500 mil')).toBe(500000);
      expect(extraerMontoColombiano('85k')).toBe(85000);
    });

    it('extrae enteros directos', () => {
      expect(extraerMontoColombiano('14000000')).toBe(14000000);
      expect(extraerMontoColombiano('85000')).toBe(85000);
    });
  });

  describe('extraerDetallesTarjeta', () => {
    it('extrae tarjeta con typo "dinner" y banco Davivienda con puntos en el cupo', () => {
      const res = extraerDetallesTarjeta('registar tarjeta dinner davivienda cupo de 14.000.000 corte los 20 pago los 5');
      expect(res.nombre).toBe('Diners Club Davivienda');
      expect(res.banco).toBe('Davivienda');
      expect(res.cupo).toBe(14000000);
      expect(res.diaCorte).toBe(20);
      expect(res.diaPago).toBe(5);
    });

    it('extrae tarjeta Nu con corte y pago', () => {
      const res = extraerDetallesTarjeta('registrar tarjeta Nu cupo 3 millones corte 15 pago 5');
      expect(res.banco).toBe('Nubank');
      expect(res.nombre).toBe('Nubank');
      expect(res.cupo).toBe(3000000);
      expect(res.diaCorte).toBe(15);
      expect(res.diaPago).toBe(5);
    });

    it('extrae tarjeta Falabella CMR con cupo y fechas', () => {
      const res = extraerDetallesTarjeta('nueva tarjeta cmr falabella cupo 5.500.000 corte 10 pago 25');
      expect(res.banco).toBe('Falabella');
      expect(res.cupo).toBe(5500000);
      expect(res.diaCorte).toBe(10);
      expect(res.diaPago).toBe(25);
    });

    it('extrae tarjeta Visa Gold Bancolombia', () => {
      const res = extraerDetallesTarjeta('agregar tarjeta visa gold bancolombia cupo 8 millones corte 18 pago 2');
      expect(res.banco).toBe('Bancolombia');
      expect(res.nombre).toBe('Visa Gold Bancolombia');
      expect(res.cupo).toBe(8000000);
      expect(res.diaCorte).toBe(18);
      expect(res.diaPago).toBe(2);
    });
  });
});
