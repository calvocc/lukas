import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { CanalRouterService } from '../src/canal/canal-router.service';
import { DatabaseService } from '../src/database/database.service';

describe('E2E: Flujo Integral de Conversación y Negocio de Lukas', () => {
  let moduleRef: TestingModule;
  let router: CanalRouterService;
  let db: DatabaseService;
  const testPhone = '+573999888777';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();

    router = moduleRef.get<CanalRouterService>(CanalRouterService);
    db = moduleRef.get<DatabaseService>(DatabaseService);

    // Limpiar usuario de prueba si existe
    await db.execute('DELETE FROM usuarios WHERE numero_whatsapp = $1', [testPhone]);
  });

  afterAll(async () => {
    // Limpieza posterior
    await db.execute('DELETE FROM usuarios WHERE numero_whatsapp = $1', [testPhone]);
    await moduleRef.close();
  });

  it('Paso 1: Saludo inicial de número nuevo -> Bienvenida y Ley 1581 (Habeas Data)', async () => {
    const res = await router.procesarMensaje(testPhone, 'hola');
    expect(res).toContain('¡Hola! Soy *Lukas*');
    expect(res).toContain('Ley 1581 de 2012');
  });

  it('Paso 2: Aceptación de política de datos -> Solicita nombre', async () => {
    const res = await router.procesarMensaje(testPhone, 'Acepto');
    expect(res).toContain('¿Cómo te gustaría que te llame?');
  });

  it('Paso 3: Proporciona nombre -> Cuenta activada con bienvenida', async () => {
    const res = await router.procesarMensaje(testPhone, 'Jhonathan');
    expect(res).toContain('¡Bienvenido a Lukas, *Jhonathan*!');
  });

  it('Paso 4: Registrar primera tarjeta (Nubank)', async () => {
    const res = await router.procesarMensaje(
      testPhone,
      'Registrar tarjeta Nu cupo 3000000 corte 15 pago 5',
    );
    expect(res).toContain('¡Tarjeta guardada con éxito!');
    expect(res).toContain('Nubank');
  });

  it('Paso 5: Registrar segunda tarjeta (Bancolombia)', async () => {
    const res = await router.procesarMensaje(
      testPhone,
      'Registrar tarjeta Bancolombia cupo 5000000 corte 5 pago 25',
    );
    expect(res).toContain('¡Tarjeta guardada con éxito!');
    expect(res).toContain('Bancolombia');
  });

  it('Paso 6: Consulta de mejor tarjeta para compra de $600.000', async () => {
    const res = await router.procesarMensaje(testPhone, '¿Qué tarjeta uso hoy para 600 mil?');
    expect(res).toContain('Recomendación Inteligente');
    expect(res).toContain('Días de financiamiento gratis');
  });

  it('Paso 7: Registrar compra a 1 cuota en Bancolombia', async () => {
    const res = await router.procesarMensaje(testPhone, '150000 mercado bancolombia a 1 cuota');
    expect(res).toContain('Gasto registrado');
    expect(res).toContain('$150.000');
    expect(res).toContain('Bancolombia');
  });

  it('Paso 8: Registrar compra diferida a 24 cuotas -> Alerta de intereses y rediferir', async () => {
    const res = await router.procesarMensaje(testPhone, '500000 pasajes nu a 24 cuotas');
    expect(res).toContain('Gasto registrado');
    expect(res).toContain('$500.000');
    expect(res).toContain('¡Ojo con los intereses!');
    expect(res).toContain('24 cuotas');
    expect(res).toContain('redifiérela a *1 cuota*');
  });

  it('Paso 9: Usuario redifiere la compra -> Actualización a 1 cuota', async () => {
    const res = await router.procesarMensaje(testPhone, 'ya pasé la de pasajes a 1 cuota');
    expect(res).toContain('Compra actualizada a *1 cuota*');
    expect(res).toContain('Se garantiza el 0% de interés');
  });

  it('Paso 10: Configurar umbral de gasto mensual', async () => {
    const res = await router.procesarMensaje(testPhone, 'mi presupuesto este mes es 3 millones');
    expect(res).toContain('Umbral de gasto mensual actualizado a $3.000.000');
  });

  it('Paso 11: Pagar tarjeta -> "ya pagué nu" restablece cupo al 100%', async () => {
    const res = await router.procesarMensaje(testPhone, 'ya pagué nu');
    expect(res).toContain('¡Pago registrado con éxito para Nubank!');
    expect(res).toContain('Cupo disponible restablecido');
    expect(res).toContain('$0 pesos pagados en intereses');
  });

  it('Paso 12: Borrar última transacción', async () => {
    const res = await router.procesarMensaje(testPhone, 'borra el último');
    expect(res).toContain('Listo, borré tu última transacción');
  });
});
