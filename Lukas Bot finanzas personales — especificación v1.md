# Lukas: asistente de finanzas por WhatsApp — especificación v1

Oct 15, 2026 · @Jhonathan

Lukas es un asistente de finanzas personales por WhatsApp para Colombia: registra gastos e ingresos escritos en lenguaje natural, organiza tarjetas y deudas, y avisa antes de cada pago. Su función estrella es El Método Lukas, que guía al usuario para usar su tarjeta de crédito sin pagar intereses. Es multiusuario desde el día 1: cualquier persona se registra con su número de WhatsApp.

## Qué hace Lukas

El usuario conversa con Lukas por WhatsApp en español colombiano, sin comandos ni app. Cada función tiene un nombre visible que aparece en la ayuda ("qué puedes hacer") y en los mensajes.

| Nombre visible | Qué hace | Ejemplo |
| --- | --- | --- |
| **Bienvenido a Lukas** | Registro con el número de WhatsApp, aceptación de la política de datos y configuración inicial | Un número nuevo escribe "hola" |
| **Lukas anota** | Registra gastos e ingresos, con categoría, medio de pago y cuotas; corrige o borra el último | "85000 mercado gold" · "me pagaron 9500000" · "borra el último" |
| **El Método Lukas** | Guía el uso de la tarjeta a 1 cuota: límite por ciclo, alertas y pago del total | "cuánto llevo en la gold" |
| **Lukas lleva tus cuentas** | Deudas y pagos fijos con su cuota y fecha | "cuánto debo en total" · "pagué el kona" |
| **Lukas te avisa** | Recordatorios de cortes, pagos y cuotas, y alertas al registrar | "Faltan 3 días para pagar la Gold: $2.650.000" |
| **Lukas te muestra** | Totales por período y categoría, balance y gráfica de barras | "cómo voy este mes" · "cuánto en transporte esta semana" |
| **Lukas habla** | La forma de hablar de Lukas: respuestas claras y cercanas, valores en formato `$39.000` | Todas las respuestas |

**Fuera de esta versión:** variantes de tono, presupuestos por categoría, planes y cobro, lectura automática de extractos y dashboard web.

## El Método Lukas

> **El Método Lukas** — *Hackea tu tarjeta: úsala como un préstamo gratis de hasta 45 días, sin pagar un peso de intereses.*
>
> Aplica si pagas el total de tu tarjeta a tiempo y tu tarjeta no cobra intereses a 1 cuota.

La idea: todo lo que el usuario compra con tarjeta va a 1 cuota, gasta solo lo que podrá pagar completo en el siguiente extracto, y paga el total antes de la fecha límite. Así el banco financia un mes de gastos sin intereses, mes tras mes. Lukas hace cumplir el método con estas reglas:

1. **Toda compra con tarjeta es a 1 cuota por defecto.** Si el mensaje dice más cuotas, Lukas registra, avisa que genera intereses y pide confirmar.
2. **Límite por ciclo de corte**, definido por el usuario: lo que cabe en su ingreso del mes siguiente junto con sus gastos fijos. Alerta al 80% y al 100%.
3. **Se paga el total, nunca el mínimo.** Recordatorios y consultas siempre muestran el total del ciclo.
4. **Tarjetas solo de deuda.** Una tarjeta marcada como "no acepta compras" (una con saldo rediferido que se está pagando, por ejemplo) genera una alerta si llega una compra con ella.
5. **Avances e impuestos no van a tarjeta.** Si el mensaje los menciona con una tarjeta, Lukas avisa que generan intereses desde el primer día.
6. **Tarjetas que cobran intereses a 1 cuota.** Al registrar una tarjeta, Lukas pregunta si cobra intereses a 1 cuota; si es así, avisa que el método no aplica con ella.
7. **Mejor día para comprar.** El día después del corte, Lukas avisa que empieza un ciclo nuevo: lo que se compre ese día se paga en unos 45 días.

## Arquitectura

Un backend NestJS organizado en nueve módulos, con dos piezas intercambiables desde la configuración: el canal de WhatsApp (Baileys hoy, API oficial después) y el proveedor de IA (GPT-4o mini hoy, el que convenga después).

&#91;embedded content: arquitectura de Lukas · 9 módulos\]

Un mensaje entra por Puente, Cuenta identifica al usuario, el Intérprete lo vuelve JSON y un módulo de negocio lo procesa; Voz arma la respuesta. Alertas usa el mismo camino de salida para los recordatorios.

| Componente | Tecnología | Nota |
| --- | --- | --- |
| Backend | NestJS (TypeScript) | Un módulo por responsabilidad |
| Canal WhatsApp | Baileys, detrás de la interfaz `CanalMensajeria` | Número dedicado; migrable a la API oficial cambiando el adaptador |
| IA del Intérprete | OpenAI GPT-4o mini, detrás de la interfaz `ProveedorIA` | Modelo y proveedor configurables desde `.env`; salida con esquema JSON estricto |
| Base de datos | Supabase (Postgres) | Multiusuario con `usuario_id`; guarda también la sesión del canal |
| Gráficas | chartjs-node-canvas | Imagen de barras enviada por el canal |
| Tareas programadas | @nestjs/schedule | Cron cada 15 minutos para recordatorios |
| Hosting | VPS con Dokploy o Railway | Siempre encendido, con volumen persistente |

**Variables de entorno**

```
# Canal
CANAL_PROVEEDOR=baileys          # baileys | cloud_api
REGISTRO_MODO=abierto            # abierto | invitacion | cerrado
ADMIN_EMAIL=                     # avisos si el canal se desconecta

# IA del Intérprete
IA_PROVEEDOR=openai              # openai | anthropic | ...
IA_MODELO=gpt-4o-mini            # se cambia sin tocar código
OPENAI_API_KEY=

# Base de datos
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# API oficial (cuando CANAL_PROVEEDOR=cloud_api)
WHATSAPP_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

Cambiar `IA_MODELO` a un modelo más económico o `IA_PROVEEDOR` a otro proveedor solo requiere reiniciar el servicio. Antes de cambiarlo en producción, se corre el set de pruebas del Intérprete (mensajes de ejemplo con su JSON esperado) para confirmar que el modelo nuevo extrae igual de bien.

## Módulos

Nueve módulos, cada uno con un nombre de desarrollo y, si el usuario lo ve, un nombre visible.

| Módulo | NestJS | Nombre visible | Depende de |
| --- | --- | --- | --- |
| Puente | `CanalModule` | — | — |
| Cuenta | `UsuariosModule` | Bienvenido a Lukas | Puente |
| Intérprete | `ParserModule` | — | — |
| Voz | `RespuestasModule` | Lukas habla | — |
| Libro | `MovimientosModule` | Lukas anota | Cuenta, Intérprete, Voz |
| Tarjetas | `TarjetasModule` | El Método Lukas | Libro |
| Compromisos | `ObligacionesModule` | Lukas lleva tus cuentas | Cuenta |
| Alertas | `AlertasModule` | Lukas te avisa | Tarjetas, Compromisos |
| Reportes | `ReportesModule` | Lukas te muestra | Libro |

**Puente.** Recibe y envía texto e imágenes por WhatsApp a través de `CanalMensajeria` (`enviarTexto`, `enviarImagen`, `onMensaje`). Hoy usa `BaileysAdapter`; mañana `CloudApiAdapter`, elegido con `CANAL_PROVEEDOR`. Maneja reconexión, sesión persistente y límite de mensajes por minuto.

**Cuenta.** Identifica a cada usuario por su número. Un número nuevo pasa por el registro: saludo, explicación de Lukas, aceptación de la política de tratamiento de datos (Ley 1581 de 2012) y nombre; sin aceptación no se guarda ningún dato financiero. `REGISTRO_MODO` permite abrir, limitar a invitados o cerrar el registro sin cambiar código. Guarda la configuración del usuario: zona horaria, hora de recordatorios, medio de pago por defecto. Incluye el comando para borrar la cuenta con todos sus datos.

**Intérprete.** Convierte cada mensaje en JSON estructurado a través de `ProveedorIA`, con el modelo de `IA_MODELO`. Nunca redacta respuestas ni hace cálculos. El backend valida el JSON contra el esquema antes de usarlo.

**Voz.** Arma cada respuesta desde plantillas por intención, con variantes al azar sin repetir la última usada por usuario y valores en formato `$39.000`. Guarda el tono detectado del usuario para crear variantes de tono más adelante.

**Libro.** Registra gastos e ingresos, incluidas varias transacciones por mensaje. Reglas de confianza: sin monto no se guarda y se pregunta; monto ambiguo se confirma; categoría dudosa se guarda con la mejor opción y se avisa. Categorías fijas: Comida, Transporte, Arriendo, Servicios, Entretenimiento, Salud, Otros, más tags libres por usuario. Si el mensaje no dice medio de pago, usa el del usuario por defecto. Corrige o borra la última transacción.

**Tarjetas.** Tarjetas del usuario con día de corte, día de pago, cupo, límite por ciclo y si aceptan compras. Calcula el ciclo de cada compra, el total por pagar y el disponible del límite. Aplica las reglas de El Método Lukas y registra los pagos ("ya pagué la gold").

**Compromisos.** Deudas (saldo, tasa, cuota, cuotas restantes) y pagos fijos (arriendo, administración, servicios) con su día de pago. Registra cada pago y descuenta cuotas.

**Alertas.** Cron que envía recordatorios a la hora de cada usuario, y alertas inmediatas al registrar. Detalle en *Lukas te avisa*.

**Reportes.** Totales por período (hoy, semana, mes, mes pasado) y por categoría, balance de ingresos contra gastos, deudas pendientes y gráfica de barras por categoría.

## Modelo de datos

Todas las tablas de datos llevan `usuario_id`; solo `categorias` es un catálogo global. Cada transacción guarda su medio de pago y, si fue con tarjeta, la tarjeta y las cuotas.

```sql
create extension if not exists "pgcrypto";

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  numero_whatsapp text unique not null,
  nombre text,
  estado text not null default 'registrando'
    check (estado in ('registrando', 'activo', 'bloqueado', 'eliminado')),
  acepto_datos_en timestamptz,
  zona_horaria text not null default 'America/Bogota',
  hora_recordatorios time not null default '08:00',
  medio_pago_default text not null default 'tarjeta',
  tono_preferido text not null default 'neutro',
  plan text not null default 'gratis',
  ultima_transaccion_id uuid,
  creado_en timestamptz not null default now()
);

create table categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null
);

insert into categorias (nombre) values
  ('Comida'), ('Transporte'), ('Arriendo'), ('Servicios'),
  ('Entretenimiento'), ('Salud'), ('Otros');

create table tarjetas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  nombre text not null,
  banco text not null,
  dia_corte int not null check (dia_corte between 1 and 31),
  dia_pago int not null check (dia_pago between 1 and 31),
  cupo numeric,
  limite_ciclo numeric,
  cobra_interes_una_cuota boolean not null default false,
  acepta_compras boolean not null default true,
  es_default boolean not null default false,
  activa boolean not null default true,
  unique (usuario_id, nombre)
);

create table transacciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tipo text not null check (tipo in ('gasto', 'ingreso')),
  monto numeric not null check (monto > 0),
  categoria_id uuid not null references categorias(id),
  categoria_confianza text check (categoria_confianza in ('alta', 'baja')),
  descripcion text,
  medio_pago text not null default 'tarjeta'
    check (medio_pago in ('tarjeta', 'debito', 'efectivo', 'transferencia')),
  tarjeta_id uuid references tarjetas(id),
  cuotas int not null default 1 check (cuotas >= 1),
  fecha date not null default current_date,
  creado_en timestamptz not null default now()
);

alter table usuarios
  add constraint fk_ultima_transaccion
  foreign key (ultima_transaccion_id) references transacciones(id) on delete set null;

create table pagos_tarjeta (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tarjeta_id uuid not null references tarjetas(id) on delete cascade,
  ciclo_inicio date not null,
  ciclo_fin date not null,
  fecha_limite date not null,
  total_ciclo numeric not null,
  pagado boolean not null default false,
  pagado_en timestamptz
);

create table obligaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('deuda', 'fijo')),
  saldo numeric,
  tasa_mv numeric,
  cuota numeric not null,
  dia_pago int not null check (dia_pago between 1 and 31),
  cuotas_restantes int,
  activa boolean not null default true
);

create table pagos_obligacion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  obligacion_id uuid not null references obligaciones(id) on delete cascade,
  periodo date not null,                -- mes al que corresponde la cuota
  valor numeric not null,
  pagado_en timestamptz not null default now(),
  unique (obligacion_id, periodo)
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  nombre text not null,
  unique (usuario_id, nombre)
);

create table transaccion_tags (
  transaccion_id uuid references transacciones(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (transaccion_id, tag_id)
);

create table plantillas (
  id uuid primary key default gen_random_uuid(),
  intencion text not null,
  tono text not null default 'neutro',
  texto text not null,
  activa boolean not null default true
);

create table mensajes_log (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id) on delete cascade,
  mensaje_raw text not null,
  respuesta_ia jsonb,
  modelo_ia text,                       -- qué modelo interpretó el mensaje
  intencion text,
  tono_detectado text,
  creado_en timestamptz not null default now()
);

create index idx_transacciones_usuario_fecha on transacciones (usuario_id, fecha);
create index idx_transacciones_tarjeta_fecha on transacciones (tarjeta_id, fecha);
create index idx_obligaciones_usuario on obligaciones (usuario_id, dia_pago);
```

El ciclo de un gasto con tarjeta se calcula con su `fecha` y el `dia_corte` de la tarjeta; si el día no existe en el mes (31 en noviembre), se usa el último día. Corrección y eliminación operan sobre `usuarios.ultima_transaccion_id`. `mensajes_log.modelo_ia` permite comparar la calidad al cambiar de modelo. RLS queda desactivado mientras el único cliente de la base sea el backend con la service role key; se activa cuando exista un dashboard web.

## Intérprete: contrato JSON

El Intérprete recibe el mensaje y devuelve solo JSON validado contra un esquema estricto; nunca texto para el usuario. Este contrato es el mismo sin importar el modelo configurado.

**Contexto que se envía con cada mensaje:** fecha actual en la zona del usuario, sus tarjetas activas (nombre y alias), sus obligaciones activas y su última transacción.

**Intenciones**

| Intención | Cuándo | Campos clave |
| --- | --- | --- |
| `registro` | Gasto o ingreso | `transacciones[]` |
| `consulta` | Preguntas | `tipo_consulta`, `periodo`, `categoria_consulta`, `tarjeta` |
| `correccion` | Corregir la última transacción | `campo_corregido`, `valor_nuevo` |
| `eliminacion` | Borrar la última transacción | — |
| `pago_tarjeta` | "ya pagué la gold" | `tarjeta` |
| `pago_obligacion` | "pagué la cuota del kona" | `obligacion` |
| `config_tarjeta` | Crear o cambiar una tarjeta | `nombre`, `banco`, `dia_corte`, `dia_pago`, `limite_ciclo` |
| `config_obligacion` | Crear o cambiar una deuda o pago fijo | `nombre`, `tipo`, `cuota`, `dia_pago`, `saldo` |
| `ayuda` | "qué puedes hacer" | — |
| `no_entendido` | Todo lo demás | — |

**Campos de cada transacción:** `monto` (o `null` si no hay número), `monto_confianza` (`alta`/`baja`), `categoria` (siempre una del catálogo), `categoria_confianza`, `descripcion`, `tipo` (`gasto`/`ingreso`), `medio_pago` (`tarjeta`, `debito`, `efectivo`, `transferencia` o `null`), `tarjeta` (nombre o `null`) y `cuotas` (1 si no se dice).

**Tipos de consulta:** `total_periodo`, `total_categoria`, `balance`, `resumen`, `ciclo_tarjeta`, `proximos_pagos`, `deudas`. Periodos: `hoy`, `semana`, `mes`, `mes_pasado` (por defecto `mes`).

Todas las respuestas incluyen `tono_detectado` (`neutro`, `casual`, `entusiasta`, `formal`).

**Ejemplo:** "85000 mercado gold y 39000 almuerzo en efectivo"

```json
{
  "intencion": "registro",
  "tono_detectado": "neutro",
  "transacciones": [
    {"monto": 85000, "monto_confianza": "alta", "categoria": "Comida",
     "categoria_confianza": "alta", "descripcion": "mercado", "tipo": "gasto",
     "medio_pago": "tarjeta", "tarjeta": "gold", "cuotas": 1},
    {"monto": 39000, "monto_confianza": "alta", "categoria": "Comida",
     "categoria_confianza": "alta", "descripcion": "almuerzo", "tipo": "gasto",
     "medio_pago": "efectivo", "tarjeta": null, "cuotas": 1}
  ]
}
```

**Set de pruebas:** un archivo con unos 50 mensajes reales y su JSON esperado. Se corre en cada cambio de prompt o de modelo; un modelo nuevo entra a producción solo si iguala la precisión del actual.

## Lukas te avisa: recordatorios y alertas

Los recordatorios salen de un cron cada 15 minutos que toma a los usuarios activos cuya hora de recordatorios ya llegó en su zona horaria; los envíos se espacian unos segundos entre usuarios. Las alertas salen en el momento de registrar.

| Tipo | Disparador | Mensaje de ejemplo |
| --- | --- | --- |
| Recordatorio | El día después del corte | "🔔 Lukas te avisa: cortó la Gold. Pagas $2.650.000 antes del 27 de oct. Paga el TOTAL, no el mínimo." |
| Recordatorio | 3 días antes de la fecha límite | "🔔 Faltan 3 días para pagar la Gold: $2.650.000." |
| Recordatorio | El día de pago, si no está pagada | "🔔 Hoy vence la Gold: $2.650.000. Responde 'ya pagué la gold' cuando lo hagas." |
| Recordatorio | 2 días antes de una deuda o pago fijo | "🔔 El 2 de nov pagas el Kona: $2.363.043." |
| Recordatorio | El día después del corte | "Empieza un ciclo nuevo en la Gold: lo que compres hoy lo pagas en unos 45 días." |
| Alerta | Gasto en el ciclo llega al 80% del límite | "Llevas $2.180.000 de $2.700.000 en la Gold (81%)." |
| Alerta | Gasto supera el límite | "Te pasaste del límite del ciclo por $120.000." |
| Alerta | Compra con más de 1 cuota | "Ojo: a 6 cuotas genera intereses. ¿La dejo así o la pasas a 1 cuota?" |
| Alerta | Compra con tarjeta que no acepta compras | "La Diners está en modo solo deuda. ¿Seguro que fue con ella?" |
| Alerta | Avance o impuesto con tarjeta | "Los avances generan intereses desde el primer día, aunque sean a 1 cuota." |
| Operación | El canal se desconecta | Correo a `ADMIN_EMAIL`, porque WhatsApp no está disponible |

Un recordatorio de pago deja de enviarse cuando el usuario lo marca como pagado.

## Seguridad, datos personales y operación

Lukas guarda finanzas de terceros: el aislamiento entre usuarios y la protección de datos no son opcionales. Con Baileys, además, el riesgo operativo principal es que bloqueen el número y todos los usuarios queden sin servicio.

- **Aislamiento:** toda consulta y escritura filtra por `usuario_id`, tomado del número que escribe, nunca del texto. Pruebas automáticas verifican que un usuario no ve datos de otro.
- **Protección de datos (Ley 1581 de 2012):** aceptación explícita de la política antes de guardar datos financieros, registro de la fecha de aceptación y comando para borrar la cuenta con todos sus datos.
- **Control de acceso:** solo usuarios `activo` usan Lukas; `bloqueado` y `eliminado` se ignoran. `REGISTRO_MODO` permite cerrar el registro de inmediato.
- **Número dedicado** para Lukas, nunca uno personal.
- **Sesión del canal** en la base de datos o en un volumen persistente, fuera del repositorio.
- **Reconexión automática** ante cierre de conexión; si la sesión se cierra, correo a `ADMIN_EMAIL` para volver a vincular.
- **Límite de mensajes** por usuario por minuto y envíos espaciados, para reducir el riesgo de bloqueo con Baileys.
- **Secretos** (`OPENAI_API_KEY`, credenciales de Supabase) en variables de entorno, nunca en logs.
- **`mensajes_log`** contiene finanzas de los usuarios: no se expone fuera del backend.
- **Respaldo** diario de la base de datos.
- **Migración a la API oficial** antes de crecer a muchos usuarios: Baileys no es oficial y va contra los términos de WhatsApp. Con la API oficial, los recordatorios fuera de la ventana de 24 horas necesitan plantillas aprobadas por Meta.

## Etapas de desarrollo

Cinco etapas, cada una funcionando de punta a punta en WhatsApp antes de pasar a la siguiente. Con las dos primeras ya funciona El Método Lukas; la quinta llega antes de crecer a muchos usuarios.

&#91;embedded content: etapas de desarrollo · 5 etapas\]

**Pendientes para arrancar**

- [ ] Número dedicado para Lukas
- [ ] Cuenta y API key de OpenAI
- [ ] Elegir hosting: VPS con Dokploy o Railway
- [ ] Redactar la política de tratamiento de datos (se necesita desde la etapa 1)
- [ ] Armar el set de pruebas del Intérprete con mensajes reales
