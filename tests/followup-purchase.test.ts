/**
 * ========================================================
 * Pruebas de Seguimiento Contextual de Compras ("lo compré")
 * Verifica:
 * 1. Extracción de intención, monto, cuotas y producto en consultas de compra.
 * 2. Reconocimiento de confirmación contextual ("lo compré", "la compré", etc.).
 * 3. Enrutamiento e impacto en saldo y cuotas en CanalRouterService.
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
import { Usuario, Tarjeta, Transaccion, RecomendacionTarjeta } from '../src/domain/types';
import { ContextoMensaje } from '../src/parser/parser.interface';

describe('Seguimiento Contextual de Compras ("lo compré")', () => {
  describe('OpenAiProvider (Fallback determinista)', () => {
    const provider = new OpenAiProvider();

    const contextoBase: ContextoMensaje = {
      fechaActual: '2026-10-15',
      tarjetasActivas: [
        { id: 'card-1', nombre: 'Diners Davivienda', banco: 'Davivienda' },
        { id: 'card-2', nombre: 'Master Davivienda', banco: 'Davivienda' },
      ],
      obligacionesActivas: [],
      ultimaTransaccion: null,
    };

    it('debe interpretar "quiero comprar un tv de 1.200.000 a 2 cuotas" como mejor_tarjeta con cuotas y descripción', () => {
      const res = provider.interpretarFallback('quiero comprar un tv de 1.200.000 a 2 cuotas', contextoBase);
      expect(res.intencion).toBe('consulta');
      expect(res.consulta?.tipoConsulta).toBe('mejor_tarjeta');
      expect(res.consulta?.montoSimulado).toBe(1200000);
      expect(res.consulta?.cuotasSimuladas).toBe(2);
      expect(res.consulta?.descripcionSimulada).toBe('tv');
    });

    it('debe interpretar "lo compre" como registro cuando existe recomendacionPrevia en el contexto', () => {
      const contextoConRecomendacion: ContextoMensaje = {
        ...contextoBase,
        recomendacionPrevia: {
          monto: 1200000,
          descripcion: 'tv',
          cuotas: 2,
          tarjetaRecomendadaId: 'card-1',
          tarjetaRecomendadaNombre: 'Diners Davivienda',
          timestamp: Date.now(),
        },
      };

      const res = provider.interpretarFallback('lo compre', contextoConRecomendacion);
      expect(res.intencion).toBe('registro');
      expect(res.transacciones).toBeDefined();
      expect(res.transacciones?.[0]?.monto).toBe(1200000);
      expect(res.transacciones?.[0]?.cuotas).toBe(2);
      expect(res.transacciones?.[0]?.descripcion).toBe('tv');
      expect(res.transacciones?.[0]?.tarjeta).toBe('Diners Davivienda');
      expect(res.transacciones?.[0]?.medioPago).toBe('tarjeta');
    });

    it('debe permitir cambiar de tarjeta al confirmar diciendo "lo compré con la master"', () => {
      const contextoConRecomendacion: ContextoMensaje = {
        ...contextoBase,
        recomendacionPrevia: {
          monto: 1200000,
          descripcion: 'tv',
          cuotas: 2,
          tarjetaRecomendadaId: 'card-1',
          tarjetaRecomendadaNombre: 'Diners Davivienda',
          timestamp: Date.now(),
        },
      };

      const res = provider.interpretarFallback('lo compré con la master', contextoConRecomendacion);
      expect(res.intencion).toBe('registro');
      expect(res.transacciones?.[0]?.tarjeta).toBe('Master Davivienda');
      expect(res.transacciones?.[0]?.monto).toBe(1200000);
    });

    it('debe retornar no_entendido si dice "lo compre" sin recomendacionPrevia', () => {
      const res = provider.interpretarFallback('lo compre', contextoBase);
      expect(res.intencion).toBe('no_entendido');
    });
  });

  describe('Flujo E2E en CanalRouterService', () => {
    let router: CanalRouterService;
    let movimientosRegistrados: Array<{
      monto: number;
      descripcion: string | null;
      cuotas: number;
      tarjetaId: string | null;
    }> = [];

    const usuario: Usuario = {
      id: 'usr-1',
      numeroWhatsapp: '+573009998877',
      nombre: 'Carlos',
      estado: 'activo',
      aceptoDatosEn: new Date(),
      zonaHoraria: 'America/Bogota',
      horaRecordatorios: '08:00',
      medioPagoDefault: 'tarjeta',
      tonoPreferido: 'casual',
      plan: 'gratis',
      limiteGastoMensual: 5000000,
      ultimaTransaccionId: null,
      creadoEn: new Date(),
    };

    const dinersCard: Tarjeta = {
      id: 'diners-id',
      usuarioId: 'usr-1',
      nombre: 'Diners Davivienda',
      banco: 'Davivienda',
      diaCorte: 20,
      diaPago: 5,
      cupo: 14000000,
      cupoDisponible: 14000000,
      limiteCiclo: null,
      cobraInteresUnaCuota: false,
      aceptaCompras: true,
      esDefault: true,
      tieneCuotaManejo: false,
      valorCuotaManejo: 0,
      tipoExoneracion: 'ninguna',
      metaExoneracion: 0,
      tasaInteresEa: 28.5,
      activa: true,
      creadoEn: new Date(),
    };

    beforeEach(() => {
      movimientosRegistrados = [];

      const usuariosServiceMock: Partial<UsuariosService> = {
        buscarPorNumero: vi.fn().mockResolvedValue(usuario),
      };

      const openAiProvider = new OpenAiProvider();
      const parserServiceMock: Partial<ParserService> = {
        interpretar: vi.fn().mockImplementation((texto: string, contexto: ContextoMensaje) => {
          return Promise.resolve(openAiProvider.interpretarFallback(texto, contexto));
        }),
      };

      const movimientosServiceMock: Partial<MovimientosService> = {
        obtenerUltimaTransaccion: vi.fn().mockResolvedValue(null),
        calcularGastoMesActual: vi.fn().mockResolvedValue(1200000),
        calcularGastoPeriodo: vi.fn().mockResolvedValue(1200000),
        listarTransaccionesPeriodo: vi.fn().mockResolvedValue([]),
        registrar: vi.fn().mockImplementation((_uid: string, datos: { monto: number; descripcion: string | null; cuotas: number; tarjetaId: string | null }) => {
          movimientosRegistrados.push(datos);
          const t: Transaccion = {
            id: 'tx-1',
            usuarioId: 'usr-1',
            tipo: 'gasto',
            monto: datos.monto,
            categoriaId: 'cat-1',
            categoriaConfianza: 'alta',
            descripcion: datos.descripcion,
            medioPago: 'tarjeta',
            tarjetaId: datos.tarjetaId,
            cuotas: datos.cuotas,
            cuotasOriginales: datos.cuotas,
            pendienteRediferir: datos.cuotas > 1,
            fecha: '2026-10-15',
            creadoEn: new Date(),
          };
          return Promise.resolve(t);
        }),
      };

      const tarjetasServiceMock: Partial<TarjetasService> = {
        listarPorUsuario: vi.fn().mockResolvedValue([dinersCard]),
        eliminarTarjetasIncompletas: vi.fn().mockResolvedValue(0),
        buscarPorNombreOAlias: vi.fn().mockResolvedValue(dinersCard),
        buscarPorId: vi.fn().mockResolvedValue({
          ...dinersCard,
          cupoDisponible: 14000000 - 1200000,
        }),
        recomendarMejorTarjeta: vi.fn().mockResolvedValue([
          {
            tarjeta: dinersCard,
            diasHastaPago: 22,
            fechaPago: new Date('2026-11-05'),
            fechaCorte: new Date('2026-10-20'),
            cupoDisponibleDespues: 14000000 - 1200000,
            esVentanaOptima: false,
            mensajeEstrategico: 'Corte próximo en 5 días. Tendrás 22 días para pagar.',
            cumpleMonto: true,
            requiereAtencionCuotaManejo: false,
          },
        ]),
      };

      const cuentasServiceMock: Partial<CuentasService> = {
        listarPorUsuario: vi.fn().mockResolvedValue([]),
        buscarPorNombreOAlias: vi.fn().mockResolvedValue(null),
        buscarPorId: vi.fn().mockResolvedValue(null),
        actualizarSaldo: vi.fn().mockResolvedValue(undefined),
        calcularSaldoTotalLiquido: vi.fn().mockResolvedValue(0),
      };

      const obligacionesServiceMock: Partial<ObligacionesService> = {
        listarPorUsuario: vi.fn().mockResolvedValue([]),
      };

      const dbMock: Partial<DatabaseService> = {
        execute: vi.fn().mockResolvedValue(1),
      };

      const respuestasService = new RespuestasService();

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

    it('debe completar el flujo conversacional de simulación y compra exitosamente', async () => {
      // 1. Usuario simula compra
      const r1 = await router.procesarMensaje('+573009998877', 'quiero comprar un tv de 1.200.000 a 2 cuotas');
      expect(r1).toContain('Recomendación Inteligente para compra de $1.200.000');
      expect(r1).toContain('Diners Davivienda');
      expect(movimientosRegistrados.length).toBe(0);

      // 2. Usuario dice "lo compre"
      const r2 = await router.procesarMensaje('+573009998877', 'lo compre');
      expect(r2).toContain('Gasto registrado');
      expect(r2).toContain('$1.200.000');
      expect(r2).toContain('tv');
      expect(r2).toContain('Diners Davivienda (2 cuotas)');
      expect(r2).toContain('¡Ojo con los intereses!');
      expect(r2).toContain('redifiérela a *1 cuota*');

      // 3. Verificar que se registró la transacción con las cuotas y tarjeta correctas
      expect(movimientosRegistrados.length).toBe(1);
      expect(movimientosRegistrados[0]?.monto).toBe(1200000);
      expect(movimientosRegistrados[0]?.cuotas).toBe(2);
      expect(movimientosRegistrados[0]?.tarjetaId).toBe('diners-id');
      expect(movimientosRegistrados[0]?.descripcion).toBe('tv');

      // 4. Si el usuario vuelve a decir "lo compre", ya no se duplica la compra
      const r3 = await router.procesarMensaje('+573009998877', 'lo compre');
      expect(r3).toContain('no tengo los detalles o expiró la recomendación previa');
      expect(movimientosRegistrados.length).toBe(1);
    });
  });
});
