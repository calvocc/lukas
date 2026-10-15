/**
 * ========================================================
 * Proveedor de IA con OpenAI (GPT-4o-mini)
 * Salida estructurada estricta JSON
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LukasConfigService } from '../config/config.service';
import { ParserResult } from '../domain/types';
import { ProveedorIA, ContextoMensaje } from './parser.interface';
import { extraerMontoColombiano, extraerDetallesTarjeta } from './parser.utils';

@Injectable()
export class OpenAiProvider implements ProveedorIA {
  private readonly logger = new Logger(OpenAiProvider.name);
  private openai: OpenAI | null = null;

  constructor(private readonly config: LukasConfigService = new LukasConfigService()) {
    const apiKey = this.config.openaiApiKey;
    if (apiKey && apiKey.trim().length > 0) {
      this.openai = new OpenAI({ apiKey });
      this.logger.log(`OpenAI Provider inicializado con modelo: ${this.config.iaModelo}`);
    } else {
      this.logger.warn('OPENAI_API_KEY no configurada. Se utilizará el parser determinista de respaldo.');
    }
  }

  async interpretar(mensaje: string, contexto: ContextoMensaje): Promise<ParserResult> {
    if (!this.openai) {
      return this.interpretarFallback(mensaje, contexto);
    }

    const systemPrompt = `
Eres el Intérprete del bot Lukas (asistente de finanzas personales en Colombia).
Tu única función es extraer la información del mensaje del usuario y devolverla en formato JSON ESTRICTO según el contrato.
NUNCA respondas con texto conversacional ni hagas cálculos matemáticos.

Contexto del usuario:
- Fecha actual: ${contexto.fechaActual}
- Tarjetas activas: ${JSON.stringify(contexto.tarjetasActivas)}
- Obligaciones/Deudas activas: ${JSON.stringify(contexto.obligacionesActivas)}
- Última transacción: ${contexto.ultimaTransaccion ? JSON.stringify(contexto.ultimaTransaccion) : 'Ninguna'}

Intenciones posibles:
- "registro": Gasto o ingreso (ej: "85000 mercado gold", "me pagaron 3 millones")
- "consulta": Preguntas o consultas del usuario. DEBES determinar la intención y el campo "consulta.tipoConsulta" exacto:
    * "tarjetas": cuando el usuario pide ver, listar o consultar cuáles tarjetas tiene registradas (ej: "muéstrame mis tarjetas", "qué tarjetas tengo", "ver tarjetas", "tarjetas registradas", "cuáles tarjetas tengo", "hola me indicas qué tarjetas tengo registradas").
    * "saldo": cuando pregunta por el cupo disponible, saldo o cuánto le queda en una tarjeta o en general (ej: "cuánto cupo tengo en la diners", "cuánto me queda", "saldo de la gold", "cuál es mi cupo disponible"). Extrae el nombre de la tarjeta en "consulta.tarjeta" si la menciona.
    * "ciclo_tarjeta": cuando pregunta por fechas de corte, días de pago o plazos de sus tarjetas (ej: "cuándo corta la nu", "cuándo debo pagar la diners", "fechas de corte", "cuándo es mi fecha límite de pago"). Extrae la tarjeta en "consulta.tarjeta" si la menciona.
    * "mejor_tarjeta": cuando el usuario pide recomendación sobre qué tarjeta usar para realizar una compra (ej: "qué tarjeta uso hoy para 500 mil", "cuál tarjeta uso", "con qué tarjeta compro"). Extrae "consulta.montoSimulado" si indica un monto.
    * "deudas": cuando pregunta cuánto debe en total, saldo deudor o deudas pendientes (ej: "cuánto debo en total", "mis deudas", "deuda consolidada", "obligaciones pendientes").
    * "total_periodo": cuando pregunta cuánto ha gastado en un período específico (ej: "cuánto he gastado hoy", "gastos de esta semana", "cuánto gasté este mes", "cuánto gasté el mes pasado"). En "consulta.periodo" indica "hoy", "semana", "mes" o "mes_pasado".
    * "total_categoria": cuando pregunta cuánto ha gastado en un rubro o categoría específica (ej: "cuánto he gastado en comida", "cuánto llevo en mercado este mes", "gastos en transporte"). En "consulta.categoriaConsulta" indica la categoría (ej: "Comida", "Transporte", etc.).
    * "resumen" o "balance": cuando pide balance general, estado del mes o cómo va (ej: "cómo voy este mes", "resumen del mes", "balance general").
- "pago_tarjeta": Cuando el usuario dice que ya pagó su tarjeta (ej: "ya pagué la gold", "pagué nu")
- "pago_obligacion": Cuando el usuario paga una deuda fija (ej: "pagué la cuota del kona", "pagué el arriendo")
- "correccion": Corregir o cambiar cuotas de una compra (ej: "ya pasé la de amazon a 1 cuota", "cambiar a 1 cuota")
- "eliminacion": Borrar la última transacción (ej: "borra el último", "elimina ese gasto")
- "config_presupuesto": Establecer o modificar el tope mensual de gasto global (ej: "mi presupuesto este mes es 3 millones", "cambiar umbral a 4.5m")
- "config_tarjeta": Cuando el usuario quiere agregar, registrar o configurar una tarjeta de crédito, ya sea iniciando el proceso o con datos completos (ej: "registremos una tarjeta", "agregar tarjeta", "registrar tarjeta diners davivienda cupo de 14.000.000 corte los 20 pago los 5")
- "ayuda": Preguntas sobre qué puede hacer Lukas (ej: "ayuda", "qué puedes hacer")
- "no_entendido": Todo lo demás

Estructura JSON requerida:
{
  "intencion": "registro" | "consulta" | "pago_tarjeta" | "pago_obligacion" | "correccion" | "eliminacion" | "config_presupuesto" | "config_tarjeta" | "ayuda" | "no_entendido",
  "tonoDetectado": "neutro" | "casual" | "entusiasta" | "formal",
  "transacciones": [
    {
      "monto": number | null,
      "montoConfianza": "alta" | "baja",
      "categoria": "Comida" | "Transporte" | "Arriendo" | "Servicios" | "Entretenimiento" | "Salud" | "Otros",
      "categoriaConfianza": "alta" | "baja",
      "descripcion": string | null,
      "tipo": "gasto" | "ingreso",
      "medioPago": "tarjeta" | "debito" | "efectivo" | "transferencia" | null,
      "tarjeta": string | null,
      "cuotas": number
    }
  ],
  "consulta": {
    "tipoConsulta": "mejor_tarjeta" | "tarjetas" | "saldo" | "ciclo_tarjeta" | "total_periodo" | "total_categoria" | "balance" | "resumen" | "proximos_pagos" | "deudas",
    "periodo": "hoy" | "semana" | "mes" | "mes_pasado",
    "categoriaConsulta": string | null,
    "tarjeta": string | null,
    "montoSimulado": number | null
  },
  "pagoTarjeta": {
    "tarjeta": string
  },
  "pagoObligacion": {
    "obligacion": string
  },
  "configPresupuesto": {
    "limiteGastoMensual": number
  },
  "configTarjeta": {
    "nombre": string | null,
    "banco": string | null,
    "cupo": number | null,
    "diaCorte": number | null,
    "diaPago": number | null
  },
  "correccionCuotas": {
    "tarjeta": string | null,
    "nuevasCuotas": number
  }
}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.iaModelo,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: mensaje },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Respuesta vacía de OpenAI');
      }

      const parsedUnknown: unknown = JSON.parse(content);
      return this.validarYSanitizar(parsedUnknown);
    } catch (err: unknown) {
      const mensajeError = err instanceof Error ? err.message : String(err);
      this.logger.error('Error llamando a OpenAI, activando fallback:', mensajeError);
      return this.interpretarFallback(mensaje, contexto);
    }
  }

  /**
   * Fallback determinista que interpreta intenciones y comandos clave
   * garantizando que el sistema opere al 100% incluso sin internet o sin API Key.
   */
  interpretarFallback(mensaje: string, contexto: ContextoMensaje): ParserResult {
    const texto = mensaje.trim().toLowerCase();

    // 1. Ayuda
    if (texto === 'ayuda' || texto.includes('qué puedes hacer') || texto === 'hola' || texto === 'menu') {
      return { intencion: 'ayuda', tonoDetectado: 'casual' };
    }

    // 2. Borrar último
    if (texto.includes('borra el último') || texto.includes('borrar último') || texto === 'deshacer') {
      return { intencion: 'eliminacion', tonoDetectado: 'casual' };
    }

    // 3. Registrar o agregar tarjeta de crédito (tolera errores como "registar", "dinner", "registremos una tarjeta", etc.)
    const tienePalabraTarjeta = texto.includes('tarjeta') || texto.includes('tc');
    const tieneCorteOPago = texto.includes('corte') && (texto.includes('pago') || texto.includes('cupo'));
    const esComandoRegistroTarjeta =
      /(?:regis?tr\w*|agreg\w*|crear|meter|guardar|inscrib\w*|nueva)\s+(?:una\s+|la\s+|mi\s+|mis\s+|otra\s+)?tarjeta/i.test(texto) ||
      texto.includes('configurar tarjeta') ||
      (tienePalabraTarjeta && (texto.includes('cupo') || tieneCorteOPago));

    if (esComandoRegistroTarjeta) {
      const configTarjeta = extraerDetallesTarjeta(mensaje);
      return {
        intencion: 'config_tarjeta',
        tonoDetectado: 'casual',
        configTarjeta,
      };
    }

    // 4. Pago de tarjeta ("ya pagué la gold", "pagué nu")
    if (
      texto.startsWith('ya pagué') ||
      texto.startsWith('ya pague') ||
      texto.startsWith('pagué la ') ||
      texto.startsWith('pague la ') ||
      texto.startsWith('pagué ') ||
      texto.startsWith('pague ')
    ) {
      const partes = texto
        .replace('ya pagué', '')
        .replace('ya pague', '')
        .replace('pagué la', '')
        .replace('pague la', '')
        .replace('pagué', '')
        .replace('pague', '')
        .trim();

      const nombreLimpio = partes
        .replace(/^(la|el|las|los|mi|mis|cuota del|cuota de la|cuota de|de la|del)\s+/i, '')
        .trim();

      // Buscar coincidencia en tarjetas
      const tarjeta = contexto.tarjetasActivas.find(
        (t) =>
          partes.includes(t.nombre.toLowerCase()) ||
          partes.includes(t.banco.toLowerCase()) ||
          nombreLimpio.includes(t.nombre.toLowerCase()) ||
          nombreLimpio.includes(t.banco.toLowerCase()) ||
          t.nombre.toLowerCase().includes(nombreLimpio) ||
          t.banco.toLowerCase().includes(nombreLimpio),
      );
      if (tarjeta) {
        return {
          intencion: 'pago_tarjeta',
          tonoDetectado: 'casual',
          pagoTarjeta: { tarjeta: tarjeta.nombre },
        };
      }
      // Si no es tarjeta, buscar en obligaciones
      const obligacion = contexto.obligacionesActivas.find(
        (o) =>
          partes.includes(o.nombre.toLowerCase()) ||
          nombreLimpio.includes(o.nombre.toLowerCase()) ||
          o.nombre.toLowerCase().includes(nombreLimpio),
      );
      if (obligacion) {
        return {
          intencion: 'pago_obligacion',
          tonoDetectado: 'casual',
          pagoObligacion: { obligacion: obligacion.nombre },
        };
      }
    }

    // 5. Corrección de cuotas ("ya pasé a 1 cuota", "cambiar a 1 cuota")
    if (
      texto.includes('ya pasé') ||
      texto.includes('ya pase') ||
      texto.includes('cambiar cuotas') ||
      texto.includes('cambiar a 1 cuota') ||
      texto.includes('poner a 1 cuota') ||
      texto.includes('dejar a 1 cuota') ||
      texto.includes('actualizar a 1 cuota') ||
      texto.includes('rediferir a 1')
    ) {
      return {
        intencion: 'correccion',
        tonoDetectado: 'casual',
        correccionCuotas: {
          tarjeta: undefined,
          nuevasCuotas: 1,
        },
      };
    }

    // 6. Consulta de tarjetas registradas ("mis tarjetas", "muéstrame las tarjetas", etc.)
    if (
      texto.includes('mis tarjetas') ||
      texto.includes('ver tarjetas') ||
      texto.includes('mostrar tarjetas') ||
      texto.includes('muestrame las tarjetas') ||
      texto.includes('muéstrame las tarjetas') ||
      texto.includes('muestrame mis tarjetas') ||
      texto.includes('muéstrame mis tarjetas') ||
      texto.includes('cuáles tarjetas') ||
      texto.includes('cuales tarjetas') ||
      texto.includes('qué tarjetas tengo') ||
      texto.includes('que tarjetas tengo') ||
      texto.includes('tarjetas que tengo') ||
      texto.includes('tarjetas registradas') ||
      texto.includes('listar tarjetas') ||
      texto === 'tarjetas'
    ) {
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

    // 7. Consulta de saldo o cupo disponible ("cuánto cupo tengo en la diners", "saldo de la gold", "cuánto me queda")
    if (
      texto.includes('saldo') ||
      texto.includes('cupo disponible') ||
      texto.includes('cuanto cupo') ||
      texto.includes('cuánto cupo') ||
      texto.includes('cuanto me queda') ||
      texto.includes('cuánto me queda')
    ) {
      const tarjeta = this.identificarTarjetaEnTexto(texto, contexto.tarjetasActivas);
      return {
        intencion: 'consulta',
        tonoDetectado: 'casual',
        consulta: {
          tipoConsulta: 'saldo',
          periodo: 'mes',
          categoriaConsulta: null,
          tarjeta,
          montoSimulado: null,
        },
      };
    }

    // 8. Consulta de fechas de corte o pago ("cuándo corta la nu", "cuándo debo pagar", "fechas de corte")
    if (
      texto.includes('cuando corta') ||
      texto.includes('cuándo corta') ||
      texto.includes('corte de la') ||
      texto.includes('fecha de corte') ||
      texto.includes('fechas de corte') ||
      texto.includes('cuando pago') ||
      texto.includes('cuándo pago') ||
      texto.includes('cuando debo pagar') ||
      texto.includes('cuándo debo pagar') ||
      texto.includes('fecha de pago') ||
      texto.includes('fechas de pago')
    ) {
      const tarjeta = this.identificarTarjetaEnTexto(texto, contexto.tarjetasActivas);
      return {
        intencion: 'consulta',
        tonoDetectado: 'casual',
        consulta: {
          tipoConsulta: 'ciclo_tarjeta',
          periodo: 'mes',
          categoriaConsulta: null,
          tarjeta,
          montoSimulado: null,
        },
      };
    }

    // 9. Configuración de presupuesto ("mi presupuesto es 3 millones", "umbral a 4m")
    if (texto.includes('presupuesto') || texto.includes('umbral')) {
      const monto = extraerMontoColombiano(texto);
      if (monto && monto > 0) {
        return {
          intencion: 'config_presupuesto',
          tonoDetectado: 'casual',
          configPresupuesto: { limiteGastoMensual: monto },
        };
      }
    }

    // 10. Consulta de mejor tarjeta ("qué tarjeta uso hoy para 500 mil")
    if (texto.includes('qué tarjeta') || texto.includes('cual tarjeta') || texto.includes('mejor tarjeta')) {
      const montoSimulado = extraerMontoColombiano(texto);
      return {
        intencion: 'consulta',
        tonoDetectado: 'casual',
        consulta: {
          tipoConsulta: 'mejor_tarjeta',
          periodo: 'hoy',
          categoriaConsulta: null,
          tarjeta: null,
          montoSimulado,
        },
      };
    }

    // 11. Consulta de gastos por período ("cuánto he gastado hoy / esta semana / el mes pasado")
    if (
      texto.includes('cuánto he gastado hoy') ||
      texto.includes('cuanto he gastado hoy') ||
      texto.includes('gasto de hoy') ||
      texto.includes('gastos de hoy')
    ) {
      return {
        intencion: 'consulta',
        tonoDetectado: 'casual',
        consulta: {
          tipoConsulta: 'total_periodo',
          periodo: 'hoy',
          categoriaConsulta: null,
          tarjeta: null,
          montoSimulado: null,
        },
      };
    }
    if (
      texto.includes('esta semana') ||
      texto.includes('de la semana')
    ) {
      return {
        intencion: 'consulta',
        tonoDetectado: 'casual',
        consulta: {
          tipoConsulta: 'total_periodo',
          periodo: 'semana',
          categoriaConsulta: null,
          tarjeta: null,
          montoSimulado: null,
        },
      };
    }
    if (
      texto.includes('mes pasado') ||
      texto.includes('mes anterior')
    ) {
      return {
        intencion: 'consulta',
        tonoDetectado: 'casual',
        consulta: {
          tipoConsulta: 'total_periodo',
          periodo: 'mes_pasado',
          categoriaConsulta: null,
          tarjeta: null,
          montoSimulado: null,
        },
      };
    }

    // 12. Consulta de gastos por categoría ("cuánto he gastado en comida / mercado / uber")
    if (
      texto.includes('en comida') ||
      texto.includes('en restaurante') ||
      texto.includes('en mercado') ||
      texto.includes('en transporte') ||
      texto.includes('en servicios')
    ) {
      let cat = 'Otros';
      if (texto.includes('comida') || texto.includes('restaurante') || texto.includes('mercado')) {
        cat = 'Comida';
      } else if (texto.includes('transporte') || texto.includes('uber') || texto.includes('taxi')) {
        cat = 'Transporte';
      } else if (texto.includes('servicios')) {
        cat = 'Servicios';
      }

      return {
        intencion: 'consulta',
        tonoDetectado: 'casual',
        consulta: {
          tipoConsulta: 'total_categoria',
          periodo: 'mes',
          categoriaConsulta: cat,
          tarjeta: null,
          montoSimulado: null,
        },
      };
    }

    // 13. Consultas generales de deudas y balance ("cuánto llevo", "cómo voy", "deudas")
    if (
      texto.includes('cuánto llevo') ||
      texto.includes('cuanto llevo') ||
      texto.includes('cómo voy') ||
      texto.includes('como voy') ||
      texto.includes('balance') ||
      texto.includes('debo') ||
      texto.includes('deuda')
    ) {
      const tipoConsulta = texto.includes('debo') || texto.includes('deuda') ? 'deudas' : 'resumen';
      return {
        intencion: 'consulta',
        tonoDetectado: 'casual',
        consulta: {
          tipoConsulta,
          periodo: 'mes',
          categoriaConsulta: null,
          tarjeta: null,
          montoSimulado: null,
        },
      };
    }

    // 10. Registro de gasto/ingreso mediante extracción de montos colombianos
    const monto = extraerMontoColombiano(texto);
    if (monto && monto > 0) {
      // Buscar si menciona alguna tarjeta
      let tarjetaEncontrada: string | null = null;
      const palabras = texto.split(/\s+/);
      for (const t of contexto.tarjetasActivas) {
        const nom = t.nombre.toLowerCase();
        const banco = t.banco.toLowerCase();
        if (
          texto.includes(nom) ||
          texto.includes(banco) ||
          palabras.some((p) => p.length >= 2 && (nom.includes(p) || banco.includes(p)))
        ) {
          tarjetaEncontrada = t.nombre;
          break;
        }
      }

      // Buscar si menciona cuotas
      let cuotas = 1;
      const cuotasMatch = texto.match(/(\d+)\s*cuota/);
      if (cuotasMatch && cuotasMatch[1]) {
        cuotas = Number(cuotasMatch[1]);
      }

      // Detectar categoría simple
      let categoria = 'Otros';
      if (texto.includes('mercado') || texto.includes('almuerzo') || texto.includes('comida') || texto.includes('restaurante')) {
        categoria = 'Comida';
      } else if (texto.includes('uber') || texto.includes('taxi') || texto.includes('gasolina') || texto.includes('transporte')) {
        categoria = 'Transporte';
      }

      return {
        intencion: 'registro',
        tonoDetectado: 'casual',
        transacciones: [
          {
            monto,
            montoConfianza: 'alta',
            categoria,
            categoriaConfianza: 'alta',
            descripcion: texto,
            tipo: texto.includes('me pagaron') || texto.includes('ingreso') ? 'ingreso' : 'gasto',
            medioPago: tarjetaEncontrada ? 'tarjeta' : 'efectivo',
            tarjeta: tarjetaEncontrada,
            cuotas,
          },
        ],
      };
    }

    return { intencion: 'no_entendido', tonoDetectado: 'neutro' };
  }

  private identificarTarjetaEnTexto(
    texto: string,
    tarjetasActivas: readonly { id: string; nombre: string; banco: string }[],
  ): string | null {
    const stopwords = new Set(['en', 'la', 'el', 'de', 'mi', 'mis', 'con', 'para', 'tarjeta', 'cupo', 'saldo', 'corte', 'pago']);
    const palabras = texto
      .toLowerCase()
      .replace(/[/\\?¿!¡.,;:]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length >= 2 && !stopwords.has(p));

    for (const t of tarjetasActivas) {
      const nom = t.nombre.toLowerCase();
      const banco = t.banco.toLowerCase();
      if (texto.includes(nom) || texto.includes(banco)) {
        return t.nombre;
      }
      if (palabras.some((p) => nom.includes(p) || banco.includes(p))) {
        return t.nombre;
      }
    }
    return null;
  }

  private validarYSanitizar(obj: unknown): ParserResult {
    if (typeof obj !== 'object' || obj === null) {
      return { intencion: 'no_entendido', tonoDetectado: 'neutro' };
    }

    const rec = obj as Record<string, unknown>;
    const intencion = typeof rec['intencion'] === 'string' ? (rec['intencion'] as ParserResult['intencion']) : 'no_entendido';
    const tonoDetectado = typeof rec['tonoDetectado'] === 'string' ? (rec['tonoDetectado'] as ParserResult['tonoDetectado']) : 'neutro';

    return {
      intencion,
      tonoDetectado,
      transacciones: Array.isArray(rec['transacciones'])
        ? (rec['transacciones'] as ParserResult['transacciones'])
        : undefined,
      consulta: typeof rec['consulta'] === 'object' && rec['consulta'] !== null
        ? (rec['consulta'] as ParserResult['consulta'])
        : undefined,
      pagoTarjeta: typeof rec['pagoTarjeta'] === 'object' && rec['pagoTarjeta'] !== null
        ? (rec['pagoTarjeta'] as ParserResult['pagoTarjeta'])
        : undefined,
      pagoObligacion: typeof rec['pagoObligacion'] === 'object' && rec['pagoObligacion'] !== null
        ? (rec['pagoObligacion'] as ParserResult['pagoObligacion'])
        : undefined,
      configPresupuesto: typeof rec['configPresupuesto'] === 'object' && rec['configPresupuesto'] !== null
        ? (rec['configPresupuesto'] as ParserResult['configPresupuesto'])
        : undefined,
      configTarjeta: typeof rec['configTarjeta'] === 'object' && rec['configTarjeta'] !== null
        ? (rec['configTarjeta'] as ParserResult['configTarjeta'])
        : undefined,
      correccionCuotas: typeof rec['correccionCuotas'] === 'object' && rec['correccionCuotas'] !== null
        ? (rec['correccionCuotas'] as ParserResult['correccionCuotas'])
        : undefined,
    };
  }
}
