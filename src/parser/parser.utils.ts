/**
 * ========================================================
 * Utilidades para Extracción de Datos en Español Colombiano
 * Soporta modismos, formatos monetarios ($14.000.000, 14m, etc.)
 * y entidades financieras colombianas.
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

export interface DetallesTarjetaExtraidos {
  readonly nombre: string;
  readonly banco: string;
  readonly cupo: number | null;
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

  // 3. Cupo
  let cupo: number | null = null;
  const matchCupoFragmento = /cupo\s*(?:de)?\s*([$0-9.,'’\s]+?(?:millones?|millón|millon|mill\b|mil|m|k)?)(?:\s+(?:corte|pago|con|y|$))/i.exec(lower);
  if (matchCupoFragmento && matchCupoFragmento[1]) {
    cupo = extraerMontoColombiano(matchCupoFragmento[1]);
  }

  // Si no se extrajo directamente después de "cupo", buscar el monto más significativo
  if (!cupo) {
    const montoGeneral = extraerMontoColombiano(lower);
    if (montoGeneral && montoGeneral !== diaCorte && montoGeneral !== diaPago) {
      cupo = montoGeneral;
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
    diaCorte,
    diaPago,
  };
}
