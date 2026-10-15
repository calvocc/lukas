-- ========================================================
-- Esquema de Base de Datos para Lukas: Asistente de Finanzas
-- PostgreSQL 16
-- ========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_whatsapp TEXT UNIQUE NOT NULL,
  nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'registrando'
    CHECK (estado IN ('registrando', 'activo', 'bloqueado', 'eliminado')),
  acepto_datos_en TIMESTAMPTZ,
  zona_horaria TEXT NOT NULL DEFAULT 'America/Bogota',
  hora_recordatorios TIME NOT NULL DEFAULT '08:00',
  medio_pago_default TEXT NOT NULL DEFAULT 'tarjeta',
  tono_preferido TEXT NOT NULL DEFAULT 'neutro',
  plan TEXT NOT NULL DEFAULT 'gratis',
  limite_gasto_mensual NUMERIC DEFAULT NULL,
  ultima_transaccion_id UUID,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Categorías Globales
CREATE TABLE IF NOT EXISTS categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT UNIQUE NOT NULL
);

INSERT INTO categorias (nombre) VALUES
  ('Comida'),
  ('Transporte'),
  ('Arriendo'),
  ('Servicios'),
  ('Entretenimiento'),
  ('Salud'),
  ('Otros')
ON CONFLICT (nombre) DO NOTHING;

-- 3. Tarjetas de Crédito
CREATE TABLE IF NOT EXISTS tarjetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  banco TEXT NOT NULL,
  dia_corte INT NOT NULL CHECK (dia_corte BETWEEN 1 AND 31),
  dia_pago INT NOT NULL CHECK (dia_pago BETWEEN 1 AND 31),
  cupo NUMERIC,
  cupo_disponible NUMERIC,
  limite_ciclo NUMERIC,
  cobra_interes_una_cuota BOOLEAN NOT NULL DEFAULT FALSE,
  acepta_compras BOOLEAN NOT NULL DEFAULT TRUE,
  es_default BOOLEAN NOT NULL DEFAULT FALSE,
  tiene_cuota_manejo BOOLEAN NOT NULL DEFAULT FALSE,
  valor_cuota_manejo NUMERIC DEFAULT 0,
  tipo_exoneracion TEXT NOT NULL DEFAULT 'ninguna'
    CHECK (tipo_exoneracion IN ('ninguna', 'compras', 'monto', 'siempre_exenta')),
  meta_exoneracion NUMERIC DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, nombre)
);

-- 4. Transacciones (Gastos e Ingresos)
CREATE TABLE IF NOT EXISTS transacciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('gasto', 'ingreso')),
  monto NUMERIC NOT NULL CHECK (monto > 0),
  categoria_id UUID NOT NULL REFERENCES categorias(id),
  categoria_confianza TEXT CHECK (categoria_confianza IN ('alta', 'baja')),
  descripcion TEXT,
  medio_pago TEXT NOT NULL DEFAULT 'tarjeta'
    CHECK (medio_pago IN ('tarjeta', 'debito', 'efectivo', 'transferencia')),
  tarjeta_id UUID REFERENCES tarjetas(id) ON DELETE SET NULL,
  cuotas INT NOT NULL DEFAULT 1 CHECK (cuotas >= 1),
  cuotas_originales INT DEFAULT 1,
  pendiente_rediferir BOOLEAN NOT NULL DEFAULT FALSE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Llave foránea de última transacción en usuarios
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ultima_transaccion'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT fk_ultima_transaccion
      FOREIGN KEY (ultima_transaccion_id) REFERENCES transacciones(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Pagos de Tarjeta (Ciclos cerrados y pagados)
CREATE TABLE IF NOT EXISTS pagos_tarjeta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tarjeta_id UUID NOT NULL REFERENCES tarjetas(id) ON DELETE CASCADE,
  ciclo_inicio DATE NOT NULL,
  ciclo_fin DATE NOT NULL,
  fecha_limite DATE NOT NULL,
  total_ciclo NUMERIC NOT NULL,
  pagado BOOLEAN NOT NULL DEFAULT FALSE,
  pagado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Obligaciones (Deudas y Pagos Fijos)
CREATE TABLE IF NOT EXISTS obligaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('deuda', 'fijo')),
  saldo NUMERIC,
  tasa_mv NUMERIC,
  cuota NUMERIC NOT NULL,
  dia_pago INT NOT NULL CHECK (dia_pago BETWEEN 1 AND 31),
  cuotas_restantes INT,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Pagos de Obligación
CREATE TABLE IF NOT EXISTS pagos_obligacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  obligacion_id UUID NOT NULL REFERENCES obligaciones(id) ON DELETE CASCADE,
  periodo DATE NOT NULL,
  valor NUMERIC NOT NULL,
  pagado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (obligacion_id, periodo)
);

-- 8. Tags y Transacción Tags
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  UNIQUE (usuario_id, nombre)
);

CREATE TABLE IF NOT EXISTS transaccion_tags (
  transaccion_id UUID REFERENCES transacciones(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaccion_id, tag_id)
);

-- 9. Plantillas de Respuestas
CREATE TABLE IF NOT EXISTS plantillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intencion TEXT NOT NULL,
  tono TEXT NOT NULL DEFAULT 'neutro',
  texto TEXT NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE
);

-- 10. Log de Mensajes
CREATE TABLE IF NOT EXISTS mensajes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  mensaje_raw TEXT NOT NULL,
  respuesta_ia JSONB,
  modelo_ia TEXT,
  intencion TEXT,
  tono_detectado TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_fecha ON transacciones (usuario_id, fecha);
CREATE INDEX IF NOT EXISTS idx_transacciones_tarjeta_fecha ON transacciones (tarjeta_id, fecha);
CREATE INDEX IF NOT EXISTS idx_obligaciones_usuario ON obligaciones (usuario_id, dia_pago);
CREATE INDEX IF NOT EXISTS idx_usuarios_numero ON usuarios (numero_whatsapp);
