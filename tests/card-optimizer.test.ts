import { describe, it, expect } from 'vitest';
import { optimizarMejorTarjeta } from '../src/domain/card-optimizer';
import { Tarjeta } from '../src/domain/types';

describe('card-optimizer: Recomendador inteligente de la mejor tarjeta', () => {
  const tarjetasPrueba: readonly Tarjeta[] = [
    {
      id: 'card-1',
      usuarioId: 'user-1',
      nombre: 'Bancolombia Oro',
      banco: 'Bancolombia',
      diaCorte: 5,
      diaPago: 25,
      cupo: 5000000,
      cupoDisponible: 4500000,
      limiteCiclo: null,
      cobraInteresUnaCuota: false,
      aceptaCompras: true,
      esDefault: false,
      tieneCuotaManejo: true,
      valorCuotaManejo: 32000,
      tipoExoneracion: 'compras',
      metaExoneracion: 3,
      tasaInteresEa: 28.5,
      activa: true,
      creadoEn: new Date(),
    },
    {
      id: 'card-2',
      usuarioId: 'user-1',
      nombre: 'Nubank Mastercard',
      banco: 'Nu',
      diaCorte: 15,
      diaPago: 5,
      cupo: 3000000,
      cupoDisponible: 2800000,
      limiteCiclo: null,
      cobraInteresUnaCuota: false,
      aceptaCompras: true,
      esDefault: true,
      tieneCuotaManejo: false,
      valorCuotaManejo: 0,
      tipoExoneracion: 'siempre_exenta',
      metaExoneracion: 0,
      tasaInteresEa: 25.0,
      activa: true,
      creadoEn: new Date(),
    },
    {
      id: 'card-3',
      usuarioId: 'user-1',
      nombre: 'Falabella CMR',
      banco: 'Falabella',
      diaCorte: 25,
      diaPago: 15,
      cupo: 2000000,
      cupoDisponible: 200000, // Poco cupo disponible
      limiteCiclo: null,
      cobraInteresUnaCuota: false,
      aceptaCompras: true,
      esDefault: false,
      tieneCuotaManejo: false,
      valorCuotaManejo: 0,
      tipoExoneracion: 'ninguna',
      metaExoneracion: 0,
      tasaInteresEa: 32.0,
      activa: true,
      creadoEn: new Date(),
    },
  ];

  it('debe recomendar la tarjeta que da más días libres cuando compra post-corte (Nu tras corte del 15)', () => {
    // Fecha de compra: 16 de Octubre
    const fechaCompra = new Date(2026, 9, 16);
    const monto = 600000;

    const recomendaciones = optimizarMejorTarjeta(tarjetasPrueba, monto, fechaCompra);

    expect(recomendaciones.length).toBe(3);
    // La mejor tarjeta debe ser Nubank porque acaba de cortar el 15 y da ~50 días
    const mejor = recomendaciones[0];
    expect(mejor?.tarjeta.nombre).toBe('Nubank Mastercard');
    expect(mejor?.cumpleMonto).toBe(true);
    expect(mejor?.diasHastaPago).toBeGreaterThan(45);
  });

  it('debe descartar o penalizar tarjetas que no tienen cupo disponible suficiente', () => {
    const fechaCompra = new Date(2026, 9, 16);
    const monto = 1000000; // Falabella solo tiene 200.000 disponible

    const recomendaciones = optimizarMejorTarjeta(tarjetasPrueba, monto, fechaCompra);

    const falabellaRec = recomendaciones.find((r) => r.tarjeta.nombre === 'Falabella CMR');
    expect(falabellaRec?.cumpleMonto).toBe(false);
    expect(falabellaRec?.cupoDisponibleDespues).toBeLessThan(0);

    // Debe quedar de última opción
    expect(recomendaciones[recomendaciones.length - 1]?.tarjeta.nombre).toBe('Falabella CMR');
  });

  it('debe incluir la tasa de interés en el mensaje estratégico para evaluar compras a cuotas', () => {
    const fechaCompra = new Date(2026, 9, 16);
    const recomendaciones = optimizarMejorTarjeta(tarjetasPrueba, 200000, fechaCompra);
    const nu = recomendaciones.find((r) => r.tarjeta.nombre === 'Nubank Mastercard');
    expect(nu?.tasaInteresEa).toBe(25.0);
    expect(nu?.mensajeEstrategico).toContain('25% E.A.');
  });
});
