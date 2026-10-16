/**
 * ========================================================
 * Utilidades para Extracción de Datos en Español Colombiano
 * Soporta modismos, formatos monetarios ($14.000.000, 14m, etc.)
 * y entidades financieras colombianas.
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

import { TipoCuenta, ConfigObligacionExtraida } from '../domain/types';

export interface DetallesTarjetaExtraidos {
  readonly nombre: string;
  readonly banco: string;
  readonly cupo: number | null;
  readonly cupoDisponible?: number | null;
  readonly tasaInteresEa?: number | null;
  readonly diaCorte: number | null;
  readonly diaPago: number | null;
}

/**
 * Extrae montos monetarios interpretando formatos colombianos:
 * - "14.000.000" -> 14000000
 * - "14'000.000" -> 14000000
 * - "14 millones" / "14.5 millones" / "14m" -> 14000000 / 14500000
 * - "500 mil" / "500k" -> 500000
 * - "85000" -> 85000
 */
export function extraerMontoColombiano(texto: string): number | null {
  const limpio = texto.toLowerCase().trim();

  // 1. Detección de millones ("14 millones", "14.5 millones", "14 millon", "14m")
  const regexMillones = /(?:^|\s|\$)([\d]+(?:[.,]\d+)?)\s*(?:millones?|millón|millon|mill\b|m\b)/i;
  const matchMillones = regexMillones.exec(limpio);
  if (matchMillones && matchMillones[1]) {
    const valorBase = Number(matchMillones[1].replace(',', '.'));
    if (!Number.isNaN(valorBase)) {
      return Math.round(valorBase * 1000000);
    }
  }

  // 2. Detección de miles con palabra ("500 mil", "500k")
  const regexMiles = /(?:^|\s|\$)([\d]+(?:[.,]\d+)?)\s*(?:mil\b|miles\b|k\b)/i;
  const matchMiles = regexMiles.exec(limpio);
  if (matchMiles && matchMiles[1]) {
    const valorBase = Number(matchMiles[1].replace(',', '.'));
    if (!Number.isNaN(valorBase)) {
      return Math.round(valorBase * 1000);
    }
  }

  // 3. Detección de números con separador de miles colombiano (".", ej: 14.000.000 o 85.000 o con comillas 14'000.000)
  const regexPuntos = /(?:^|\s|\$)(\d{1,3}(?:[.'’]\d{3})+(?:,\d+)?)/;
  const matchPuntos = regexPuntos.exec(limpio);
  if (matchPuntos && matchPuntos[1]) {
    const sinPuntos = matchPuntos[1].replace(/[.'’]/g, '').replace(',', '.');
    const valor = Number(sinPuntos);
    if (!Number.isNaN(valor) && valor > 0) {
      return Math.round(valor);
    }
  }

  // 4. Número entero estándar continuo ("14000000", "85000")
  const regexPlano = /(?:^|\s|\$)(\d+)(?:\s|$|[a-záéíóúñ])/i;
  const matchPlano = regexPlano.exec(limpio);
  if (matchPlano && matchPlano[1]) {
    const valor = Number(matchPlano[1]);
    if (!Number.isNaN(valor) && valor > 0) {
      return valor;
    }
  }

  return null;
}

/**
 * Extrae banco, franquicia, nombre, cupo, corte y pago para registro de tarjetas.
 * Tolera errores de tipeo comunes ("dinner" por diners, "registar" por registrar).
 */
export function extraerDetallesTarjeta(texto: string): DetallesTarjetaExtraidos {
  const lower = texto.toLowerCase();

  // 1. Día de Corte
  let diaCorte: number | null = null;
  const matchCorte = /(?:corte|corta)\s*(?:los|el|del|día|dia)?\s*(\d{1,2})\b/i.exec(lower);
  if (matchCorte && matchCorte[1]) {
    const val = Number(matchCorte[1]);
    if (val >= 1 && val <= 31) diaCorte = val;
  }

  // 2. Día de Pago
  let diaPago: number | null = null;
  const matchPago = /(?:pago|pagar|paga)\s*(?:los|el|del|día|dia)?\s*(\d{1,2})\b/i.exec(lower);
  if (matchPago && matchPago[1]) {
    const val = Number(matchPago[1]);
    if (val >= 1 && val <= 31) diaPago = val;
  }

  // 3. Cupo Total y Cupo Disponible
  let cupo: number | null = null;
  let cupoDisponible: number | null = null;

  const matchCupoTotal = /(?:cupo\s*total|cupo\s*asignado|cupo\s*aprobado|cupo)\s*(?:de|es)?\s*([$0-9.,'’\s]+?(?:millones?|millón|millon|mill\b|mil|m|k)?)(?:\s+(?:disponible|corte|pago|con|y|$))/i.exec(lower);
  if (matchCupoTotal && matchCupoTotal[1]) {
    cupo = extraerMontoColombiano(matchCupoTotal[1]);
  }

  const matchDisponible = /(?:cupo\s*disponible|disponible|saldo\s*disponible|libre)\s*(?:de|es)?\s*([$0-9.,'’\s]+?(?:millones?|millón|millon|mill\b|mil|m|k)?)(?:\s+(?:corte|pago|con|y|$))/i.exec(lower);
  if (matchDisponible && matchDisponible[1]) {
    cupoDisponible = extraerMontoColombiano(matchDisponible[1]);
  }

  const matchDebo = /(?:debo|saldo\s*(?:utilizado|en\s*uso|actual)|deuda)\s*(?:de|es)?\s*([$0-9.,'’\s]+?(?:millones?|millón|millon|mill\b|mil|m|k)?)(?:\s+(?:corte|pago|con|y|$))/i.exec(lower);
  if (matchDebo && matchDebo[1]) {
    const deuda = extraerMontoColombiano(matchDebo[1]);
    if (deuda && cupo && deuda < cupo) {
      cupoDisponible = cupo - deuda;
    }
  }

  // Si no se extrajo directamente después de "cupo", buscar el monto más significativo
  if (!cupo) {
    const montoGeneral = extraerMontoColombiano(lower);
    // Un cupo de tarjeta de crédito en Colombia es de al menos $100.000 (1 a 31 son días de corte/pago)
    if (montoGeneral && montoGeneral >= 10000 && montoGeneral !== diaCorte && montoGeneral !== diaPago) {
      cupo = montoGeneral;
    }
  }

  // 3.5. Tasa de Interés (% E.A. o % M.V.)
  let tasaInteresEa: number | null = null;
  const matchTasa = /(?:tasa|interés|interes)\s*(?:del?|de)?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:%|\bpor\s*ciento)?\s*(ea|e\.a\.|efectivo\s*anual|mv|m\.v\.|mensual|mes\s*vencido)?/i.exec(lower);
  if (matchTasa && matchTasa[1]) {
    const val = Number(matchTasa[1].replace(',', '.'));
    const tipoTasa = matchTasa[2]?.toLowerCase() ?? '';
    const esMensual = tipoTasa.includes('mv') || tipoTasa.includes('mensual') || tipoTasa.includes('vencido') || val <= 5;
    if (esMensual) {
      const ea = (Math.pow(1 + val / 100, 12) - 1) * 100;
      tasaInteresEa = Math.round(ea * 10) / 10;
    } else {
      tasaInteresEa = val;
    }
  } else {
    const matchPorcentaje = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(ea|e\.a\.|efectivo\s*anual|mv|m\.v\.|mensual|mes\s*vencido)?/i.exec(lower);
    if (matchPorcentaje && matchPorcentaje[1]) {
      const val = Number(matchPorcentaje[1].replace(',', '.'));
      const tipoTasa = matchPorcentaje[2]?.toLowerCase() ?? '';
      const esMensual = tipoTasa.includes('mv') || tipoTasa.includes('mensual') || tipoTasa.includes('vencido') || val <= 5;
      if (esMensual) {
        const ea = (Math.pow(1 + val / 100, 12) - 1) * 100;
        tasaInteresEa = Math.round(ea * 10) / 10;
      } else {
        tasaInteresEa = val;
      }
    }
  }

  // 4. Detección de Banco Colombiano
  let banco = 'Banco';
  if (lower.includes('davivienda')) {
    banco = 'Davivienda';
  } else if (lower.includes('bancolombia')) {
    banco = 'Bancolombia';
  } else if (/\bnu\b/i.test(lower) || /\bnubank\b/i.test(lower)) {
    banco = 'Nubank';
  } else if (lower.includes('falabella') || lower.includes('cmr')) {
    banco = 'Falabella';
  } else if (lower.includes('bogota') || lower.includes('bogotá')) {
    banco = 'Banco de Bogotá';
  } else if (lower.includes('bbva')) {
    banco = 'BBVA';
  } else if (lower.includes('scotiabank') || lower.includes('colpatria')) {
    banco = 'Scotiabank Colpatria';
  } else if (lower.includes('occidente')) {
    banco = 'Banco de Occidente';
  } else if (lower.includes('popular')) {
    banco = 'Banco Popular';
  } else if (lower.includes('itau') || lower.includes('itaú')) {
    banco = 'Itaú';
  } else if (lower.includes('av villas') || lower.includes('villas')) {
    banco = 'AV Villas';
  } else if (lower.includes('rappi') || lower.includes('rappicard')) {
    banco = 'RappiCard';
  } else if (lower.includes('lulo')) {
    banco = 'Lulo Bank';
  } else if (lower.includes('tuya') || lower.includes('exito') || lower.includes('éxito')) {
    banco = 'Tuya Éxito';
  }

  // 5. Detección de Franquicia / Categoría
  let franquicia: string | null = null;
  if (lower.includes('diner') || lower.includes('dinner')) {
    franquicia = 'Diners Club';
  } else if (lower.includes('visa')) {
    if (lower.includes('signature')) franquicia = 'Visa Signature';
    else if (lower.includes('infinite')) franquicia = 'Visa Infinite';
    else if (lower.includes('platinum')) franquicia = 'Visa Platinum';
    else if (lower.includes('gold')) franquicia = 'Visa Gold';
    else franquicia = 'Visa';
  } else if (lower.includes('mastercard') || lower.includes('master')) {
    if (lower.includes('black')) franquicia = 'Mastercard Black';
    else if (lower.includes('platinum')) franquicia = 'Mastercard Platinum';
    else if (lower.includes('gold')) franquicia = 'Mastercard Gold';
    else franquicia = 'Mastercard';
  } else if (lower.includes('amex') || lower.includes('american express')) {
    franquicia = 'American Express';
  }

  // 6. Ensamblaje del Nombre de la Tarjeta
  let nombre = 'Mi Tarjeta';
  if (franquicia && banco !== 'Banco') {
    nombre = `${franquicia} ${banco}`;
  } else if (franquicia) {
    nombre = franquicia;
  } else if (banco !== 'Banco') {
    nombre = banco;
  } else {
    // Intentar extraer el texto entre 'tarjeta' y 'cupo' / 'corte'
    const matchNombreLibre = /(?:tarjeta|tc)\s+(.+?)(?:\s+(?:cupo|corte|pago|$))/i.exec(lower);
    if (matchNombreLibre && matchNombreLibre[1]) {
      const limpio = matchNombreLibre[1].trim();
      if (limpio.length > 1) {
        nombre = limpio.charAt(0).toUpperCase() + limpio.slice(1);
      }
    }
  }

  return {
    nombre,
    banco,
    cupo,
    cupoDisponible,
    tasaInteresEa,
    diaCorte,
    diaPago,
  };
}

export interface DetallesCuentaExtraidos {
  readonly nombre: string;
  readonly tipo: TipoCuenta;
  readonly banco: string | null;
  readonly saldo: number | null;
}

/**
 * Extrae tipo de cuenta (débito, ahorros, billetera, efectivo), banco y saldo inicial.
 * Soporta modismos colombianos como "tengo 500 mil en nequi", "débito bancolombia", "efectivo", etc.
 */
export function extraerDetallesCuenta(texto: string): DetallesCuentaExtraidos {
  const lower = texto.toLowerCase().trim();

  // 1. Detección de Tipo
  let tipo: TipoCuenta = 'debito';
  let banco: string | null = null;
  let nombre = 'Mi Cuenta';

  if (lower.includes('efectivo') || lower.includes('plata en mano') || lower.includes('en físico') || lower.includes('en fisico')) {
    tipo = 'efectivo';
    nombre = 'Efectivo';
  } else if (lower.includes('nequi')) {
    tipo = 'billetera';
    nombre = 'Nequi';
    banco = 'Bancolombia';
  } else if (lower.includes('daviplata')) {
    tipo = 'billetera';
    nombre = 'Daviplata';
    banco = 'Davivienda';
  } else if (lower.includes('dale')) {
    tipo = 'billetera';
    nombre = 'Dale!';
    banco = 'Grupo Aval';
  } else if (lower.includes('movii')) {
    tipo = 'billetera';
    nombre = 'Movii';
  } else if (lower.includes('lulo')) {
    tipo = 'ahorros';
    nombre = 'Lulo Bank';
    banco = 'Lulo Bank';
  } else if (lower.includes('corriente')) {
    tipo = 'corriente';
  } else if (lower.includes('ahorro') || lower.includes('ahorros')) {
    tipo = 'ahorros';
  } else {
    tipo = 'debito';
  }

  // 2. Detección de Banco si no fue asignado aún
  if (!banco && tipo !== 'efectivo') {
    if (lower.includes('davivienda')) banco = 'Davivienda';
    else if (lower.includes('bancolombia')) banco = 'Bancolombia';
    else if (/\bnu\b/i.test(lower) || /\bnubank\b/i.test(lower)) banco = 'Nubank';
    else if (lower.includes('falabella')) banco = 'Falabella';
    else if (lower.includes('bogota') || lower.includes('bogotá')) banco = 'Banco de Bogotá';
    else if (lower.includes('bbva')) banco = 'BBVA';
    else if (lower.includes('scotiabank') || lower.includes('colpatria')) banco = 'Scotiabank Colpatria';
    else if (lower.includes('occidente')) banco = 'Banco de Occidente';
    else if (lower.includes('popular')) banco = 'Banco Popular';
    else if (lower.includes('itau') || lower.includes('itaú')) banco = 'Itaú';
    else if (lower.includes('av villas') || lower.includes('villas')) banco = 'AV Villas';
    else if (lower.includes('rappi')) banco = 'Rappi';
  }

  // 3. Ensamblaje del Nombre si no es billetera/efectivo
  if (tipo !== 'efectivo' && tipo !== 'billetera') {
    const prefijo = tipo === 'debito' ? 'Débito' : tipo === 'ahorros' ? 'Ahorros' : 'Corriente';
    if (banco) {
      nombre = `${prefijo} ${banco}`;
    } else {
      nombre = `${prefijo} Bancaria`;
    }
  }

  // 4. Saldo Inicial
  const saldo = extraerMontoColombiano(texto);

  return {
    nombre,
    tipo,
    banco,
    saldo,
  };
}

/**
 * Extrae concepto, saldo/monto, tasa de interés, cuotas y día de pago de deudas y créditos.
 * Ejemplo: "credito de vehiculo por 80.000.000 a una tasa de 11 EA a 46 meses, la fecha de pago oportuno son los 2"
 */
export function extraerDetallesObligacion(texto: string): ConfigObligacionExtraida {
  const lower = texto.toLowerCase();

  // 1. Día de pago oportuno
  let diaPago: number | null = null;
  const matchPago = /(?:fecha\s*(?:de)?\s*pago\s*(?:oportuno)?|pago\s*oportuno|pago|pagar|vence|vencimiento)\s*(?:los|el|del|día|dia|son\s*los)?\s*(\d{1,2})\b/i.exec(lower);
  if (matchPago && matchPago[1]) {
    const val = Number(matchPago[1]);
    if (val >= 1 && val <= 31) diaPago = val;
  }

  // 2. Plazo / Cuotas / Meses
  let cuotas: number | null = null;
  const matchCuotas = /(\d+)\s*(?:meses|mes|cuotas|cuota|plazos?)/i.exec(lower);
  if (matchCuotas && matchCuotas[1]) {
    cuotas = Number(matchCuotas[1]);
  }

  // 3. Tasa de interés (% EA o % MV)
  let tasaEa: number | null = null;
  let tasaMv: number | null = null;
  const matchTasa = /(?:tasa|inter[eé]s)\s*(?:del?|de)?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:%|\bpor\s*ciento)?\s*(ea|e\.a\.|efectivo\s*anual|mv|m\.v\.|mensual|mes\s*vencido)?/i.exec(lower);
  if (matchTasa && matchTasa[1]) {
    const val = Number(matchTasa[1].replace(',', '.'));
    const tipoTasa = matchTasa[2]?.toLowerCase() ?? '';
    const esMensual = tipoTasa.includes('mv') || tipoTasa.includes('mensual') || tipoTasa.includes('vencido');
    if (esMensual) {
      tasaMv = val;
      tasaEa = Math.round(((Math.pow(1 + val / 100, 12) - 1) * 100) * 10) / 10;
    } else {
      tasaEa = val;
      tasaMv = Math.round(((Math.pow(1 + val / 100, 1 / 12) - 1) * 100) * 100) / 100;
    }
  }

  // 4. Saldo / Monto total del crédito
  let saldo: number | null = null;
  const matchSaldo = /(?:por|de|monto\s*(?:de)?|valor\s*(?:de)?|saldo\s*(?:de)?|capital\s*(?:de)?|prestamo\s*(?:de)?|préstamo\s*(?:de)?)\s*([$0-9.,'’\s]+?(?:millones?|millón|millon|mill\b|mil|m|k)?)(?:\s+(?:a\s+una\s+tasa|a\s+tasa|tasa|a\s+\d+\s+meses|a\s+\d+\s+cuotas|cuota|con|pago|fecha|$))/i.exec(lower);
  if (matchSaldo && matchSaldo[1]) {
    saldo = extraerMontoColombiano(matchSaldo[1]);
  }
  if (!saldo) {
    const montoGeneral = extraerMontoColombiano(lower);
    if (montoGeneral && montoGeneral > 100 && montoGeneral !== diaPago && montoGeneral !== cuotas) {
      saldo = montoGeneral;
    }
  }

  // 5. Cuota mensual explícita (si la menciona)
  let cuota: number | null = null;
  const matchCuota = /(?:cuota\s*(?:mensual)?)\s*(?:es|de)?\s*([$0-9.,'’]+(?:\s*(?:millones?|millón|millon|mill\b|mil|m|k))?)/i.exec(lower);
  if (matchCuota && matchCuota[1]) {
    cuota = extraerMontoColombiano(matchCuota[1]);
  }

  // 6. Entidad / Banco
  let entidad: string | null = null;
  if (lower.includes('sufi')) entidad = 'Sufi (Bancolombia)';
  else if (lower.includes('bancolombia')) entidad = 'Bancolombia';
  else if (lower.includes('davivienda')) entidad = 'Davivienda';
  else if (lower.includes('bogota') || lower.includes('bogotá')) entidad = 'Banco de Bogotá';
  else if (lower.includes('bbva')) entidad = 'BBVA';
  else if (lower.includes('occidente')) entidad = 'Banco de Occidente';
  else if (lower.includes('popular')) entidad = 'Banco Popular';
  else if (lower.includes('av villas') || lower.includes('villas')) entidad = 'AV Villas';
  else if (lower.includes('itau') || lower.includes('itaú')) entidad = 'Itaú';
  else if (lower.includes('falabella')) entidad = 'Banco Falabella';
  else if (lower.includes('fna') || lower.includes('fondo nacional del ahorro')) entidad = 'FNA';

  // 7. Nombre / Concepto
  let nombre = 'Crédito';
  if (lower.includes('vehiculo') || lower.includes('vehículo') || lower.includes('carro') || lower.includes('auto') || lower.includes('moto')) {
    nombre = entidad ? `Crédito Vehículo ${entidad}` : 'Crédito de Vehículo';
  } else if (lower.includes('hipotec') || lower.includes('vivienda') || lower.includes('casa') || lower.includes('apto') || lower.includes('apartamento')) {
    nombre = entidad ? `Crédito Hipotecario ${entidad}` : 'Crédito Hipotecario';
  } else if (lower.includes('libranza')) {
    nombre = entidad ? `Crédito Libranza ${entidad}` : 'Crédito de Libranza';
  } else if (lower.includes('libre inversion') || lower.includes('libre inversión') || lower.includes('consumo')) {
    nombre = entidad ? `Libre Inversión ${entidad}` : 'Crédito de Libre Inversión';
  } else if (lower.includes('estudio') || lower.includes('educativo') || lower.includes('icetex')) {
    nombre = 'Crédito Educativo';
  } else if (lower.includes('prestamo personal') || lower.includes('préstamo personal') || lower.includes('familiar') || lower.includes('amigo')) {
    nombre = 'Préstamo Personal';
  } else if (entidad) {
    nombre = `Crédito ${entidad}`;
  }

  return {
    nombre,
    tipo: 'deuda',
    entidad,
    saldo,
    tasaEa,
    tasaMv,
    cuota,
    diaPago,
    cuotasRestantes: cuotas,
    cuotasTotales: cuotas,
  };
}
