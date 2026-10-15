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
import { formatearMoneda } from '../respuestas/formateador';

@Injectable()
export class CanalRouterService {
  private readonly logger = new Logger(CanalRouterService.name);

  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly parserService: ParserService,
    private readonly respuestasService: RespuestasService,
    private readonly movimientosService: MovimientosService,
    private readonly tarjetasService: TarjetasService,
    private readonly obligacionesService: ObligacionesService,
    private readonly db: DatabaseService,
  ) {}

  async procesarMensaje(numeroWhatsapp: string, textoMensaje: string): Promise<string> {
    const texto = textoMensaje.trim();
    if (!texto) {
      return '';
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
    this.logger.log(`Intención interpretada: ${parsed.intencion} (Tono: ${parsed.tonoDetectado})`);

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
        // Registro guiado o extraído de tarjeta
        // Si el usuario escribe: "Registrar tarjeta Nu cupo 3 millones corte 15 pago 5"
        const numMatches = texto.match(/\d+/g);
        let diaCorte = 15;
        let diaPago = 5;
        let cupo = 3000000;

        const corteIdx = texto.indexOf('corte');
        if (corteIdx !== -1) {
          const despues = texto.slice(corteIdx);
          const corteNum = despues.match(/\d+/);
          if (corteNum) diaCorte = Number(corteNum[0]);
        }

        const pagoIdx = texto.indexOf('pago');
        if (pagoIdx !== -1) {
          const despues = texto.slice(pagoIdx);
          const pagoNum = despues.match(/\d+/);
          if (pagoNum) diaPago = Number(pagoNum[0]);
        }

        if (numMatches && numMatches[0]) {
          cupo = Number(numMatches[0]);
          if (texto.includes('millon') && cupo < 1000) cupo *= 1000000;
        }

        let banco = 'Banco';
        let nombre = 'Mi Tarjeta';
        if (texto.toLowerCase().includes('nu')) {
          banco = 'Nubank';
          nombre = 'Nubank';
        } else if (texto.toLowerCase().includes('bancolombia')) {
          banco = 'Bancolombia';
          nombre = 'Bancolombia';
        } else if (texto.toLowerCase().includes('falabella')) {
          banco = 'Falabella';
          nombre = 'Falabella CMR';
        }

        const nueva = await this.tarjetasService.crear(usuario.id, {
          nombre,
          banco,
          diaCorte,
          diaPago,
          cupo,
          cupoDisponible: cupo,
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

      case 'consulta': {
        const tipoConsulta = parsed.consulta?.tipoConsulta ?? 'resumen';

        if (tipoConsulta === 'mejor_tarjeta') {
          const monto = parsed.consulta?.montoSimulado ?? 100000;
          const recomendaciones = await this.tarjetasService.recomendarMejorTarjeta(usuario.id, monto);
          return this.respuestasService.mensajeRecomendacionTarjeta(monto, recomendaciones);
        }

        if (tipoConsulta === 'deudas') {
          return this.respuestasService.mensajeResumenDeudas(tarjetas, obligaciones);
        }

        // Resumen / Balance
        const gastoMes = await this.movimientosService.calcularGastoMesActual(usuario.id);
        const limitePresupuesto = usuario.limiteGastoMensual;
        let respuesta = `📊 *Balance del Mes:*\n\n• Gasto total acumulado: *${formatearMoneda(gastoMes)}*`;
        if (limitePresupuesto) {
          const pct = Math.round((gastoMes / limitePresupuesto) * 100);
          respuesta += `\n• Presupuesto mensual: *${formatearMoneda(limitePresupuesto)}* (${pct}% consumido)`;
        }
        respuesta += `\n• Tarjetas activas: ${tarjetas.length}\n• Obligaciones activas: ${obligaciones.length}`;
        return respuesta;
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
}
