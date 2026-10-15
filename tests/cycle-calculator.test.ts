import { describe, it, expect } from 'vitest';
import { calcularCicloParaCompra, obtenerFechaValidaEnMes } from '../src/domain/cycle-calculator';

describe('cycle-calculator: Cálculo matemático del Hack a 1 cuota', () => {
  it('debe ajustar correctamente días que no existen en el mes (ej: 31 en noviembre -> 30)', () => {
    const fecha = obtenerFechaValidaEnMes(2026, 10, 31); // Noviembre es mes index 10
    expect(fecha.getDate()).toBe(30);
    expect(fecha.getMonth()).toBe(10);
  });

  it('debe ajustar correctamente febrero en año no bisiesto (2026)', () => {
    const fecha = obtenerFechaValidaEnMes(2026, 1, 31); // Febrero index 1
    expect(fecha.getDate()).toBe(28);
  });

  it('compra el día del corte: entra en el ciclo actual con ~20 días de gracia', () => {
    // Compra el 15 de Octubre de 2026
    const fechaCompra = new Date(2026, 9, 15, 12, 0, 0); // Octubre es index 9
    const diaCorte = 15;
    const diaPago = 5; // Paga el 5 del mes siguiente

    const ciclo = calcularCicloParaCompra(fechaCompra, diaCorte, diaPago);

    expect(ciclo.esVentanaOptima).toBe(false);
    expect(ciclo.fechaCorteCiclo.getDate()).toBe(15);
    expect(ciclo.fechaCorteCiclo.getMonth()).toBe(9); // Octubre
    expect(ciclo.fechaPagoCiclo.getDate()).toBe(5);
    expect(ciclo.fechaPagoCiclo.getMonth()).toBe(10); // Noviembre (paga el 5 de nov)
    expect(ciclo.diasHastaPago).toBe(22);
  });

  it('compra el día POSTERIOR al corte: ¡El Hack Dorado! Gana ~51 días libres de interés', () => {
    // Compra el 16 de Octubre de 2026 (1 día después del corte del 15)
    const fechaCompra = new Date(2026, 9, 16, 10, 0, 0);
    const diaCorte = 15;
    const diaPago = 5;

    const ciclo = calcularCicloParaCompra(fechaCompra, diaCorte, diaPago);

    // Entra en el corte de Noviembre y se paga el 5 de Diciembre
    expect(ciclo.esVentanaOptima).toBe(true);
    expect(ciclo.fechaCorteCiclo.getDate()).toBe(15);
    expect(ciclo.fechaCorteCiclo.getMonth()).toBe(10); // Noviembre
    expect(ciclo.fechaPagoCiclo.getDate()).toBe(5);
    expect(ciclo.fechaPagoCiclo.getMonth()).toBe(11); // Diciembre (paga el 5 de dic)
    expect(ciclo.diasHastaPago).toBeGreaterThanOrEqual(49);
    expect(ciclo.diasHastaPago).toBeLessThanOrEqual(52);
  });
});
