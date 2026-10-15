# Lukas 🇨🇴
> **Asistente de finanzas personales por WhatsApp para Colombia**

Lukas es un asistente de finanzas personales multiusuario para WhatsApp que te ayuda a registrar gastos e ingresos en lenguaje natural colombiano, organizar deudas fijas y aplicar **El Método Lukas**: hackear el sistema de las tarjetas de crédito para usarlas como un préstamo gratis de hasta 55 días a 1 cuota con **0% de interés**.

---

## ✨ Características Principales

* 💳 **El Método Lukas (Hackea tus Tarjetas):**
  * Toda compra se calcula a **1 cuota a tasa 0% de interés**.
  * **Ventana Dorada:** Comprar el día después de la fecha de corte para ganar de 45 a 55 días de financiamiento gratuito.
  * **Recomendador Inteligente:** Le preguntas *"¿Qué tarjeta uso hoy para 500 mil?"* y te indica cuál maximiza los días hasta el pago y valida el cupo disponible.
  * **Exoneración de Cuota de Manejo:** Seguimiento de metas mensuales de compras o gasto para no pagar cuotas de manejo bancarias.
  * **Pago Rápido:** Diciendo *"ya pagué la nu"* o *"ya pagué la gold"* se liquida el ciclo y restablece el cupo al 100%.
* 📝 **Lukas Anota:**
  * Registro ágil en lenguaje natural: *"85000 mercado en efectivo"*, *"120000 gasolina nu a 1 cuota"*, *"me pagaron 3500000"*.
  * **Protección de compras diferidas:** Si un datáfono o comercio internacional difiere a 12 o 24 cuotas, Lukas te avisa rediferirla antes del corte y permite actualizarla con *"ya pasé la de amazon a 1 cuota"*.
  * Deshacer: *"borra el último"* revierte el último movimiento registrado.
* 📋 **Lukas Lleva tus Cuentas:**
  * Control de deudas a cuotas (ej. crédito de auto Kona) y pagos fijos (arriendo, servicios). Descuento automático de cuotas al registrar pagos (*"pagué el kona"*).
* 🛡️ **Umbral Máximo de Gasto Mensual:**
  * Define o edita tu presupuesto global en cualquier momento: *"mi presupuesto este mes es 3 millones"*. Alertas automáticas al 80% y 100%.
* 🔔 **Lukas Te Avisa:**
  * Recordatorio el día después del corte con el saldo del extracto.
  * Recordatorio 3 días antes de la fecha límite de pago.
  * Alerta urgente el mismo día del vencimiento.
* 📊 **Lukas Te Muestra:**
  * Resúmenes periódicos de ingresos vs. gastos y gráficas de barras por categoría con QuickChart.

---

## 🏗️ Arquitectura Técnica

Desarrollado en **NestJS (TypeScript)** con tipado estricto (**CERO `any`**) y organizado en 9 módulos:

```
src/
├── canal/          # Puente: WhatsApp (Baileys) + Simulador interactivo CLI
├── usuarios/       # Cuenta: Onboarding, Habeas Data (Ley 1581 de 2012)
├── parser/         # Intérprete: OpenAI GPT-4o mini con fallback determinista
├── respuestas/     # Voz: Plantillas cercanas y formato colombiano ($39.000)
├── movimientos/    # Libro: Registro de gastos, ingresos y control de cuotas
├── tarjetas/       # El Método Lukas: Matemática de ciclos, optimizador y pagos
├── obligaciones/   # Compromisos: Deudas a cuotas y pagos fijos
├── alertas/        # Alertas: Cron cada 15 min para recordatorios a las 8:00 AM
└── reportes/       # Reportes: Balances y gráficas de barras
```

* **Base de datos:** PostgreSQL 16 en contenedor Docker local (puerto `5434:5432`).
* **Canal:** `@whiskeysockets/baileys` (código QR en terminal) + `readline` CLI.
* **IA:** OpenAI `gpt-4o-mini` (salida estricta en JSON).

---

## 🚀 Inicio Rápido

### 1. Requisitos
* Node.js v20+ o v22+
* Docker y Docker Compose

### 2. Levantar la Base de Datos
```bash
docker compose up -d
```
Esto inicializa PostgreSQL 16 en el puerto `5434` con las 11 tablas del esquema oficial.

### 3. Configurar Variables de Entorno
Copia el archivo de ejemplo:
```bash
cp .env.example .env
```
Configura tu `OPENAI_API_KEY` (opcional, Lukas cuenta con motor de respaldo determinista offline).

### 4. Modo Simulador en Consola (CLI sin celular)
Para probar todas las funciones directamente en la terminal:
```bash
npm run start:cli
```

### 5. Modo WhatsApp Web Real
Para conectar tu número de WhatsApp escaneando el código QR en la consola:
```bash
# En .env define: CANAL_PROVEEDOR=baileys
npm start
```

---

## 🧪 Pruebas Automatizadas

Ejecutar la suite completa de pruebas unitarias y E2E:
```bash
npm test
```
* `tests/cycle-calculator.test.ts` (Matemática de ciclos y gracia de 50 días)
* `tests/card-optimizer.test.ts` (Ranking de mejor tarjeta)
* `tests/interpreter-benchmark.test.ts` (Set de pruebas del Intérprete)
* `tests/canal-router.e2e.test.ts` (Flujo E2E completo del bot)

---

## 📄 Licencia
Privado / Propietario.
