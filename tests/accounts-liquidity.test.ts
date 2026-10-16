/**
 * ========================================================
 * Pruebas de Cuentas de Débito, Ahorros, Billeteras y Efectivo
 * Verifica:
 * 1. Interpretación de intenciones config_cuenta (débito, ahorros, billeteras, efectivo).
 * 2. Registro de cuentas de liquidez y confirmaciones conversacionales.
 * 3. Débito / abono automático de saldo según ingresos y gastos.
 * 4. Consulta integral de saldo (Liquidez disponible, Deuda en tarjetas, Balance neto).
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAiProvider } from '../src/parser/openai.provider';
import { CanalRouterService } from '../src/canal/canal-router.service';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { ParserService } from '../src/parser/parser.service';
import { RespuestasService } from '../src/respuestas/respuestas.service';
import { MovimientosService } from '../src/movimientos/movimientos.service';
import { TarjetasService } from '../src/tarjetas/tarjetas.service';
import { CuentasService } from '../src/cuentas/cuentas.service';
import { ObligacionesService } from '../src/obligaciones/obligaciones.service';
import { DatabaseService } from '../src/database/database.service';
import { Usuario, Tarjeta, Transaccion, Cuenta } from '../src/domain/types';
import { ContextoMensaje } from '../src/parser/parser.interface';

describe('Gestión de Cuentas de Liquidez (Débito, Billeteras, Efectivo)', () => {
  describe('OpenAiProvider (Fallback Regex y Heurístico)', () => {
    const provider = new OpenAiProvider();
    const contextoBase: ContextoMensaje = {
      fechaActual: '2026-10-16',
      tarjetasActivas: [],
      cuentasActivas: [],
      obligacionesActivas: [],
      ultimaTransaccion: null,
    };

    it('debe interpretar "registrar tarjeta débito Bancolombia con saldo de 2 millones"', () => {
      const res = provider.interpretarFallback(
        'registrar tarjeta débito Bancolombia con saldo de 2 millones',
        contextoBase,
      );
      expect(res.intencion).toBe('config_cuenta');
      expect(res.configCuenta?.tipo).toBe('debito');
      expect(res.configCuenta?.banco).toBe('Bancolombia');
      expect(res.configCuenta?.saldo).toBe(2000000);
    });

    it('debe interpretar "tengo 500 mil en nequi" como billetera', () => {
      const res = provider.interpretarFallback(
        'tengo 500 mil en nequi',
        contextoBase,
      );
      expect(res.intencion).toBe('config_cuenta');
      expect(res.configCuenta?.tipo).toBe('billetera');
      expect(res.configCuenta?.nombre).toBe('Nequi');
      expect(res.configCuenta?.saldo).toBe(500000);
    });

    it('debe interpretar "tengo 150 mil en efectivo" como cuenta de efectivo', () => {
      const res = provider.interpretarFallback(
        'tengo 150 mil en efectivo',
        contextoBase,
      );
      expect(res.intencion).toBe('config_cuenta');
      expect(res.configCuenta?.tipo).toBe('efectivo');
      expect(res.configCuenta?.nombre).toBe('Efectivo');
      expect(res.configCuenta?.saldo).toBe(150000);
    });

    it('debe interpretar "abrí cuenta de ahorros Davivienda con saldo de 1.500.000"', () => {
      const res = provider.interpretarFallback(
        'abrí cuenta de ahorros Davivienda con saldo de 1.500.000',
        contextoBase,
      );
      expect(res.intencion).toBe('config_cuenta');
      expect(res.configCuenta?.tipo).toBe('ahorros');
      expect(res.configCuenta?.banco).toBe('Davivienda');
      expect(res.configCuenta?.saldo).toBe(1500000);
    });
  });

  describe('Integración en CanalRouterService', () => {
    let router: CanalRouterService;
    let cuentasGuardadas: Cuenta[] = [];
    let transaccionesRegistradas: Transaccion[] = [];

    const usuario: Usuario = {
      id: 'usr-liquidity-1',
      numeroWhatsapp: '+573112223344',
      nombre: 'Andrés',
      estado: 'activo',
      aceptoDatosEn: new Date(),
      zonaHoraria: 'America/Bogota',
      horaRecordatorios: '08:00',
      medioPagoDefault: 'efectivo',
      tonoPreferido: 'casual',
      plan: 'gratis',
      limiteGastoMensual: 5000000,
      ultimaTransaccionId: null,
      creadoEn: new Date(),
    };

    const tarjetaCreditoNu: Tarjeta = {
      id: 'tc-nu-1',
      usuarioId: 'usr-liquidity-1',
      nombre: 'Tarjeta Nu',
      banco: 'Nubank',
      diaCorte: 15,
      diaPago: 5,
      cupo: 4000000,
      cupoDisponible: 3200000, // debe 800.000
      limiteCiclo: null,
      cobraInteresUnaCuota: false,
      aceptaCompras: true,
      esDefault: true,
      tieneCuotaManejo: false,
      valorCuotaManejo: 0,
      tipoExoneracion: 'ninguna',
      metaExoneracion: 0,
      tasaInteresEa: 27.5,
      activa: true,
      creadoEn: new Date(),
    };

    beforeEach(() => {
      cuentasGuardadas = [
        {
          id: 'acc-bancolombia-1',
          usuarioId: 'usr-liquidity-1',
          nombre: 'Bancolombia Débito',
          tipo: 'debito',
          banco: 'Bancolombia',
          saldo: 2000000,
          moneda: 'COP',
          esDefault: true,
          activa: true,
          creadoEn: new Date(),
          actualizadaEn: new Date(),
        },
        {
          id: 'acc-nequi-1',
          usuarioId: 'usr-liquidity-1',
          nombre: 'Nequi',
          tipo: 'billetera',
          banco: 'Bancolombia',
          saldo: 450000,
          moneda: 'COP',
          esDefault: false,
          activa: true,
          creadoEn: new Date(),
          actualizadaEn: new Date(),
        },
      ];
      transaccionesRegistradas = [];

      const usuariosServiceMock: Partial<UsuariosService> = {
        buscarPorNumero: vi.fn().mockResolvedValue(usuario),
      };

      const openAiProvider = new OpenAiProvider();
      const parserServiceMock: Partial<ParserService> = {
        interpretar: vi.fn().mockImplementation((texto: string, contexto: ContextoMensaje) => {
          return Promise.resolve(openAiProvider.interpretarFallback(texto, contexto));
        }),
      };

      const respuestasService = new RespuestasService();

      const movimientosServiceMock: Partial<MovimientosService> = {
        obtenerUltimaTransaccion: vi.fn().mockResolvedValue(null),
        calcularGastoMesActual: vi.fn().mockResolvedValue(45000),
        calcularGastoPeriodo: vi.fn().mockResolvedValue(45000),
        listarTransaccionesPeriodo: vi.fn().mockResolvedValue([]),
        registrar: vi.fn().mockImplementation((_uid: string, datos: {
          monto: number;
          descripcion: string | null;
          cuotas: number;
          medioPago: 'tarjeta' | 'efectivo' | 'transferencia' | 'debito';
          tarjetaId: string | null;
          cuentaId?: string | null;
          tipo?: 'gasto' | 'ingreso';
        }) => {
          const t: Transaccion = {
            id: `tx-${Date.now()}`,
            usuarioId: 'usr-liquidity-1',
            tipo: datos.tipo ?? 'gasto',
            monto: datos.monto,
            categoriaId: 'cat-alimentacion',
            categoriaConfianza: 'alta',
            descripcion: datos.descripcion,
            medioPago: datos.medioPago,
            tarjetaId: datos.tarjetaId,
            cuentaId: datos.cuentaId ?? null,
            cuotas: datos.cuotas,
            cuotasOriginales: datos.cuotas,
            pendienteRediferir: false,
            fecha: '2026-10-16',
            creadoEn: new Date(),
          };
          transaccionesRegistradas.push(t);
          return Promise.resolve(t);
        }),
      };

      const tarjetasServiceMock: Partial<TarjetasService> = {
        listarPorUsuario: vi.fn().mockResolvedValue([tarjetaCreditoNu]),
        eliminarTarjetasIncompletas: vi.fn().mockResolvedValue(0),
        buscarPorNombreOAlias: vi.fn().mockResolvedValue(null),
        buscarPorId: vi.fn().mockResolvedValue(tarjetaCreditoNu),
      };

      const cuentasServiceMock: Partial<CuentasService> = {
        listarPorUsuario: vi.fn().mockImplementation(async () => cuentasGuardadas),
        buscarPorId: vi.fn().mockImplementation(async (id: string) => cuentasGuardadas.find(c => c.id === id) ?? null),
        buscarPorNombreOAlias: vi.fn().mockImplementation(async (_uId: string, nombreOAlias: string) => {
          const lower = nombreOAlias.toLowerCase();
          return cuentasGuardadas.find(c => {
            const nom = c.nombre.toLowerCase();
            const bnc = c.banco?.toLowerCase() ?? '';
            return lower.includes(nom) || (bnc.length > 0 && lower.includes(bnc)) || nom.includes(lower);
          }) ?? null;
        }),
        crear: vi.fn().mockImplementation(async (uId: string, datos: {
          nombre: string;
          tipo: 'debito' | 'ahorros' | 'corriente' | 'billetera' | 'efectivo';
          banco?: string | null;
          saldo?: number;
          esDefault?: boolean;
        }) => {
          const nuevaCuenta: Cuenta = {
            id: `acc-${Date.now()}`,
            usuarioId: uId,
            nombre: datos.nombre,
            tipo: datos.tipo,
            banco: datos.banco ?? null,
            saldo: datos.saldo ?? 0,
            moneda: 'COP',
            esDefault: datos.esDefault ?? false,
            activa: true,
            creadoEn: new Date(),
            actualizadaEn: new Date(),
          };
          cuentasGuardadas.push(nuevaCuenta);
          return nuevaCuenta;
        }),
        actualizarSaldo: vi.fn().mockImplementation(async (id: string, delta: number) => {
          const idx = cuentasGuardadas.findIndex(item => item.id === id);
          if (idx !== -1) {
            const actual = cuentasGuardadas[idx];
            if (!actual) return null;
            const updated: Cuenta = {
              ...actual,
              saldo: actual.saldo + delta,
              actualizadaEn: new Date(),
            };
            cuentasGuardadas[idx] = updated;
            return updated;
          }
          return null;
        }),
        calcularSaldoTotalLiquido: vi.fn().mockImplementation(async () => {
          return cuentasGuardadas.reduce((acc, c) => acc + c.saldo, 0);
        }),
      };

      const obligacionesServiceMock: Partial<ObligacionesService> = {
        listarPorUsuario: vi.fn().mockResolvedValue([]),
      };

      const dbMock: Partial<DatabaseService> = {
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

    it('debe registrar exitosamente una nueva cuenta de efectivo', async () => {
      const res = await router.procesarMensaje('+573112223344', 'tengo 150 mil en efectivo');
      expect(res).toContain('¡Cuenta registrada con éxito!');
      expect(res).toContain('Efectivo');
      expect(res).toContain('$150.000');
      expect(cuentasGuardadas.some(c => c.tipo === 'efectivo' && c.saldo === 150000)).toBe(true);
    });

    it('debe deducir saldo al registrar un gasto con tarjeta débito', async () => {
      const res = await router.procesarMensaje('+573112223344', '45000 almuerzo débito bancolombia');
      expect(res).toContain('Gasto registrado:');
      expect(res).toContain('$45.000');
      expect(res).toContain('*Saldo disponible en Bancolombia Débito:* $1.955.000');

      const cuentaBancolombia = cuentasGuardadas.find(c => c.id === 'acc-bancolombia-1');
      expect(cuentaBancolombia?.saldo).toBe(1955000);
    });

    it('debe incrementar saldo al registrar un ingreso a una cuenta', async () => {
      const res = await router.procesarMensaje('+573112223344', 'ingreso 500000 por honorarios en nequi');
      expect(res).toContain('Ingreso registrado:');
      expect(res).toContain('$500.000');
      expect(res).toContain('*Saldo disponible en Nequi:* $950.000');

      const cuentaNequi = cuentasGuardadas.find(c => c.id === 'acc-nequi-1');
      expect(cuentaNequi?.saldo).toBe(950000);
    });

    it('debe mostrar el desglose financiero completo en consulta de saldo', async () => {
      const res = await router.procesarMensaje('+573112223344', 'saldo');
      expect(res).toContain('Resumen de Liquidez y Tarjetas');
      expect(res).toContain('Tu Dinero Propio (Liquidez):');
      expect(res).toContain('*Bancolombia Débito:* $2.000.000');
      expect(res).toContain('*Nequi:* $450.000');
      expect(res).toContain('*Total dinero propio disponible:* *$2.450.000*');
      expect(res).toContain('Tarjetas de Crédito');
      expect(res).toContain('Tarjeta Nu');
      expect(res).toContain('*Deuda total en tarjetas:* *$800.000*');
      expect(res).toContain('*Balance Neto (Dinero propio - Deuda actual):* 🟢 *$1.650.000*');
    });

    it('debe mostrar el comando de ayuda con las nuevas capacidades (tarjetas, liquidez, balance, compras)', async () => {
      const res = await router.procesarMensaje('+573112223344', 'ayuda');
      expect(res).toContain('¿Qué puede hacer Lukas por ti?');
      expect(res).toContain('Tarjetas de Crédito (El Método Lukas)');
      expect(res).toContain('Registremos una tarjeta');
      expect(res).toContain('Lo compré');
      expect(res).toContain('Dinero Propio y Liquidez (Débito, Billeteras y Efectivo)');
      expect(res).toContain('Nequi');
      expect(res).toContain('Consultas Inteligentes y Balance');
      expect(res).toContain('Mis tarjetas');
      expect(res).toContain('¿Cuánta plata tengo?');
    });
  });
});
