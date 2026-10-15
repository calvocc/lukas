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
import { ObligacionesService } from '../obligaciones/obligaciones.service';
import { DatabaseService } from '../database/database.service';
import { ContextoMensaje } from '../parser/parser.interface';
import { Tarjeta } from '../domain/types';
import { formatearMoneda } from '../respuestas/formateador';
import { extraerDetallesTarjeta, extraerMontoColombiano } from '../parser/parser.utils';

export interface RegistroTarjetaPendiente {
  nombre: string | null;
  banco: string | null;
  cupo: number | null;
  diaCorte: number | null;
  diaPago: number | null;
  pasoEsperado?: 'nombre' | 'cupo' | 'corte' | 'pago';
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

  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly parserService: ParserService,
    private readonly respuestasService: RespuestasService,
    private readonly movimientosService: MovimientosService,
    private readonly tarjetasService: TarjetasService,
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

    // 3. Usuario activo: Preparar contexto para el Intérprete
    const tarjetas = await this.tarjetasService.listarPorUsuario(usuario.id);
    const obligaciones = await this.obligacionesService.listarPorUsuario(usuario.id);
    const ultimaTransaccion = await this.movimientosService.obtenerUltimaTransaccion(usuario.id);

    const contexto: ContextoMensaje = {
      fechaActual: new Date().toISOString().split('T')[0] ?? '',
      tarjetasActivas: tarjetas.map((t) => ({ id: t.id, nombre: t.nombre, banco: t.banco })),
      obligacionesActivas: obligaciones.map((o) => ({ id: o.id, nombre: o.nombre })),
      ultimaTransaccion,
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
          const nueva = await this.tarjetasService.crear(usuario.id, {
            nombre: detalles.nombre,
            banco: detalles.banco && detalles.banco !== 'Banco' ? detalles.banco : detalles.nombre,
            diaCorte: detalles.diaCorte,
            diaPago: detalles.diaPago,
            cupo: detalles.cupo,
            cupoDisponible: detalles.cupo,
            aceptaCompras: true,
            cobraInteresUnaCuota: false,
          });

          return `💳 *¡Tarjeta guardada con éxito!*

• Tarjeta: *${nueva.nombre}* (${nueva.banco})
• Cupo disponible: *${formatearMoneda(nueva.cupo ?? 0)}*
• Día de corte: *${nueva.diaCorte}*
• Día de pago: *${nueva.diaPago}*

💡 A partir de ahora, cuando vayas a comprar algo, pregúntame:
_"¿Qué tarjeta uso hoy para 500 mil?"_ y te diré si es el mejor momento para ganar hasta 50 días libres de interés.`;
        }

        // Si la información está incompleta, iniciar flujo conversacional guiado paso a paso
        const sesion: RegistroTarjetaPendiente = {
          nombre: tieneNombre ? detalles.nombre : null,
          banco: tieneNombre ? detalles.banco : null,
          cupo: tieneCupo ? detalles.cupo : null,
          diaCorte: tieneCorte ? detalles.diaCorte : null,
          diaPago: tienePago ? detalles.diaPago : null,
          actualizadoEn: Date.now(),
        };
        this.sesionesRegistroTarjetas.set(usuario.id, sesion);
        return this.pedirSiguienteDatoTarjeta(sesion);
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

          case 'saldo':
            return this.respuestasService.mensajeConsultaSaldo(tarjetaObjetivo, tarjetasActualizadas);

          case 'ciclo_tarjeta':
            return this.respuestasService.mensajeConsultaCiclo(tarjetaObjetivo, tarjetasActualizadas);

          case 'mejor_tarjeta': {
            const monto = parsed.consulta?.montoSimulado ?? 100000;
            const recomendaciones = await this.tarjetasService.recomendarMejorTarjeta(usuario.id, monto);
            return this.respuestasService.mensajeRecomendacionTarjeta(monto, recomendaciones);
          }

          case 'deudas':
            return this.respuestasService.mensajeResumenDeudas(tarjetasActualizadas, obligaciones);

          case 'total_periodo': {
            const periodo = parsed.consulta?.periodo ?? 'mes';
            const gastoPeriodo = await this.movimientosService.calcularGastoPeriodo(usuario.id, periodo);
            return this.respuestasService.mensajeGastoPeriodo(
              periodo,
              gastoPeriodo,
              usuario.limiteGastoMensual,
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
          if (t.tarjeta) {
            tarjetaAsignada = await this.tarjetasService.buscarPorNombreOAlias(usuario.id, t.tarjeta);
          } else if (t.medioPago === 'tarjeta' && tarjetas.length > 0) {
            // Tarjeta default o primera
            tarjetaAsignada = tarjetas.find((x) => x.esDefault) ?? tarjetas[0];
          }

          const guardada = await this.movimientosService.registrar(usuario.id, {
            tipo: t.tipo,
            monto,
            categoriaNombre: t.categoria,
            categoriaConfianza: t.categoriaConfianza,
            descripcion: t.descripcion,
            medioPago: t.medioPago ?? 'tarjeta',
            tarjetaId: tarjetaAsignada?.id ?? null,
            cuotas: t.cuotas ?? 1,
          });

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
              gastoAcumuladoMes,
              usuario.limiteGastoMensual,
            ),
          );
        }

        return respuestasVarias.join('\n\n---\n\n');
      }

      case 'no_entendido':
      default:
        return `🤔 No logré entender bien ese mensaje.
Prueba diciendo algo como:
• _"85000 mercado gold"_
• _"¿Qué tarjeta uso hoy para 500 mil?"_
• _"Ya pagué la gold"_
• _"Ayuda"_ para ver todo lo que puedo hacer.`;
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

2️⃣ ¿Cuál es tu *cupo total asignado*?
(Ej: _$14.000.000_ o _5 millones_)`;
    }

    if (!sesion.diaCorte || sesion.diaCorte < 1 || sesion.diaCorte > 31) {
      sesion.pasoEsperado = 'corte';
      return `Anotado: cupo de *${formatearMoneda(sesion.cupo)}* 💰

3️⃣ ¿Qué *día del mes es tu fecha de corte*?
(Escribe solo el número del día, ej: _20_)`;
    }

    if (!sesion.diaPago || sesion.diaPago < 1 || sesion.diaPago > 31) {
      sesion.pasoEsperado = 'pago';
      return `Corte el día *${sesion.diaCorte}* ✂️

4️⃣ Por último, ¿qué *día del mes es tu fecha límite de pago*?
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

    // 2. Cupo
    const lower = texto.toLowerCase().trim();
    if (detalles.cupo && detalles.cupo >= 10000 && (lower.includes('cupo') || sesion.pasoEsperado === 'cupo')) {
      sesion.cupo = detalles.cupo;
    } else if ((!sesion.cupo || sesion.cupo <= 0) && sesion.pasoEsperado === 'cupo') {
      const monto = extraerMontoColombiano(texto);
      if (monto && monto > 0) {
        sesion.cupo = monto;
      }
    }

    // 3. Día de Corte
    if (detalles.diaCorte && detalles.diaCorte >= 1 && detalles.diaCorte <= 31) {
      sesion.diaCorte = detalles.diaCorte;
    } else if ((!sesion.diaCorte || sesion.diaCorte < 1) && sesion.pasoEsperado === 'corte') {
      const numMatch = texto.match(/\b([1-9]|[12]\d|3[01])\b/);
      if (numMatch && numMatch[1]) {
        sesion.diaCorte = Number(numMatch[1]);
      }
    }

    // 4. Día de Pago
    if (detalles.diaPago && detalles.diaPago >= 1 && detalles.diaPago <= 31) {
      sesion.diaPago = detalles.diaPago;
    } else if ((!sesion.diaPago || sesion.diaPago < 1) && sesion.pasoEsperado === 'pago') {
      const numMatch = texto.match(/\b([1-9]|[12]\d|3[01])\b/);
      if (numMatch && numMatch[1]) {
        sesion.diaPago = Number(numMatch[1]);
      }
    }

    sesion.actualizadoEn = Date.now();

    // Validar si ya se completaron los 4 datos requeridos
    if (
      sesion.nombre &&
      sesion.cupo &&
      sesion.cupo > 0 &&
      sesion.diaCorte &&
      sesion.diaCorte >= 1 &&
      sesion.diaCorte <= 31 &&
      sesion.diaPago &&
      sesion.diaPago >= 1 &&
      sesion.diaPago <= 31
    ) {
      const nueva = await this.tarjetasService.crear(usuarioId, {
        nombre: sesion.nombre,
        banco: sesion.banco && sesion.banco !== 'Banco' ? sesion.banco : sesion.nombre,
        diaCorte: sesion.diaCorte,
        diaPago: sesion.diaPago,
        cupo: sesion.cupo,
        cupoDisponible: sesion.cupo,
        aceptaCompras: true,
        cobraInteresUnaCuota: false,
      });

      this.sesionesRegistroTarjetas.delete(usuarioId);

      return `💳 *¡Tarjeta guardada con éxito!*

• Tarjeta: *${nueva.nombre}* (${nueva.banco})
• Cupo disponible: *${formatearMoneda(nueva.cupo ?? 0)}*
• Día de corte: *${nueva.diaCorte}*
• Día de pago: *${nueva.diaPago}*

💡 A partir de ahora, cuando vayas a comprar algo, pregúntame:
_"¿Qué tarjeta uso hoy para 500 mil?"_ y te diré si es el mejor momento para ganar hasta 50 días libres de interés.`;
    }

    return this.pedirSiguienteDatoTarjeta(sesion);
  }
}
