import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { crearHistorial } from '../public/js/model/historial.js';

test('sin configurar no simula guardado y mantiene números en las mediciones', () => {
  let filas, id = 0;
  const historial = crearHistorial({ alCambiar: (datos) => { filas = datos; }, ahora: () => 1000, nuevoId: () => String(++id) });
  historial.evento('led_prendido');
  historial.medicion({ temperatura: 26.4, humedad: 58 });
  assert.equal(filas.length, 2);
  assert.ok(filas.every((fila) => fila.estado === 'sin_configurar' && fila.fecha === 1000));
  const lectura = filas.find((fila) => fila.sensor === 'DHT22');
  assert.equal(lectura.temperatura, 26.4);
  assert.equal(lectura.accion, 'lectura');
  historial.evento('consultar_estado');
  historial.medicion({ temperatura: NaN, humedad: 58 });
  historial.medicion({ temperatura: 23, humedad: 101 });
  assert.equal(filas.length, 2);
});

test('solo el ACK de escritura marca guardado, incluso si Firebase anticipa un snapshot', async () => {
  let filas, resolver, guardado;
  const historial = crearHistorial({
    guardar: (datos) => { guardado = datos; return new Promise((resolve) => { resolver = resolve; }); },
    alCambiar: (datos) => { filas = datos; }, ahora: () => 1000, nuevoId: () => 'id-1',
  });
  historial.evento('ventilador_prendido');
  await setImmediate();
  assert.equal(filas[0].estado, 'pendiente');
  assert.equal(guardado.sensor, 'ventilador');
  assert.equal(guardado.accion, 'encendido');
  assert.equal('estado' in guardado, false);
  historial.cargar([{ ...guardado, fecha: 2000 }]);
  assert.equal(filas[0].estado, 'pendiente');
  resolver(); await setImmediate();
  assert.equal(filas[0].estado, 'guardado');
  assert.equal(filas[0].fecha, 2000);
});

test('rechazo de escritura queda visible como error sin perder la confirmación recibida', async () => {
  let filas;
  const historial = crearHistorial({ guardar: async () => { throw new Error('PERMISSION_DENIED'); },
    alCambiar: (datos) => { filas = datos; }, nuevoId: () => 'id-2' });
  historial.evento('led_apagado');
  await setImmediate();
  assert.equal(filas[0].estado, 'error');
  assert.equal(filas[0].accion, 'apagado');
});

test('recupera historial y limita la vista a los 100 registros más recientes', () => {
  let filas;
  const historial = crearHistorial({ alCambiar: (datos) => { filas = datos; } });
  historial.cargar(Array.from({ length: 120 }, (_, id) => ({ id: String(id), fecha: id + 1, sensor: 'LED', accion: 'apagado' })));
  assert.equal(filas.length, 100);
  assert.equal(filas[0].fecha, 120);
  assert.ok(filas.every((fila) => fila.estado === 'guardado'));
});
