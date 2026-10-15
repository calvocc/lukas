/**
 * ========================================================
 * Definiciones de Tipos de Dominio para Lukas Bot (v1)
 * Regla de Oro: CERO ANY (Strict TypeScript)
 * ========================================================
 */

export type EstadoUsuario = 'registrando' | 'activo' | 'bloqueado' | 'eliminado';
export type TonoVoz = 'neutro' | 'casual' | 'entusiasta' | 'formal';
export type TipoTransaccion = 'gasto' | 'ingreso';
export type MedioPago = 'tarjeta' | 'debito' | 'efectivo' | 'transferencia';
export type Confianza = 'alta' | 'baja';
export type TipoExoneracion = 'ninguna' | 'compras' | 'monto' | 'siempre_exenta';
export type TipoObligacion = 'deuda' | 'fijo';
export type PeriodoConsulta = 'hoy' | 'semana' | 'mes' | 'mes_pasado';
export type TipoConsulta =
  | 'mejor_tarjeta'
  | 'tarjetas'
  | 'saldo'
  | 'total_periodo'
  | 'total_categoria'
  | 'balance'
  | 'resumen'
  | 'ciclo_tarjeta'
  | 'proximos_pagos'
  | 'deudas';

export type IntencionMensaje =
  | 'registro'
  | 'consulta'
  | 'correccion'
  | 'eliminacion'
  | 'pago_tarjeta'
  | 'pago_obligacion'
  | 'config_tarjeta'
  | 'config_obligacion'
  | 'config_presupuesto'
  | 'ayuda'
  | 'no_entendido';

// Entidades del Dominio

export interface Usuario {
  readonly id: string;
  readonly numeroWhatsapp: string;
  readonly nombre: string | null;
  readonly estado: EstadoUsuario;
  readonly aceptoDatosEn: Date | null;
  readonly zonaHoraria: string;
  readonly horaRecordatorios: string; // formato "HH:mm"
  readonly medioPagoDefault: MedioPago;
  readonly tonoPreferido: TonoVoz;
  readonly plan: string;
  readonly limiteGastoMensual: number | null;
  readonly ultimaTransaccionId: string | null;
  readonly creadoEn: Date;
}

export interface Tarjeta {
  readonly id: string;
  readonly usuarioId: string;
  readonly nombre: string;
  readonly banco: string;
  readonly diaCorte: number;
  readonly diaPago: number;
  readonly cupo: number | null;
  readonly cupoDisponible: number | null;
  readonly limiteCiclo: number | null;
  readonly cobraInteresUnaCuota: boolean;
  readonly aceptaCompras: boolean;
  readonly esDefault: boolean;
  readonly tieneCuotaManejo: boolean;
  readonly valorCuotaManejo: number;
  readonly tipoExoneracion: TipoExoneracion;
  readonly metaExoneracion: number;
  readonly activa: boolean;
  readonly creadoEn: Date;
}

export interface Categoria {
  readonly id: string;
  readonly nombre: string;
}

export interface Transaccion {
  readonly id: string;
  readonly usuarioId: string;
  readonly tipo: TipoTransaccion;
  readonly monto: number;
  readonly categoriaId: string;
  readonly categoriaConfianza: Confianza | null;
  readonly descripcion: string | null;
  readonly medioPago: MedioPago;
  readonly tarjetaId: string | null;
  readonly cuotas: number;
  readonly cuotasOriginales: number;
  readonly pendienteRediferir: boolean;
  readonly fecha: string; // formato YYYY-MM-DD
  readonly creadoEn: Date;
}

export interface Obligacion {
  readonly id: string;
  readonly usuarioId: string;
  readonly nombre: string;
  readonly tipo: TipoObligacion;
  readonly saldo: number | null;
  readonly tasaMv: number | null;
  readonly cuota: number;
  readonly diaPago: number;
  readonly cuotasRestantes: number | null;
  readonly activa: boolean;
  readonly creadoEn: Date;
}

export interface PagoTarjeta {
  readonly id: string;
  readonly usuarioId: string;
  readonly tarjetaId: string;
  readonly cicloInicio: string;
  readonly cicloFin: string;
  readonly fechaLimite: string;
  readonly totalCiclo: number;
  readonly pagado: boolean;
  readonly pagadoEn: Date | null;
  readonly creadoEn: Date;
}

// Contrato del Intérprete IA (Parser)

export interface TransaccionExtraida {
  readonly monto: number | null;
  readonly montoConfianza: Confianza;
  readonly categoria: string | null;
  readonly categoriaConfianza: Confianza;
  readonly descripcion: string | null;
  readonly tipo: TipoTransaccion;
  readonly medioPago: MedioPago | null;
  readonly tarjeta: string | null;
  readonly cuotas: number;
}

export interface ConsultaExtraida {
  readonly tipoConsulta: TipoConsulta;
  readonly periodo: PeriodoConsulta;
  readonly categoriaConsulta: string | null;
  readonly tarjeta: string | null;
  readonly montoSimulado: number | null;
}

export interface ConfigTarjetaExtraida {
  readonly nombre: string | null;
  readonly banco: string | null;
  readonly cupo: number | null;
  readonly diaCorte: number | null;
  readonly diaPago: number | null;
}

export interface ParserResult {
  readonly intencion: IntencionMensaje;
  readonly tonoDetectado: TonoVoz;
  readonly transacciones?: readonly TransaccionExtraida[];
  readonly consulta?: ConsultaExtraida;
  readonly pagoTarjeta?: {
    readonly tarjeta: string;
  };
  readonly pagoObligacion?: {
    readonly obligacion: string;
  };
  readonly configPresupuesto?: {
    readonly limiteGastoMensual: number;
  };
  readonly configTarjeta?: ConfigTarjetaExtraida;
  readonly correccionCuotas?: {
    readonly tarjeta?: string;
    readonly nuevasCuotas: number;
  };
  readonly rawJson?: unknown;
}

// Cálculo de Ciclos Financieros
export interface InfoCicloCalculado {
  readonly fechaCorteCiclo: Date;
  readonly fechaPagoCiclo: Date;
  readonly diasHastaPago: number;
  readonly esVentanaOptima: boolean; // Si compra post-corte (45-55 días de gracia)
  readonly diasDesdeCorte: number;
}

export interface RecomendacionTarjeta {
  readonly tarjeta: Tarjeta;
  readonly diasHastaPago: number;
  readonly fechaPago: Date;
  readonly fechaCorte: Date;
  readonly cupoDisponibleDespues: number;
  readonly cumpleMonto: boolean;
  readonly requiereAtencionCuotaManejo: boolean;
  readonly mensajeEstrategico: string;
}
