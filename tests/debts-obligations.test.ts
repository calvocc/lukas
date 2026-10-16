/**
 * ========================================================
 * Pruebas del Módulo de Créditos, Préstamos y Obligaciones
 * Valida extracción NLP, cálculo de amortización francesa,
 * flujo conversacional guiado y consultas de pasivos consolidados.
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanalRouterService } from '../src/canal/canal-router.service';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { ParserService } from '../src/parser/parser.service';
import { RespuestasService } from '../src/respuestas/respuestas.service';
import { MovimientosService } from '../src/movimientos/movimientos.service';
import { TarjetasService } from '../src/tarjetas/tarjetas.service';
import { CuentasService } from '../src/cuentas/cuentas.service';
import {
  ObligacionesService,
  calcularCuotaFrancesa,
  generarConsejoAceleracionDeuda,
} from '../src/obligaciones/obligaciones.service';
import { DatabaseService } from '../src/database/database.service';
import { extraerDetallesObligacion } from '../src/parser/parser.utils';
import { Usuario, Obligacion, Tarjeta } from '../src/domain/types';

describe('Módulo de Créditos y Obligaciones Financieras', () => {
  describe('1. Extracción de Datos NLP (extraerDetallesObligacion)', () => {
    it('extrae correctamente el caso del usuario: "credito de vehiculo por 80.000.000 a una tasa de 11 EA a 46 meses, la fecha de pago oportuno son los 2"', () => {
      const texto = 'credito de vehiculo por 80.000.000 a una tasa de 11 EA a 46 meses, la fecha de pago oportuno son los 2';
      const res = extraerDetallesObligacion(texto);

      expect(res.nombre).toContain('Crédito de Vehículo');
      expect(res.saldo).toBe(80000000);
      expect(res.tasaEa).toBe(11);
      expect(res.cuotasRestantes).toBe(46);
      expect(res.diaPago).toBe(2);
      expect(res.tipo).toBe('deuda');
    });

    it('extrae crédito de libre inversión con cuota explícita y tasa mensual', () => {
      const texto = 'préstamo libre inversión bancolombia por 20 millones a 36 meses tasa 1.5% mensual cuota 720000 pago oportuno los 15';
      const res = extraerDetallesObligacion(texto);

      expect(res.nombre).toContain('Libre Inversión');
      expect(res.entidad).toBe('Bancolombia');
      expect(res.saldo).toBe(20000000);
      expect(res.cuotasRestantes).toBe(36);
      expect(res.tasaMv).toBe(1.5);
      expect(res.cuota).toBe(720000);
      expect(res.diaPago).toBe(15);
    });

    it('extrae crédito hipotecario con entidad Sufi', () => {
      const texto = 'crédito hipotecario sufi saldo de 120 millones a 180 meses tasa 12.5% EA pago los 5';
      const res = extraerDetallesObligacion(texto);

      expect(res.nombre).toContain('Hipotecario');
      expect(res.entidad).toBe('Sufi (Bancolombia)');
      expect(res.saldo).toBe(120000000);
      expect(res.cuotasRestantes).toBe(180);
      expect(res.tasaEa).toBe(12.5);
      expect(res.diaPago).toBe(5);
    });
  });

  describe('2. Cálculo Matemático de Amortización Francesa y Consejos', () => {
    it('calcula la cuota mensual exacta para 80 millones a 11% EA en 46 meses (~$2.118.167)', () => {
      const cuota = calcularCuotaFrancesa(80000000, 11, null, 46);
      // $80.000.000 al 11% EA da tasa mes de ~0.873459%, cuota ≈ $2.118.167
      expect(cuota).toBeGreaterThan(2115000);
      expect(cuota).toBeLessThan(2125000);
    });

    it('calcula cuota mensual con tasa mensual vencida (M.V.)', () => {
      // 10 millones a 1.5% MV en 12 meses
      const cuota = calcularCuotaFrancesa(10000000, null, 1.5, 12);
      // Formula C = 10.000.000 * (0.015 * 1.015^12)/(1.015^12 - 1) ≈ 916.799
      expect(cuota).toBeGreaterThan(910000);
      expect(cuota).toBeLessThan(925000);
    });

    it('genera consejo de aceleración con abono inteligente a capital', () => {
      const consejo = generarConsejoAceleracionDeuda(80000000, 11, 46, 2118167);
      expect(consejo).toBeDefined();
      expect(consejo).toContain('El Método Lukas para pagar más rápido');
      expect(consejo).toContain('abono a capital recurrente');
      expect(consejo).toContain('meses antes');
      expect(consejo).toContain('intereses bancarios');
    });
  });

  describe('3. Flujo E2E en CanalRouterService', () => {
    let router: CanalRouterService;
    let usuariosServiceMock: Partial<UsuariosService>;
    let parserServiceMock: Partial<ParserService>;
    let respuestasService: RespuestasService;
    let movimientosServiceMock: Partial<MovimientosService>;
    let tarjetasServiceMock: Partial<TarjetasService>;
    let cuentasServiceMock: Partial<CuentasService>;
    let obligacionesServiceMock: Partial<ObligacionesService>;
    let dbMock: Partial<DatabaseService>;

    const usuarioActivo: Usuario = {
      id: 'user-777',
      numeroWhatsapp: '+573001234567',
      nombre: 'Mateo',
      estado: 'activo',
      aceptoDatosEn: new Date(),
      zonaHoraria: 'America/Bogota',
      horaRecordatorios: '08:00',
      medioPagoDefault: 'tarjeta',
      tonoPreferido: 'casual',
      plan: 'gratis',
      limiteGastoMensual: 4000000,
      ultimaTransaccionId: null,
      creadoEn: new Date(),
    };

    const obligacionesGuardadas: Obligacion[] = [];

    beforeEach(() => {
      obligacionesGuardadas.length = 0;
      respuestasService = new RespuestasService();

      usuariosServiceMock = {
        buscarPorNumero: vi.fn().mockResolvedValue(usuarioActivo),
      };

      parserServiceMock = {
        interpretar: vi.fn().mockImplementation(async (texto: string) => {
          const lower = texto.toLowerCase();
          if (lower.includes('mis deudas') || lower.includes('cuanto debo') || lower.includes('cuánto debo')) {
            return {
              intencion: 'consulta',
              tonoDetectado: 'casual',
              consulta: {
                tipoConsulta: 'deudas',
                periodo: 'mes',
                categoriaConsulta: null,
                tarjeta: null,
                montoSimulado: null,
              },
            };
          }
          if (lower.includes('credito') || lower.includes('crédito') || lower.includes('deuda')) {
            const detalles = extraerDetallesObligacion(texto);
            return {
              intencion: 'config_obligacion',
              tonoDetectado: 'casual',
              configObligacion: detalles,
            };
          }
          return { intencion: 'no_entendido', tonoDetectado: 'neutro' };
        }),
      };

      movimientosServiceMock = {
        obtenerUltimaTransaccion: vi.fn().mockResolvedValue(null),
        calcularGastoMesActual: vi.fn().mockResolvedValue(0),
      };

      tarjetasServiceMock = {
        listarPorUsuario: vi.fn().mockResolvedValue([]),
        eliminarTarjetasIncompletas: vi.fn().mockResolvedValue(0),
      };

      cuentasServiceMock = {
        listarPorUsuario: vi.fn().mockResolvedValue([]),
      };

      obligacionesServiceMock = {
        listarPorUsuario: vi.fn().mockImplementation(async () => obligacionesGuardadas),
        crear: vi.fn().mockImplementation(async (usuarioId: string, datos: Partial<Obligacion>) => {
          const cuotaCalculada =
            datos.cuota ??
            calcularCuotaFrancesa(
              datos.saldo ?? 0,
              datos.tasaEa ?? null,
              datos.tasaMv ?? null,
              datos.cuotasRestantes ?? 12,
            );

          const nueva: Obligacion = {
            id: `ob-${obligacionesGuardadas.length + 1}`,
            usuarioId,
            nombre: datos.nombre ?? 'Crédito',
            tipo: datos.tipo ?? 'deuda',
            entidad: datos.entidad ?? null,
            saldo: datos.saldo ?? 0,
            tasaEa: datos.tasaEa ?? null,
            tasaMv: datos.tasaMv ?? null,
            cuota: cuotaCalculada,
            cuotasRestantes: datos.cuotasRestantes ?? 12,
            cuotasTotales: datos.cuotasTotales ?? datos.cuotasRestantes ?? 12,
            diaPago: datos.diaPago ?? 5,
            activa: true,
            creadoEn: new Date(),
          };
          obligacionesGuardadas.push(nueva);
          return nueva;
        }),
      };

      dbMock = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        execute: vi.fn().mockResolvedValue(1),
      };

      router = new CanalRouterService(
        usuariosServiceMock as UsuariosService,
        parserServiceMock as ParserService,
        respuestasService,
        movimientosServiceMock as MovimientosService,
        tarjetasServiceMock as TarjetasService,
        cuentasServiceMock as CuentasService,
        obligacionesServiceMock as ObligacionesService,
        dbMock as DatabaseService,
      );
    });

    it('registra directamente un crédito vehicular completo en un solo mensaje y programa recordatorios', async () => {
      const mensaje = 'credito de vehiculo por 80.000.000 a una tasa de 11 EA a 46 meses, la fecha de pago oportuno son los 2';
      const respuesta = await router.procesarMensaje('+573001234567', mensaje);

      expect(obligacionesGuardadas.length).toBe(1);
      const guardada = obligacionesGuardadas[0];
      expect(guardada).toBeDefined();
      if (!guardada) return;

      expect(guardada.nombre).toContain('Crédito de Vehículo');
      expect(guardada.saldo).toBe(80000000);
      expect(guardada.tasaEa).toBe(11);
      expect(guardada.cuotasRestantes).toBe(46);
      expect(guardada.diaPago).toBe(2);
      expect(guardada.cuota).toBeGreaterThan(2115000);

      // La respuesta debe celebrar, mostrar saldo, cuota y la fecha de pago oportuno
      expect(respuesta).toContain('¡Compromiso financiero registrado con éxito!');
      expect(respuesta).toContain('$80.000.000');
      expect(respuesta).toContain('11% E.A.');
      expect(respuesta).toContain('46 meses');
      expect(respuesta).toContain('Día 2');
      expect(respuesta).toContain('El Método Lukas para pagar más rápido');
    });

    it('ejecuta el flujo conversacional guiado cuando la información es incompleta', async () => {
      // 1. Mensaje inicial sin datos
      const resPaso1 = await router.procesarMensaje('+573001234567', 'quiero registrar un crédito');
      expect(resPaso1).toContain('¿Cuál es el *tipo o nombre del crédito y entidad*?');

      // 2. Proporciona nombre
      const resPaso2 = await router.procesarMensaje('+573001234567', 'Crédito de Vehículo Sufi');
      expect(resPaso2).toContain('¿Cuál es el *saldo pendiente o monto total del crédito*?');

      // 3. Proporciona saldo
      const resPaso3 = await router.procesarMensaje('+573001234567', '80 millones');
      expect(resPaso3).toContain('¿A cuántos *meses o cuotas pendientes* está el crédito?');

      // 4. Proporciona cuotas
      const resPaso4 = await router.procesarMensaje('+573001234567', '46 meses');
      expect(resPaso4).toContain('¿Cuál es la *tasa de interés del crédito*?');

      // 5. Proporciona tasa
      const resPaso5 = await router.procesarMensaje('+573001234567', '11% EA');
      expect(resPaso5).toContain('¿qué *día del mes es tu fecha de pago oportuno*?');

      // 6. Proporciona día de pago oportuno
      const resPaso6 = await router.procesarMensaje('+573001234567', 'los 2 de cada mes');
      expect(resPaso6).toContain('¡Compromiso financiero registrado con éxito!');
      expect(resPaso6).toContain('Crédito Vehículo Sufi');
      expect(resPaso6).toContain('$80.000.000');
      expect(resPaso6).toContain('Día 2');
      expect(obligacionesGuardadas.length).toBe(1);
    });

    it('permite cancelar el registro de crédito en cualquier momento', async () => {
      const resPaso1 = await router.procesarMensaje('+573001234567', 'registrar un crédito');
      expect(resPaso1).toContain('¿Cuál es el *tipo o nombre del crédito y entidad*?');

      const resCancel = await router.procesarMensaje('+573001234567', 'cancelar');
      expect(resCancel).toContain('Cancelé el registro del crédito');
      expect(obligacionesGuardadas.length).toBe(0);
    });

    it('muestra el resumen consolidado de pasivos cuando el usuario consulta sus deudas', async () => {
      // Registrar primero una obligación
      await router.procesarMensaje(
        '+573001234567',
        'credito de vehiculo por 80.000.000 a una tasa de 11 EA a 46 meses, la fecha de pago oportuno son los 2',
      );

      // Simular que tiene una tarjeta con uso de $4.000.000
      const tarjetaConUso: Tarjeta = {
        id: 't-1',
        usuarioId: 'user-777',
        nombre: 'Diners Davivienda',
        banco: 'Davivienda',
        cupo: 14000000,
        cupoDisponible: 10000000,
        limiteCiclo: null,
        tasaInteresEa: 28.0,
        diaCorte: 20,
        diaPago: 5,
        aceptaCompras: true,
        cobraInteresUnaCuota: false,
        tieneCuotaManejo: false,
        valorCuotaManejo: 0,
        tipoExoneracion: 'ninguna',
        metaExoneracion: 0,
        activa: true,
        esDefault: true,
        creadoEn: new Date(),
      };
      tarjetasServiceMock.listarPorUsuario = vi.fn().mockResolvedValue([tarjetaConUso]);

      const resDeudas = await router.procesarMensaje('+573001234567', 'mis deudas');
      expect(resDeudas).toContain('Resumen de tus Cuentas y Deudas');
      expect(resDeudas).toContain('Crédito de Vehículo');
      expect(resDeudas).toContain('$80.000.000');
      expect(resDeudas).toContain('Diners Davivienda');
      expect(resDeudas).toContain('$4.000.000');
      expect(resDeudas).toContain('*Total Pasivos / Deuda Consolidada:* *$84.000.000*');
    });
  });
});
