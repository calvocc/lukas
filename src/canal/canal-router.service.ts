/**
 * ========================================================
 * Enrutador de Mensajes (Núcleo de Negocio Lukas)
 * Flujo: Puente -> Cuenta -> Intérprete -> Negocio -> Voz
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { UsuariosService } from '../usuarios/usuarios.service';
import { ParserService } from '../parser/parser.service';
import { RespuestasService } from '../respuestas/respuestas.service';
import { MovimientosService } from '../movimientos/movimientos.service';
import { TarjetasService } from '../tarjetas/tarjetas.service';
import { CuentasService } from '../cuentas/cuentas.service';
import { ObligacionesService, generarConsejoAceleracionDeuda } from '../obligaciones/obligaciones.service';
import { DatabaseService } from '../database/database.service';
import { ContextoMensaje } from '../parser/parser.interface';
import { Tarjeta, RecomendacionCompraPendiente, Cuenta, TipoObligacion } from '../domain/types';
import { formatearMoneda } from '../respuestas/formateador';
import {
  extraerDetallesTarjeta,
  extraerDetallesCuenta,
  extraerDetallesObligacion,
  extraerMontoColombiano,
} from '../parser/parser.utils';

export interface RegistroTarjetaPendiente {
  nombre: string | null;
  banco: string | null;
  cupo: number | null; // Cupo total asignado por el banco
  cupoDisponible: number | null; // Cupo disponible actualmente para compras
  tasaInteresEa: number | null; // Tasa de interés E.A.
  diaCorte: number | null;
  diaPago: number | null;
  pasoEsperado?: 'nombre' | 'cupo' | 'disponible' | 'tasa' | 'corte' | 'pago';
  actualizadoEn: number;
}

export interface RegistroObligacionPendiente {
  nombre: string | null;
  tipo: TipoObligacion;
  entidad: string | null;
  saldo: number | null;
  tasaEa: number | null;
  tasaMv: number | null;
  cuota: number | null;
  cuotasRestantes: number | null;
  diaPago: number | null;
  pasoEsperado?: 'nombre' | 'saldo' | 'cuotas' | 'tasa' | 'diaPago' | 'cuota';
  actualizadoEn: number;
}

@Injectable()
export class CanalRouterService {
  private readonly logger = new Logger(CanalRouterService.name);
  // Rate limiting en memoria (mensajes por minuto por usuario)
  private readonly historialMensajes = new Map<string, number[]>();
  private readonly MAX_MENSAJES_POR_MINUTO = 15;
  // Flujo conversacional guiado para registro de tarjetas paso a paso
  private readonly sesionesRegistroTarjetas = new Map<string, RegistroTarjetaPendiente>();
  // Flujo conversacional guiado para registro de deudas y créditos
  private readonly sesionesRegistroObligaciones = new Map<string, RegistroObligacionPendiente>();
  // Recomendaciones de compra pendientes para seguimiento contextual ("lo compré")
  private readonly recomendacionesPendientes = new Map<string, RecomendacionCompraPendiente>();

  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly parserService: ParserService,
    private readonly respuestasService: RespuestasService,
    private readonly movimientosService: MovimientosService,
    private readonly tarjetasService: TarjetasService,
    private readonly cuentasService: CuentasService,
    private readonly obligacionesService: ObligacionesService,
    private readonly db: DatabaseService,
  ) {}

  private validarRateLimit(numero: string): boolean {
    const ahora = Date.now();
    const timestamps = this.historialMensajes.get(numero) ?? [];
    // Filtrar solo los del último minuto
    const recientes = timestamps.filter((t) => ahora - t < 60000);
    recientes.push(ahora);
    this.historialMensajes.set(numero, recientes);
    return recientes.length <= this.MAX_MENSAJES_POR_MINUTO;
  }

  async procesarMensaje(numeroWhatsapp: string, textoMensaje: string): Promise<string> {
    const texto = textoMensaje.trim();
    if (!texto) {
      return '';
    }

    // Rate Limiting para proteger el canal de WhatsApp
    if (!this.validarRateLimit(numeroWhatsapp)) {
      return '⏳ Estás enviando mensajes muy rápido. Espera un momento para no saturar el canal de WhatsApp.';
    }

    // 1. Identificar o registrar usuario (Cuenta: Bienvenido a Lukas)
    let usuario = await this.usuariosService.buscarPorNumero(numeroWhatsapp);

    if (!usuario) {
      usuario = await this.usuariosService.registrarNuevo(numeroWhatsapp);
      return this.respuestasService.mensajeBienvenida();
    }

    // 2. Proceso de Onboarding y Habeas Data (Ley 1581 de 2012)
    if (usuario.estado === 'registrando') {
      if (!usuario.aceptoDatosEn) {
        const lower = texto.toLowerCase();
        if (
          lower === 'acepto' ||
          lower === 'si' ||
          lower === 'sí' ||
          lower === 'de acuerdo' ||
          lower.includes('acepto')
        ) {
          await this.usuariosService.aceptarPoliticaDatos(usuario.id);
          return this.respuestasService.mensajePedirNombre();
        } else {
          return `Para usar Lukas es indispensable aceptar la política de tratamiento de datos personales (Ley 1581 de 2012).
          
👉 Responde *"Acepto"* para continuar, o escríbenos si tienes dudas.`;
        }
      }

      if (!usuario.nombre) {
        await this.usuariosService.actualizarNombre(usuario.id, texto);
        return this.respuestasService.mensajeCuentaActivada(texto);
      }
    }

    if (usuario.estado === 'bloqueado' || usuario.estado === 'eliminado') {
      return 'Esta cuenta no está activa en Lukas. Contacta a soporte para más información.';
    }

    // 2.5. Si el usuario está en medio de un flujo guiado para registrar tarjeta
    const sesionRegistro = this.sesionesRegistroTarjetas.get(usuario.id);
    if (sesionRegistro) {
      const lower = texto.toLowerCase().trim();
      if (lower === 'cancelar' || lower.includes('cancelar registro') || lower === 'ya no' || lower === 'salir') {
        this.sesionesRegistroTarjetas.delete(usuario.id);
        return '❌ Cancelé el registro de la tarjeta. Puedes registrarla en cualquier momento diciendo: _"registremos una tarjeta"_.';
      }

      return await this.continuarRegistroTarjeta(usuario.id, texto, sesionRegistro);
    }

    // 2.6. Si el usuario está en medio de un flujo guiado para registrar crédito/deuda
    const sesionObligacion = this.sesionesRegistroObligaciones.get(usuario.id);
    if (sesionObligacion) {
      const lower = texto.toLowerCase().trim();
      if (lower === 'cancelar' || lower.includes('cancelar') || lower === 'ya no' || lower === 'salir') {
        this.sesionesRegistroObligaciones.delete(usuario.id);
        return '❌ Cancelé el registro del crédito. Puedes registrarlo en cualquier momento diciendo: _"registrar crédito"_.';
      }

      return await this.continuarRegistroObligacion(usuario.id, texto, sesionObligacion);
    }

    // 3. Usuario activo: Preparar contexto para el Intérprete
    const tarjetas = await this.tarjetasService.listarPorUsuario(usuario.id);
    const cuentas = await this.cuentasService.listarPorUsuario(usuario.id);
    const obligaciones = await this.obligacionesService.listarPorUsuario(usuario.id);
    const ultimaTransaccion = await this.movimientosService.obtenerUltimaTransaccion(usuario.id);

    // Obtener recomendación previa de compra si existe y no ha expirado (30 min)
    const recPendiente = this.recomendacionesPendientes.get(usuario.id);
    const recomendacionPrevia =
      recPendiente && Date.now() - recPendiente.timestamp < 30 * 60 * 1000
        ? recPendiente
        : null;
    if (recPendiente && !recomendacionPrevia) {
      this.recomendacionesPendientes.delete(usuario.id);
    }

    const contexto: ContextoMensaje = {
      fechaActual: new Date().toISOString().split('T')[0] ?? '',
      tarjetasActivas: tarjetas.map((t) => ({ id: t.id, nombre: t.nombre, banco: t.banco })),
      cuentasActivas: cuentas.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, banco: c.banco, saldo: c.saldo })),
      obligacionesActivas: obligaciones.map((o) => ({ id: o.id, nombre: o.nombre })),
      ultimaTransaccion,
      recomendacionPrevia,
    };

    // 4. Intérprete: Extraer intención y datos
    const parsed = await this.parserService.interpretar(texto, contexto);
    const infoConsulta = parsed.consulta
      ? ` [tipo: ${parsed.consulta.tipoConsulta}${parsed.consulta.tarjeta ? `, tarjeta: ${parsed.consulta.tarjeta}` : ''}]`
      : '';
    this.logger.log(`Intención interpretada: ${parsed.intencion}${infoConsulta} (Tono: ${parsed.tonoDetectado})`);

    // Guardar en log de mensajes
    await this.db.execute(
      `INSERT INTO mensajes_log (usuario_id, mensaje_raw, respuesta_ia, intencion, tono_detectado)
       VALUES ($1, $2, $3, $4, $5)`,
      [usuario.id, texto, JSON.stringify(parsed), parsed.intencion, parsed.tonoDetectado],
    );

    // 5. Enrutar según intención de negocio
    switch (parsed.intencion) {
      case 'ayuda':
        return this.respuestasService.mensajeAyuda();

      case 'eliminacion': {
        const borrada = await this.movimientosService.borrarUltimaTransaccion(usuario.id);
        if (!borrada) {
          return 'No encontré ninguna transacción reciente para borrar.';
        }
        return this.respuestasService.mensajeUltimaBorrada(borrada);
      }

      case 'correccion': {
        const nuevasCuotas = parsed.correccionCuotas?.nuevasCuotas ?? 1;
        const tarjetaNom = parsed.correccionCuotas?.tarjeta ?? undefined;
        const actualizada = await this.movimientosService.actualizarCuotas(
          usuario.id,
          nuevasCuotas,
          tarjetaNom,
        );
        if (!actualizada) {
          return 'No encontré ninguna compra reciente con tarjeta para actualizar cuotas.';
        }
        return this.respuestasService.mensajeCuotasActualizadas(actualizada.cuotas);
      }

      case 'config_presupuesto': {
        const limite = parsed.configPresupuesto?.limiteGastoMensual;
        if (!limite || limite <= 0) {
          return 'Dime el valor que deseas como presupuesto mensual (ej: _"mi presupuesto es 3 millones"_).';
        }
        await this.usuariosService.actualizarLimiteGastoMensual(usuario.id, limite);
        const gastoMes = await this.movimientosService.calcularGastoMesActual(usuario.id);
        return this.respuestasService.mensajePresupuestoActualizado(limite, gastoMes);
      }

      case 'pago_tarjeta': {
        const tarjetaNombre = parsed.pagoTarjeta?.tarjeta;
        if (!tarjetaNombre) {
          return '¿Cuál tarjeta pagaste? (Ej: _"ya pagué la gold"_ o _"ya pagué nu"_).';
        }
        try {
          const resultado = await this.tarjetasService.registrarPagoTotalCiclo(usuario.id, tarjetaNombre);
          return this.respuestasService.mensajePagoTarjetaRegistrado(
            resultado.tarjeta.nombre,
            resultado.totalPagado,
            resultado.nuevoCupo,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return `⚠️ ${msg}`;
        }
      }

      case 'pago_obligacion': {
        const obligacionNombre = parsed.pagoObligacion?.obligacion;
        if (!obligacionNombre) {
          return '¿Cuál deuda u obligación pagaste? (Ej: _"pagué la cuota del kona"_).';
        }
        try {
          const res = await this.obligacionesService.registrarPago(usuario.id, obligacionNombre);
          return this.respuestasService.mensajePagoObligacionRegistrado(
            res.obligacion.nombre,
            res.valorPagado,
            res.cuotasRestantes,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return `⚠️ ${msg}`;
        }
      }

      case 'config_tarjeta': {
        const detalles = parsed.configTarjeta ?? extraerDetallesTarjeta(texto);
        const tieneNombre = Boolean(detalles.nombre && detalles.nombre !== 'Mi Tarjeta' && detalles.nombre !== 'Tarjeta Crédito');
        const tieneCupo = Boolean(detalles.cupo && detalles.cupo > 0);
        const tieneCorte = Boolean(detalles.diaCorte && detalles.diaCorte >= 1 && detalles.diaCorte <= 31);
        const tienePago = Boolean(detalles.diaPago && detalles.diaPago >= 1 && detalles.diaPago <= 31);

        // Si la información está 100% COMPLETA en el mensaje, se registra directamente
        if (tieneNombre && tieneCupo && tieneCorte && tienePago && detalles.nombre && detalles.cupo && detalles.diaCorte && detalles.diaPago) {
          const cupoTotal = detalles.cupo;
          const cupoDisponible = detalles.cupoDisponible ?? detalles.cupo;
          const tasaInteres = detalles.tasaInteresEa ?? null;

          const nueva = await this.tarjetasService.crear(usuario.id, {
            nombre: detalles.nombre,
            banco: detalles.banco && detalles.banco !== 'Banco' ? detalles.banco : detalles.nombre,
            diaCorte: detalles.diaCorte,
            diaPago: detalles.diaPago,
            cupo: cupoTotal,
            cupoDisponible: cupoDisponible,
            tasaInteresEa: tasaInteres,
            aceptaCompras: true,
            cobraInteresUnaCuota: false,
          });

          const saldoEnUso = Math.max(0, cupoTotal - cupoDisponible);
          let balanceTexto = `• 💰 *Cupo total asignado:* *${formatearMoneda(cupoTotal)}*\n• 🟢 *Cupo disponible actual:* *${formatearMoneda(cupoDisponible)}*`;
          if (saldoEnUso > 0) {
            balanceTexto += `\n• 🔴 *Saldo utilizado / por pagar:* *${formatearMoneda(saldoEnUso)}*`;
          } else {
            balanceTexto += ` _(100% libre)_`;
          }
          if (nueva.tasaInteresEa) {
            balanceTexto += `\n• 📈 *Tasa de interés:* *${nueva.tasaInteresEa}% E.A.*`;
          }

          return `💳 *¡Tarjeta guardada con éxito!*

• Tarjeta: *${nueva.nombre}* (${nueva.banco})
${balanceTexto}
• ✂️ Día de corte: *${nueva.diaCorte}* de cada mes
• 📅 Día de pago: *${nueva.diaPago}* de cada mes

💡 A partir de ahora, cuando vayas a comprar algo, pregúntame:
_"¿Qué tarjeta uso hoy para 500 mil?"_ y te diré si es el mejor momento para ganar hasta 50 días libres de interés.`;
        }

        // Si la información está incompleta, iniciar flujo conversacional guiado paso a paso
        const sesion: RegistroTarjetaPendiente = {
          nombre: tieneNombre ? detalles.nombre : null,
          banco: tieneNombre ? detalles.banco : null,
          cupo: tieneCupo ? detalles.cupo : null,
          cupoDisponible: detalles.cupoDisponible ?? null,
          tasaInteresEa: detalles.tasaInteresEa ?? null,
          diaCorte: tieneCorte ? detalles.diaCorte : null,
          diaPago: tienePago ? detalles.diaPago : null,
          actualizadoEn: Date.now(),
        };
        this.sesionesRegistroTarjetas.set(usuario.id, sesion);
        return this.pedirSiguienteDatoTarjeta(sesion);
      }

      case 'config_cuenta': {
        const detalles = parsed.configCuenta ?? extraerDetallesCuenta(texto);
        const saldo = detalles.saldo ?? extraerMontoColombiano(texto) ?? 0;
        const cuentaGuardada = await this.cuentasService.crear(usuario.id, {
          nombre: detalles.nombre ?? (detalles.banco ? `Débito ${detalles.banco}` : 'Mi Cuenta'),
          tipo: detalles.tipo,
          banco: detalles.banco,
          saldo,
        });
        return this.respuestasService.mensajeCuentaGuardada(cuentaGuardada);
      }

      case 'config_obligacion': {
        const detalles = parsed.configObligacion ?? extraerDetallesObligacion(texto);
        const tieneNombre = Boolean(detalles.nombre && detalles.nombre !== 'Crédito');
        const tieneSaldo = Boolean(detalles.saldo && detalles.saldo > 0);
        const tienePago = Boolean(detalles.diaPago && detalles.diaPago >= 1 && detalles.diaPago <= 31);
        const tieneCuotas = Boolean(detalles.cuotasRestantes && detalles.cuotasRestantes > 0);

        // Si la información esencial está COMPLETA en el mensaje, se registra directamente
        if (tieneNombre && tieneSaldo && tienePago && tieneCuotas && detalles.diaPago && detalles.saldo && detalles.cuotasRestantes) {
          const obligacionGuardada = await this.obligacionesService.crear(usuario.id, {
            nombre: detalles.nombre ?? 'Crédito',
            tipo: detalles.tipo ?? 'deuda',
            entidad: detalles.entidad ?? null,
            saldo: detalles.saldo,
            tasaEa: detalles.tasaEa ?? null,
            tasaMv: detalles.tasaMv ?? null,
            cuota: detalles.cuota ?? null,
            cuotasRestantes: detalles.cuotasRestantes,
            cuotasTotales: detalles.cuotasTotales ?? detalles.cuotasRestantes,
            diaPago: detalles.diaPago,
          });

          const consejo = generarConsejoAceleracionDeuda(
            obligacionGuardada.saldo ?? 0,
            obligacionGuardada.tasaEa ?? null,
            obligacionGuardada.cuotasRestantes ?? 12,
            obligacionGuardada.cuota,
          );

          this.sesionesRegistroObligaciones.delete(usuario.id);
          return this.respuestasService.mensajeObligacionGuardada(obligacionGuardada, consejo);
        }

        // Si la información está incompleta, iniciar flujo conversacional guiado
        const sesion: RegistroObligacionPendiente = {
          nombre: tieneNombre && detalles.nombre ? detalles.nombre : null,
          tipo: detalles.tipo ?? 'deuda',
          entidad: detalles.entidad ?? null,
          saldo: tieneSaldo && detalles.saldo ? detalles.saldo : null,
          tasaEa: detalles.tasaEa ?? null,
          tasaMv: detalles.tasaMv ?? null,
          cuota: detalles.cuota ?? null,
          cuotasRestantes: tieneCuotas && detalles.cuotasRestantes ? detalles.cuotasRestantes : null,
          diaPago: tienePago && detalles.diaPago ? detalles.diaPago : null,
          actualizadoEn: Date.now(),
        };
        this.sesionesRegistroObligaciones.set(usuario.id, sesion);
        return this.pedirSiguienteDatoObligacion(sesion);
      }

      case 'consulta': {
        let tipoConsulta = parsed.consulta?.tipoConsulta ?? 'resumen';
        const lowerLimpio = texto.toLowerCase().replace(/[/\\?¿!¡.,;:]/g, ' ');

        // Purgar tarjetas dummy incompletas si existieran de pruebas anteriores
        await this.tarjetasService.eliminarTarjetasIncompletas(usuario.id);
        const tarjetasActualizadas = await this.tarjetasService.listarPorUsuario(usuario.id);

        // Protección determinista para 'tarjetas' si el usuario preguntó por sus tarjetas registradas
        if (
          lowerLimpio.includes('tarjetas tengo') ||
          lowerLimpio.includes('tarjetas registradas') ||
          lowerLimpio.includes('mis tarjetas') ||
          lowerLimpio.includes('que tarjetas') ||
          lowerLimpio.includes('qué tarjetas') ||
          lowerLimpio.includes('cuáles tarjetas') ||
          lowerLimpio.includes('cuales tarjetas') ||
          lowerLimpio.includes('ver tarjetas') ||
          lowerLimpio.includes('mostrar tarjetas') ||
          lowerLimpio.includes('listar tarjetas')
        ) {
          // A menos que sea recomendación para compra ("qué tarjeta uso hoy...")
          if (!lowerLimpio.includes('uso hoy') && !lowerLimpio.includes('usar hoy') && !lowerLimpio.includes('mejor tarjeta')) {
            tipoConsulta = 'tarjetas';
          }
        }

        // Protección determinista para 'saldo' si pregunta por cupo o saldo
        if (
          lowerLimpio.includes('saldo') ||
          lowerLimpio.includes('cupo disponible') ||
          lowerLimpio.includes('cuanto cupo') ||
          lowerLimpio.includes('cuánto cupo') ||
          lowerLimpio.includes('cuanto me queda') ||
          lowerLimpio.includes('cuánto me queda')
        ) {
          if (tipoConsulta !== 'tarjetas' && tipoConsulta !== 'mejor_tarjeta') {
            tipoConsulta = 'saldo';
          }
        }

        // Protección determinista para 'ciclo_tarjeta' si pregunta por corte o pago
        if (
          lowerLimpio.includes('cuando corta') ||
          lowerLimpio.includes('cuándo corta') ||
          lowerLimpio.includes('corte de la') ||
          lowerLimpio.includes('fecha de corte') ||
          lowerLimpio.includes('fechas de corte') ||
          lowerLimpio.includes('cuando pago') ||
          lowerLimpio.includes('cuándo pago') ||
          lowerLimpio.includes('cuando debo pagar') ||
          lowerLimpio.includes('cuándo debo pagar') ||
          lowerLimpio.includes('fecha de pago') ||
          lowerLimpio.includes('fechas de pago')
        ) {
          if (tipoConsulta !== 'tarjetas' && tipoConsulta !== 'mejor_tarjeta') {
            tipoConsulta = 'ciclo_tarjeta';
          }
        }

        // Protección determinista para 'deudas' si el usuario pregunta por sus deudas, créditos u obligaciones
        if (
          lowerLimpio.includes('deudas') ||
          lowerLimpio.includes('créditos') ||
          lowerLimpio.includes('creditos') ||
          lowerLimpio.includes('obligaciones') ||
          lowerLimpio.includes('mis prestamos') ||
          lowerLimpio.includes('mis préstamos') ||
          lowerLimpio.includes('cuanto debo') ||
          lowerLimpio.includes('cuánto debo')
        ) {
          if (!lowerLimpio.includes('uso hoy') && !lowerLimpio.includes('mejor tarjeta')) {
            tipoConsulta = 'deudas';
          }
        }

        // Si se especificó una tarjeta en la consulta o en el texto
        let tarjetaObjetivo: Tarjeta | null = null;
        const nombreTarjetaBuscada = parsed.consulta?.tarjeta;
        if (nombreTarjetaBuscada) {
          tarjetaObjetivo = await this.tarjetasService.buscarPorNombreOAlias(usuario.id, nombreTarjetaBuscada);
        }
        if (!tarjetaObjetivo && tarjetasActualizadas.length > 0) {
          for (const t of tarjetasActualizadas) {
            if (
              lowerLimpio.includes(t.nombre.toLowerCase()) ||
              lowerLimpio.includes(t.banco.toLowerCase())
            ) {
              tarjetaObjetivo = t;
              break;
            }
          }
        }

        switch (tipoConsulta) {
          case 'tarjetas':
            return this.respuestasService.mensajeListadoTarjetas(tarjetasActualizadas);

          case 'saldo': {
            const cuentasActualizadas = await this.cuentasService.listarPorUsuario(usuario.id);
            let cuentaObjetivo: Cuenta | null = null;
            if (nombreTarjetaBuscada) {
              cuentaObjetivo = await this.cuentasService.buscarPorNombreOAlias(usuario.id, nombreTarjetaBuscada);
            }
            if (!cuentaObjetivo && !tarjetaObjetivo && cuentasActualizadas.length > 0) {
              for (const c of cuentasActualizadas) {
                if (
                  lowerLimpio.includes(c.nombre.toLowerCase()) ||
                  (c.banco && lowerLimpio.includes(c.banco.toLowerCase())) ||
                  lowerLimpio.includes(c.tipo)
                ) {
                  cuentaObjetivo = c;
                  break;
                }
              }
            }
            return this.respuestasService.mensajeConsultaSaldo(
              tarjetaObjetivo,
              tarjetasActualizadas,
              cuentaObjetivo,
              cuentasActualizadas,
            );
          }

          case 'ciclo_tarjeta':
            return this.respuestasService.mensajeConsultaCiclo(tarjetaObjetivo, tarjetasActualizadas);

          case 'mejor_tarjeta': {
            const monto = parsed.consulta?.montoSimulado ?? 100000;
            const cuotas = parsed.consulta?.cuotasSimuladas ?? 1;
            const descripcion = parsed.consulta?.descripcionSimulada ?? 'Compra simulada';
            const categoria = parsed.consulta?.categoriaConsulta ?? 'Otros';
            const recomendaciones = await this.tarjetasService.recomendarMejorTarjeta(usuario.id, monto);

            // Guardar recomendación para permitir confirmación contextual ("lo compré")
            if (recomendaciones.length > 0 && recomendaciones[0]) {
              const mejor = recomendaciones[0];
              this.recomendacionesPendientes.set(usuario.id, {
                monto,
                descripcion,
                categoria,
                cuotas,
                tarjetaRecomendadaId: mejor.tarjeta.id,
                tarjetaRecomendadaNombre: mejor.tarjeta.nombre,
                timestamp: Date.now(),
              });
            }

            return this.respuestasService.mensajeRecomendacionTarjeta(monto, recomendaciones);
          }

          case 'deudas':
            return this.respuestasService.mensajeResumenDeudas(tarjetasActualizadas, obligaciones);

          case 'total_periodo': {
            const periodo = parsed.consulta?.periodo ?? 'mes';
            const gastoPeriodo = await this.movimientosService.calcularGastoPeriodo(usuario.id, periodo);
            const transaccionesPeriodo = await this.movimientosService.listarTransaccionesPeriodo(usuario.id, periodo, 10);
            return this.respuestasService.mensajeGastoPeriodo(
              periodo,
              gastoPeriodo,
              usuario.limiteGastoMensual,
              transaccionesPeriodo,
              tarjetasActualizadas,
            );
          }

          case 'total_categoria': {
            const categoria = parsed.consulta?.categoriaConsulta ?? 'Otros';
            const resCat = await this.movimientosService.calcularGastoPorCategoria(usuario.id, categoria);
            return this.respuestasService.mensajeGastoCategoria(categoria, resCat.total, resCat.count);
          }

          case 'balance':
          case 'resumen':
          default: {
            const gastoMes = await this.movimientosService.calcularGastoMesActual(usuario.id);
            const limitePresupuesto = usuario.limiteGastoMensual;
            let respuesta = `📊 *Balance del Mes:*\n\n• Gasto total acumulado: *${formatearMoneda(gastoMes)}*`;
            if (limitePresupuesto) {
              const pct = Math.round((gastoMes / limitePresupuesto) * 100);
              respuesta += `\n• Presupuesto mensual: *${formatearMoneda(limitePresupuesto)}* (${pct}% consumido)`;
            }
            respuesta += `\n• Tarjetas activas: ${tarjetasActualizadas.length}\n• Obligaciones activas: ${obligaciones.length}`;
            return respuesta;
          }
        }
      }

      case 'registro': {
        const transacciones = parsed.transacciones;
        if (!transacciones || transacciones.length === 0) {
          return 'No pude identificar el monto. Escribe por ejemplo: _"85000 mercado bancolombia"_ o _"30000 almuerzo en efectivo"_.';
        }

        const respuestasVarias: string[] = [];

        for (const t of transacciones) {
          const monto = t.monto;
          if (!monto || monto <= 0) {
            respuestasVarias.push('Faltó indicar el monto de la compra.');
            continue;
          }

          let tarjetaAsignada = null;
          let cuentaAsignada: Cuenta | null = null;

          if (t.medioPago === 'tarjeta' || (!t.medioPago && t.tarjeta)) {
            if (t.tarjeta) {
              tarjetaAsignada = await this.tarjetasService.buscarPorNombreOAlias(usuario.id, t.tarjeta);
            } else if (tarjetas.length > 0) {
              // Tarjeta default o primera
              tarjetaAsignada = tarjetas.find((x) => x.esDefault) ?? tarjetas[0];
            }
          } else if (t.medioPago === 'debito' || t.medioPago === 'efectivo' || t.medioPago === 'transferencia') {
            const nombreBusqueda = t.tarjeta ?? t.descripcion ?? '';
            if (nombreBusqueda) {
              cuentaAsignada = await this.cuentasService.buscarPorNombreOAlias(usuario.id, nombreBusqueda);
            }
            if (!cuentaAsignada && cuentas.length > 0) {
              cuentaAsignada = cuentas.find((c) => c.tipo === t.medioPago) ?? cuentas[0] ?? null;
            }
          }

          const guardada = await this.movimientosService.registrar(usuario.id, {
            tipo: t.tipo,
            monto,
            categoriaNombre: t.categoria,
            categoriaConfianza: t.categoriaConfianza,
            descripcion: t.descripcion,
            medioPago: t.medioPago ?? (tarjetaAsignada ? 'tarjeta' : cuentaAsignada ? 'debito' : 'efectivo'),
            tarjetaId: tarjetaAsignada?.id ?? null,
            cuotas: t.cuotas ?? 1,
          });

          // Si usamos cuenta de liquidez (débito/efectivo), actualizar su saldo
          if (cuentaAsignada) {
            const delta = t.tipo === 'gasto' ? -monto : monto;
            cuentaAsignada = await this.cuentasService.actualizarSaldo(cuentaAsignada.id, delta);
          }

          // Obtener gasto mensual y evaluar límites
          const gastoAcumuladoMes = await this.movimientosService.calcularGastoMesActual(usuario.id);

          // Si usamos tarjeta, recargarla para ver nuevo cupo disponible
          const tarjetaActualizada = tarjetaAsignada
            ? await this.tarjetasService.buscarPorId(tarjetaAsignada.id)
            : null;

          respuestasVarias.push(
            this.respuestasService.mensajeRegistroExitoso(
              guardada,
              tarjetaActualizada,
              cuentaAsignada,
              gastoAcumuladoMes,
              usuario.limiteGastoMensual,
            ),
          );
        }

        // Limpiar recomendación pendiente una vez registrada la compra
        this.recomendacionesPendientes.delete(usuario.id);

        return respuestasVarias.join('\n\n---\n\n');
      }

      case 'no_entendido':
      default: {
        const lower = texto.toLowerCase().trim();
        if (
          lower.includes('compr') ||
          lower === 'lo compre' ||
          lower === 'lo compré' ||
          lower === 'la compre' ||
          lower === 'la compré' ||
          lower === 'listo' ||
          lower === 'hecho'
        ) {
          return `🤔 Parece que quieres registrar una compra, pero no tengo los detalles o expiró la recomendación previa.
Escríbeme por ejemplo: _"1.200.000 tv diners 2 cuotas"_ o _"85000 mercado efectivo"_.`;
        }

        return `🤔 No logré entender bien ese mensaje.
Prueba diciendo algo como:
• _"85.000 mercado efectivo"_
• _"¿Qué tarjeta uso hoy para 500 mil?"_
• _"Tengo 500 mil en Nequi"_
• _"Registremos una tarjeta"_
• _"Saldo"_ o _"Mis tarjetas"_
• _"Ayuda"_ para ver todo lo que puedo hacer.`;
      }
    }
  }

  private pedirSiguienteDatoTarjeta(sesion: RegistroTarjetaPendiente): string {
    if (!sesion.nombre) {
      sesion.pasoEsperado = 'nombre';
      return `💳 ¡De una! Vamos a registrar tu tarjeta de crédito para aplicar *El Método Lukas* y ganarte hasta 50 días de financiamiento libre de intereses 🚀

1️⃣ ¿Cuál es el *banco y franquicia o categoría* de tu tarjeta?
(Ej: _Bancolombia Gold_, _Nu_, _Diners Davivienda_, _Falabella CMR_)`;
    }

    if (!sesion.cupo || sesion.cupo <= 0) {
      sesion.pasoEsperado = 'cupo';
      return `Genial, *${sesion.nombre}* 🏦

2️⃣ ¿Cuál es tu *cupo total aprobado por el banco*?
(Ej: _$14.000.000_ o _5 millones_)`;
    }

    if (sesion.cupoDisponible === null || sesion.cupoDisponible === undefined || sesion.cupoDisponible < 0) {
      sesion.pasoEsperado = 'disponible';
      return `Anotado: Cupo total de *${formatearMoneda(sesion.cupo)}* 💰

3️⃣ ¿Cuánto tienes de *cupo disponible para compras hoy*?
• Si no has gastado nada o la tienes al 100% libre, escribe: _"todo"_
• O escribe cuánto te queda libre (ej: _$10.000.000_) o cuánto debes (ej: _"debo 4 millones"_)`;
    }

    if (sesion.tasaInteresEa === null || sesion.tasaInteresEa === undefined) {
      sesion.pasoEsperado = 'tasa';
      return `Cupo disponible anotado: *${formatearMoneda(sesion.cupoDisponible)}* 🟢

4️⃣ ¿Cuál es la *tasa de interés* de tu tarjeta?
(Ej: _28% EA_, _2.2% mensual_, o escribe _"omitir"_ / _"no sé"_ si no estás seguro y usaremos la tasa estándar de referencia ~28% E.A.)`;
    }

    if (!sesion.diaCorte || sesion.diaCorte < 1 || sesion.diaCorte > 31) {
      sesion.pasoEsperado = 'corte';
      return `Tasa de interés registrada: *${sesion.tasaInteresEa}% E.A.* 📈

5️⃣ ¿Qué *día del mes es tu fecha de corte*?
(Escribe solo el número del día, ej: _20_)`;
    }

    if (!sesion.diaPago || sesion.diaPago < 1 || sesion.diaPago > 31) {
      sesion.pasoEsperado = 'pago';
      return `Corte el día *${sesion.diaCorte}* ✂️

6️⃣ Por último, ¿qué *día del mes es tu fecha límite de pago*?
(Escribe solo el número del día, ej: _5_)`;
    }

    return '';
  }

  private async continuarRegistroTarjeta(
    usuarioId: string,
    texto: string,
    sesion: RegistroTarjetaPendiente,
  ): Promise<string> {
    const detalles = extraerDetallesTarjeta(texto);

    // 1. Nombre y Banco
    if (detalles.nombre && detalles.nombre !== 'Mi Tarjeta' && detalles.nombre !== 'Tarjeta Crédito') {
      sesion.nombre = detalles.nombre;
      sesion.banco = detalles.banco;
    } else if (!sesion.nombre && sesion.pasoEsperado === 'nombre') {
      const nombreLimpio = texto.trim().replace(/^(es|mi tarjeta es|la|es una|tarjeta)\s+/i, '');
      if (nombreLimpio.length >= 2 && !/^\d+$/.test(nombreLimpio)) {
        sesion.nombre = detalles.nombre !== 'Mi Tarjeta' ? detalles.nombre : nombreLimpio;
        sesion.banco = detalles.banco !== 'Banco' ? detalles.banco : 'Banco';
      }
    }

    // 2. Cupo Total
    const lower = texto.toLowerCase().trim();
    if (detalles.cupo && detalles.cupo >= 10000 && (lower.includes('cupo') || sesion.pasoEsperado === 'cupo')) {
      sesion.cupo = detalles.cupo;
    } else if ((!sesion.cupo || sesion.cupo <= 0) && sesion.pasoEsperado === 'cupo') {
      const monto = extraerMontoColombiano(texto);
      if (monto && monto > 0) {
        sesion.cupo = monto;
      }
    }

    // 3. Cupo Disponible Actual
    if (detalles.cupoDisponible !== null && detalles.cupoDisponible !== undefined) {
      sesion.cupoDisponible = detalles.cupoDisponible;
    } else if (sesion.pasoEsperado === 'disponible') {
      if (
        lower === 'todo' ||
        lower.includes('completo') ||
        lower.includes('libre') ||
        lower.includes('los mismos') ||
        lower.includes('igual') ||
        lower.includes('nada')
      ) {
        sesion.cupoDisponible = sesion.cupo;
      } else if (lower.includes('debo') || lower.includes('deuda')) {
        const deuda = extraerMontoColombiano(lower);
        if (deuda && sesion.cupo) {
          sesion.cupoDisponible = Math.max(0, sesion.cupo - deuda);
        }
      } else {
        const monto = extraerMontoColombiano(lower);
        if (monto && monto >= 0) {
          sesion.cupoDisponible = sesion.cupo ? Math.min(monto, sesion.cupo) : monto;
        }
      }
    }

    // 4. Tasa de Interés
    if (detalles.tasaInteresEa !== null && detalles.tasaInteresEa !== undefined) {
      sesion.tasaInteresEa = detalles.tasaInteresEa;
    } else if (sesion.pasoEsperado === 'tasa') {
      if (
        lower.includes('omitir') ||
        lower.includes('no se') ||
        lower.includes('no sé') ||
        lower.includes('despues') ||
        lower.includes('paso') ||
        lower.includes('estandar') ||
        lower.includes('estándar') ||
        lower.includes('normal')
      ) {
        sesion.tasaInteresEa = 28.0;
      } else {
        const matchNum = lower.match(/(\d{1,2}(?:[.,]\d{1,2})?)/);
        if (matchNum && matchNum[1]) {
          const val = Number(matchNum[1].replace(',', '.'));
          if (val <= 5 || lower.includes('mensual') || lower.includes('mv')) {
            const ea = (Math.pow(1 + val / 100, 12) - 1) * 100;
            sesion.tasaInteresEa = Math.round(ea * 10) / 10;
          } else {
            sesion.tasaInteresEa = val;
          }
        } else {
          sesion.tasaInteresEa = 28.0;
        }
      }
    }

    // 5. Día de Corte
    if (detalles.diaCorte && detalles.diaCorte >= 1 && detalles.diaCorte <= 31) {
      sesion.diaCorte = detalles.diaCorte;
    } else if ((!sesion.diaCorte || sesion.diaCorte < 1) && sesion.pasoEsperado === 'corte') {
      const numMatch = texto.match(/\b([1-9]|[12]\d|3[01])\b/);
      if (numMatch && numMatch[1]) {
        sesion.diaCorte = Number(numMatch[1]);
      }
    }

    // 6. Día de Pago
    if (detalles.diaPago && detalles.diaPago >= 1 && detalles.diaPago <= 31) {
      sesion.diaPago = detalles.diaPago;
    } else if ((!sesion.diaPago || sesion.diaPago < 1) && sesion.pasoEsperado === 'pago') {
      const numMatch = texto.match(/\b([1-9]|[12]\d|3[01])\b/);
      if (numMatch && numMatch[1]) {
        sesion.diaPago = Number(numMatch[1]);
      }
    }

    sesion.actualizadoEn = Date.now();

    // Validar si ya se completaron los datos requeridos
    if (
      sesion.nombre &&
      sesion.cupo &&
      sesion.cupo > 0 &&
      sesion.cupoDisponible !== null &&
      sesion.cupoDisponible !== undefined &&
      sesion.tasaInteresEa !== null &&
      sesion.tasaInteresEa !== undefined &&
      sesion.diaCorte &&
      sesion.diaCorte >= 1 &&
      sesion.diaCorte <= 31 &&
      sesion.diaPago &&
      sesion.diaPago >= 1 &&
      sesion.diaPago <= 31
    ) {
      const cupoTotal = sesion.cupo;
      const cupoDisponible = sesion.cupoDisponible;
      const tasaInteres = sesion.tasaInteresEa;

      const nueva = await this.tarjetasService.crear(usuarioId, {
        nombre: sesion.nombre,
        banco: sesion.banco && sesion.banco !== 'Banco' ? sesion.banco : sesion.nombre,
        diaCorte: sesion.diaCorte,
        diaPago: sesion.diaPago,
        cupo: cupoTotal,
        cupoDisponible: cupoDisponible,
        tasaInteresEa: tasaInteres,
        aceptaCompras: true,
        cobraInteresUnaCuota: false,
      });

      this.sesionesRegistroTarjetas.delete(usuarioId);

      const saldoEnUso = Math.max(0, cupoTotal - cupoDisponible);
      let balanceTexto = `• 💰 *Cupo total asignado:* *${formatearMoneda(cupoTotal)}*\n• 🟢 *Cupo disponible actual:* *${formatearMoneda(cupoDisponible)}*`;
      if (saldoEnUso > 0) {
        balanceTexto += `\n• 🔴 *Saldo utilizado / por pagar:* *${formatearMoneda(saldoEnUso)}*`;
      } else {
        balanceTexto += ` _(100% libre)_`;
      }
      balanceTexto += `\n• 📈 *Tasa de interés:* *${nueva.tasaInteresEa ?? 28.0}% E.A.*`;

      return `💳 *¡Tarjeta guardada con éxito!*

• Tarjeta: *${nueva.nombre}* (${nueva.banco})
${balanceTexto}
• ✂️ Día de corte: *${nueva.diaCorte}* de cada mes
• 📅 Día de pago: *${nueva.diaPago}* de cada mes

💡 A partir de ahora, cuando vayas a comprar algo, pregúntame:
_"¿Qué tarjeta uso hoy para 500 mil?"_ y te diré si es el mejor momento para ganar hasta 50 días libres de interés o cuál cobra menor interés a varias cuotas.`;
    }

    return this.pedirSiguienteDatoTarjeta(sesion);
  }

  private pedirSiguienteDatoObligacion(sesion: RegistroObligacionPendiente): string {
    if (!sesion.nombre || sesion.nombre === 'Crédito') {
      sesion.pasoEsperado = 'nombre';
      return `🏦 ¡Perfecto! Vamos a registrar tu crédito u obligación para recordarte los pagos oportunos y darte estrategias de ahorro e intereses 💡

1️⃣ ¿Cuál es el *tipo o nombre del crédito y entidad*?
(Ej: _Crédito de Vehículo Sufi_, _Hipotecario Davivienda_, _Libre Inversión Bancolombia_)`;
    }

    if (!sesion.saldo || sesion.saldo <= 0) {
      sesion.pasoEsperado = 'saldo';
      return `Excelente, *${sesion.nombre}* 📄

2️⃣ ¿Cuál es el *saldo pendiente o monto total del crédito*?
(Ej: _$80.000.000_ o _45 millones_)`;
    }

    if (!sesion.cuotasRestantes || sesion.cuotasRestantes <= 0) {
      sesion.pasoEsperado = 'cuotas';
      return `Saldo anotado: *${formatearMoneda(sesion.saldo)}* 💰

3️⃣ ¿A cuántos *meses o cuotas pendientes* está el crédito?
(Ej: _46 meses_, _24 cuotas_)`;
    }

    if (sesion.tasaEa === null || sesion.tasaEa === undefined) {
      sesion.pasoEsperado = 'tasa';
      return `Plazo registrado: *${sesion.cuotasRestantes} meses* ⏳

4️⃣ ¿Cuál es la *tasa de interés del crédito*?
(Ej: _11% EA_, _1.2% mensual_, o escribe _"omitir"_ si no la recuerdas)`;
    }

    if (!sesion.diaPago || sesion.diaPago < 1 || sesion.diaPago > 31) {
      sesion.pasoEsperado = 'diaPago';
      const tasaStr = sesion.tasaEa ? `Tasa registrada: *${sesion.tasaEa}% E.A.* 📈\n\n` : '';
      return `${tasaStr}5️⃣ Por último, ¿qué *día del mes es tu fecha de pago oportuno*?
(Escribe solo el número del día, ej: _2_)`;
    }

    return '';
  }

  private async continuarRegistroObligacion(
    usuarioId: string,
    texto: string,
    sesion: RegistroObligacionPendiente,
  ): Promise<string> {
    const detalles = extraerDetallesObligacion(texto);
    const lower = texto.toLowerCase().trim();

    // 1. Nombre y Entidad
    if (detalles.nombre && detalles.nombre !== 'Crédito') {
      sesion.nombre = detalles.nombre;
      if (detalles.entidad) sesion.entidad = detalles.entidad;
    } else if ((!sesion.nombre || sesion.nombre === 'Crédito') && sesion.pasoEsperado === 'nombre') {
      const nombreLimpio = texto.trim().replace(/^(es|mi crédito es|crédito|deuda|préstamo)\s+/i, '');
      if (nombreLimpio.length >= 2 && !/^\d+$/.test(nombreLimpio)) {
        sesion.nombre = nombreLimpio;
      }
    }

    // 2. Saldo / Monto total
    if (detalles.saldo && detalles.saldo > 0) {
      sesion.saldo = detalles.saldo;
    } else if ((!sesion.saldo || sesion.saldo <= 0) && sesion.pasoEsperado === 'saldo') {
      const monto = extraerMontoColombiano(texto);
      if (monto && monto > 0) {
        sesion.saldo = monto;
      }
    }

    // 3. Cuotas / Plazo
    if (detalles.cuotasRestantes && detalles.cuotasRestantes > 0) {
      sesion.cuotasRestantes = detalles.cuotasRestantes;
    } else if ((!sesion.cuotasRestantes || sesion.cuotasRestantes <= 0) && sesion.pasoEsperado === 'cuotas') {
      const matchNum = lower.match(/\b(\d{1,3})\b/);
      if (matchNum && matchNum[1]) {
        sesion.cuotasRestantes = Number(matchNum[1]);
      }
    }

    // 4. Tasa de interés
    if (detalles.tasaEa !== null && detalles.tasaEa !== undefined) {
      sesion.tasaEa = detalles.tasaEa;
      sesion.tasaMv = detalles.tasaMv ?? null;
    } else if (sesion.pasoEsperado === 'tasa') {
      if (
        lower.includes('omitir') ||
        lower.includes('no se') ||
        lower.includes('no sé') ||
        lower.includes('despues') ||
        lower.includes('paso')
      ) {
        sesion.tasaEa = null;
      } else {
        const matchNum = lower.match(/(\d{1,2}(?:[.,]\d{1,2})?)/);
        if (matchNum && matchNum[1]) {
          const val = Number(matchNum[1].replace(',', '.'));
          if (val <= 5 || lower.includes('mensual') || lower.includes('mv')) {
            const ea = (Math.pow(1 + val / 100, 12) - 1) * 100;
            sesion.tasaEa = Math.round(ea * 10) / 10;
            sesion.tasaMv = val;
          } else {
            sesion.tasaEa = val;
            sesion.tasaMv = Math.round(((Math.pow(1 + val / 100, 1 / 12) - 1) * 100) * 100) / 100;
          }
        }
      }
    }

    // 5. Día de Pago Oportuno
    if (detalles.diaPago && detalles.diaPago >= 1 && detalles.diaPago <= 31) {
      sesion.diaPago = detalles.diaPago;
    } else if ((!sesion.diaPago || sesion.diaPago < 1) && sesion.pasoEsperado === 'diaPago') {
      const numMatch = texto.match(/\b([1-9]|[12]\d|3[01])\b/);
      if (numMatch && numMatch[1]) {
        sesion.diaPago = Number(numMatch[1]);
      }
    }

    sesion.actualizadoEn = Date.now();

    // Validar si ya se completaron los datos mínimos para registrar la obligación
    if (
      sesion.nombre &&
      sesion.nombre !== 'Crédito' &&
      sesion.saldo &&
      sesion.saldo > 0 &&
      sesion.cuotasRestantes &&
      sesion.cuotasRestantes > 0 &&
      sesion.diaPago &&
      sesion.diaPago >= 1 &&
      sesion.diaPago <= 31
    ) {
      const obligacion = await this.obligacionesService.crear(usuarioId, {
        nombre: sesion.nombre,
        tipo: sesion.tipo ?? 'deuda',
        entidad: sesion.entidad ?? null,
        saldo: sesion.saldo,
        tasaEa: sesion.tasaEa ?? null,
        tasaMv: sesion.tasaMv ?? null,
        cuota: sesion.cuota ?? null,
        cuotasRestantes: sesion.cuotasRestantes,
        cuotasTotales: sesion.cuotasRestantes,
        diaPago: sesion.diaPago,
      });

      this.sesionesRegistroObligaciones.delete(usuarioId);

      const consejo = generarConsejoAceleracionDeuda(
        obligacion.saldo ?? 0,
        obligacion.tasaEa ?? null,
        obligacion.cuotasRestantes ?? 12,
        obligacion.cuota,
      );

      return this.respuestasService.mensajeObligacionGuardada(obligacion, consejo);
    }

    return this.pedirSiguienteDatoObligacion(sesion);
  }
}
