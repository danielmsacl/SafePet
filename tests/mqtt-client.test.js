import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { MqttClient } from '../public/js/model/mqtt-client.js';

test('suscribe antes de habilitar envíos, restaura suscripciones y descarta retain', () => {
  const transporte = new EventEmitter();
  transporte.connected = true;
  let opciones, suscripciones = 0, suback;
  const publicaciones = [], estados = [], mensajes = [];
  transporte.subscribe = (topics, opts, fn) => { suscripciones++; suback = fn; };
  transporte.publish = (...args) => { publicaciones.push(args); };
  globalThis.mqtt = { connect(url, opts) { opciones = opts; return transporte; } };
  try {
    const cliente = { ...MqttClient, client: null, listo: false, callbacks: {} };
    cliente.suscribir('estado', (mensaje) => mensajes.push(mensaje));
    cliente.conectar((listo) => estados.push(listo));
    transporte.emit('connect');
    assert.equal(cliente.publicar('orden', 'prender_led'), false);
    assert.equal(opciones.queueQoSZero, false);
    suback(null, [{ topic: 'estado', qos: 0 }]);
    assert.equal(cliente.publicar('orden', 'prender_led'), true);
    assert.deepEqual(publicaciones[0][2], { qos: 0, retain: false });
    transporte.emit('message', 'estado', Buffer.from('viejo'), { retain: true });
    transporte.emit('message', 'estado', Buffer.from('nuevo'), { retain: false });
    assert.deepEqual(mensajes, ['nuevo']);
    transporte.connected = false; transporte.emit('close');
    assert.equal(cliente.publicar('orden', 'apagar_led'), false);
    transporte.connected = true; transporte.emit('connect');
    assert.equal(suscripciones, 2);
    suback(null, [{ topic: 'estado', qos: 0 }]);
    assert.deepEqual(estados, [true, false, true]);
  } finally { delete globalThis.mqtt; }
});

test('una suscripción rechazada no habilita órdenes', () => {
  const transporte = new EventEmitter();
  transporte.connected = true;
  transporte.subscribe = (topics, opts, fn) => fn(null, [{ topic: 'estado', qos: 128 }]);
  globalThis.mqtt = { connect() { return transporte; } };
  try {
    const cliente = { ...MqttClient, listo: false, callbacks: { estado() {} } };
    cliente.conectar(); transporte.emit('connect');
    assert.equal(cliente.listo, false);
    assert.equal(cliente.publicar('orden', 'prender_led'), false);
  } finally { delete globalThis.mqtt; }
});

test('si falla el CDN, muestra un error en vez de intentar conectar', () => {
  const cliente = { ...MqttClient, listo: false };
  let resultado;
  cliente.conectar((listo, mensaje) => { resultado = { listo, mensaje }; });
  assert.equal(resultado.listo, false);
  assert.match(resultado.mensaje, /No se pudo cargar MQTT/);
});
