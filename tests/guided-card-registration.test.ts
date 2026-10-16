/**
 * ========================================================
 * Pruebas del Flujo Conversacional Guiado de Registro de Tarjetas
 * Valida que NO se guarde información incompleta ni valores por defecto dummy
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
import { ObligacionesService } from '../src/obligaciones/obligaciones.service';
import { DatabaseService } from '../src/database/database.service';
import { Usuario, Tarjeta } from '../src/domain/types';

describe('Flujo Conversacional Guiado: Registro de Tarjetas', () => {
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
    id: 'user-123',
    numeroWhatsapp: '+573001112233',
    nombre: 'Carlos',
    estado: 'activo',
    aceptoDatosEn: new Date(),
    zonaHoraria: 'America/Bogota',
    horaRecordatorios: '08:00',
    medioPagoDefault: 'tarjeta',
    tonoPreferido: 'casual',
    plan: 'gratis',
    limiteGastoMensual: 3000000,
    ultimaTransaccionId: null,
    creadoEn: new Date(),
  };

  const tarjetasGuardadas: Array<{
    usuarioId: string;
    nombre: string;
    banco: string;
    cupo?: number | null;
    cupoDisponible?: number | null;
    tasaInteresEa?: number | null;
    diaCorte: number;
    diaPago: number;
  }> = [];

  beforeEach(() => {
    tarjetasGuardadas.length = 0;
    respuestasService = new RespuestasService();

    usuariosServiceMock = {
      buscarPorNumero: vi.fn().mockResolvedValue(usuarioActivo),
    };

    parserServiceMock = {
      interpretar: vi.fn().mockImplementation(async (texto: string) => {
        const lower = texto.toLowerCase();
        if (lower.includes('registremos una tarjeta') || lower.includes('agregar tarjeta')) {
          return { intencion: 'config_tarjeta', tonoDetectado: 'casual' };
        }
        if (lower.includes('tarjetas tengo') || lower.includes('tarjetas registradas') || lower.includes('mis tarjetas')) {
          return {
            intencion: 'consulta',
            tonoDetectado: 'casual',
            consulta: {
              tipoConsulta: 'tarjetas',
              periodo: 'mes',
              categoriaConsulta: null,
              tarjeta: null,
              montoSimulado: null,
            },
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
      listarPorUsuario: vi.fn().mockImplementation(async () => {
        return tarjetasGuardadas.map((t, idx) => ({
          id: `t-${idx}`,
          usuarioId: t.usuarioId,
          nombre: t.nombre,
          banco: t.banco,
          diaCorte: t.diaCorte,
          diaPago: t.diaPago,
          cupo: t.cupo ?? 0,
          cupoDisponible: t.cupoDisponible ?? t.cupo ?? 0,
          limiteCiclo: null,
          cobraInteresUnaCuota: false,
          aceptaCompras: true,
          esDefault: idx === 0,
          tieneCuotaManejo: false,
          valorCuotaManejo: 0,
          tipoExoneracion: 'ninguna',
          metaExoneracion: 0,
          tasaInteresEa: t.tasaInteresEa ?? 28.0,
          activa: true,
          creadoEn: new Date(),
        })) as readonly Tarjeta[];
      }),
      eliminarTarjetasIncompletas: vi.fn().mockResolvedValue(0),
      crear: vi.fn().mockImplementation(async (uId, datos) => {
        tarjetasGuardadas.push({
          usuarioId: uId,
          nombre: datos.nombre,
          banco: datos.banco,
          cupo: datos.cupo,
          diaCorte: datos.diaCorte,
          diaPago: datos.diaPago,
          tasaInteresEa: datos.tasaInteresEa,
        });
        return {
          id: 'card-new',
          usuarioId: uId,
          nombre: datos.nombre,
          banco: datos.banco,
          diaCorte: datos.diaCorte,
          diaPago: datos.diaPago,
          cupo: datos.cupo ?? 0,
          cupoDisponible: datos.cupoDisponible ?? datos.cupo ?? 0,
          limiteCiclo: null,
          cobraInteresUnaCuota: false,
          aceptaCompras: true,
          esDefault: false,
          tieneCuotaManejo: false,
          valorCuotaManejo: 0,
          tipoExoneracion: 'ninguna',
          metaExoneracion: 0,
          tasaInteresEa: datos.tasaInteresEa ?? 28.0,
          activa: true,
          creadoEn: new Date(),
        };
      }),
    };

    cuentasServiceMock = {
      listarPorUsuario: vi.fn().mockResolvedValue([]),
      buscarPorNombreOAlias: vi.fn().mockResolvedValue(null),
      buscarPorId: vi.fn().mockResolvedValue(null),
      actualizarSaldo: vi.fn().mockResolvedValue(undefined),
      calcularSaldoTotalLiquido: vi.fn().mockResolvedValue(0),
    };

    obligacionesServiceMock = {
      listarPorUsuario: vi.fn().mockResolvedValue([]),
    };

    dbMock = {
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

  it('NO registra tarjeta con datos dummy si el usuario solo dice "registremos una tarjeta"', async () => {
    const res = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'registremos una tarjeta');

    // Debe pedir el primer dato (nombre / banco) y NO llamar a tarjetasService.crear
    expect(tarjetasGuardadas.length).toBe(0);
    expect(res).toContain('1️⃣ ¿Cuál es el *banco y franquicia o categoría*');
  });

  it('Flujo completo paso a paso: pide nombre -> cupo total -> cupo disponible -> tasa -> corte -> pago y luego guarda', async () => {
    // Paso 1: Iniciar registro
    const res1 = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'registremos una tarjeta');
    expect(res1).toContain('1️⃣ ¿Cuál es el *banco y franquicia o categoría*');
    expect(tarjetasGuardadas.length).toBe(0);

    // Paso 2: Usuario proporciona banco y franquicia
    const res2 = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'Diners Davivienda');
    expect(res2).toContain('Diners Club Davivienda');
    expect(res2).toContain('2️⃣ ¿Cuál es tu *cupo total aprobado por el banco*?');
    expect(tarjetasGuardadas.length).toBe(0);

    // Paso 3: Usuario proporciona cupo total
    const res3 = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, '14.000.000');
    expect(res3).toContain('$14.000.000');
    expect(res3).toContain('3️⃣ ¿Cuánto tienes de *cupo disponible para compras hoy*?');
    expect(tarjetasGuardadas.length).toBe(0);

    // Paso 4: Usuario indica que está al 100% libre diciendo "todo"
    const res4 = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'todo');
    expect(res4).toContain('Cupo disponible anotado: *$14.000.000*');
    expect(res4).toContain('4️⃣ ¿Cuál es la *tasa de interés* de tu tarjeta?');
    expect(tarjetasGuardadas.length).toBe(0);

    // Paso 5: Usuario proporciona tasa de interés
    const res5 = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, '28.5% EA');
    expect(res5).toContain('Tasa de interés registrada: *28.5% E.A.*');
    expect(res5).toContain('5️⃣ ¿Qué *día del mes es tu fecha de corte*?');
    expect(tarjetasGuardadas.length).toBe(0);

    // Paso 6: Usuario proporciona día de corte
    const res6 = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'los 20');
    expect(res6).toContain('Corte el día *20*');
    expect(res6).toContain('6️⃣ Por último, ¿qué *día del mes es tu fecha límite de pago*?');
    expect(tarjetasGuardadas.length).toBe(0);

    // Paso 7: Usuario proporciona día de pago
    const res7 = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'el 5');
    expect(res7).toContain('¡Tarjeta guardada con éxito!');
    expect(res7).toContain('Diners Club Davivienda');
    expect(res7).toContain('Cupo total asignado:* *$14.000.000*');
    expect(res7).toContain('Cupo disponible actual:* *$14.000.000*');
    expect(res7).toContain('(100% libre)');
    expect(res7).toContain('Tasa de interés:* *28.5% E.A.*');
    expect(res7).toContain('Día de corte: *20*');
    expect(res7).toContain('Día de pago: *5*');

    // Ahora SÍ debe estar guardada en base de datos
    expect(tarjetasGuardadas.length).toBe(1);
    expect(tarjetasGuardadas[0]?.nombre).toBe('Diners Club Davivienda');
    expect(tarjetasGuardadas[0]?.banco).toBe('Davivienda');
    expect(tarjetasGuardadas[0]?.cupo).toBe(14000000);
    expect(tarjetasGuardadas[0]?.diaCorte).toBe(20);
    expect(tarjetasGuardadas[0]?.diaPago).toBe(5);
  });

  it('Distingue entre cupo total y disponible cuando el usuario debe una parte y omite tasa', async () => {
    // Iniciar y completar hasta cupo disponible indicando que debe 4 millones
    await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'registremos una tarjeta');
    await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'Nu');
    await router.procesarMensaje(usuarioActivo.numeroWhatsapp, '10 millones');
    
    // En el paso de disponible, indica que debe 4 millones
    const resDisp = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'debo 4 millones');
    expect(resDisp).toContain('Cupo disponible anotado: *$6.000.000*');

    // En el paso de tasa, escribe "omitir"
    const resTasa = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'omitir');
    expect(resTasa).toContain('5️⃣ ¿Qué *día del mes es tu fecha de corte*?');

    await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'corte los 15');
    const resFinal = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'pago los 5');

    expect(resFinal).toContain('Cupo total asignado:* *$10.000.000*');
    expect(resFinal).toContain('Cupo disponible actual:* *$6.000.000*');
    expect(resFinal).toContain('Saldo utilizado / por pagar:* *$4.000.000*');
    expect(resFinal).toContain('Tasa de interés:* *28% E.A.*');
  });

  it('Permite cancelar el flujo si el usuario escribe "cancelar"', async () => {
    await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'registremos una tarjeta');
    const resCancel = await router.procesarMensaje(usuarioActivo.numeroWhatsapp, 'cancelar');

    expect(resCancel).toContain('Cancelé el registro de la tarjeta');
    expect(tarjetasGuardadas.length).toBe(0);
  });

  it('Responde a "hola me indicas que tarjetas tengo registradas/" mostrando listado de tarjetas y no balance', async () => {
    const res = await router.procesarMensaje(
      usuarioActivo.numeroWhatsapp,
      'hola me indicas que tarjetas tengo registradas/',
    );
    expect(res).not.toContain('Balance del Mes');
    expect(res).toContain('Aún no tienes tarjetas de crédito registradas');
  });
});
