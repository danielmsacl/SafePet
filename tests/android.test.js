import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { esAppNativa, nombrePlataforma, alVolverAlPrimerPlano } from '../public/js/plataforma/android.js';
import { MqttClient, crearIdCliente } from '../public/js/services/mqtt-client.js';
import { crearFirebase } from '../public/js/services/firebase-db.js';
import { iniciarControladorPanel } from '../public/js/controllers/panel-controlador.js';
import { iniciarControladorHistorial } from '../public/js/controllers/historial-controlador.js';

test('plataforma: solo Capacitor nativo cuenta como app; en el navegador no cambia nada', () => {
  assert.equal(esAppNativa({}), false);
  assert.equal(nombrePlataforma({ Capacitor: { isNativePlatform: () => false } }), 'web');
  assert.equal(nombrePlataforma({ Capacitor: { isNativePlatform: () => true } }), 'android');
});

test('primer plano: informa el tiempo oculto y solo al volver de un ocultamiento', () => {
  let tiempo = 0, listeners = 0, manejador;
  const doc = { visibilityState: 'visible', addEventListener(nombre, fn) { listeners++; manejador = fn; } };
  const avisos = [];
  alVolverAlPrimerPlano(doc, (ms) => avisos.push(ms), () => tiempo);
  manejador(); // visible sin haberse ocultado
  doc.visibilityState = 'hidden'; tiempo = 1000; manejador();
  doc.visibilityState = 'visible'; tiempo = 21000; manejador();
  assert.deepEqual(avisos, [20000]);
  assert.equal(listeners, 1);
});

function transporteFalso() {
  const t = new EventEmitter();
  t.connected = false;
  t.cierres = []; t.reconexiones = 0;
  t.subscribe = (topics, opts, fn) => fn(null, topics.map((topic) => ({ topic, qos: 0 })));
  t.publish = () => {};
  t.end = (forzado, fn) => { t.cierres.push(forzado); t.connected = false; t.emit('close'); fn(); };
  t.reconnect = () => { t.reconexiones++; t.connected = true; t.emit('connect'); };
  return t;
}

test('MQTT: clientId propio por instancia y reanudación sin crear otro cliente', () => {
  assert.match(crearIdCliente('android'), /^petsafe-android-[0-9a-f]{8}$/);
  assert.notEqual(crearIdCliente(), crearIdCliente());
  const t = transporteFalso();
  let conexiones = 0, opciones;
  globalThis.mqtt = { connect(url, opts) { conexiones++; opciones = opts; return t; } };
  try {
    const cliente = { ...MqttClient, client: null, listo: false, callbacks: { estado() {} }, idCliente: 'petsafe-android-1234abcd' };
    const estados = [];
    cliente.conectar((listo, mensaje, tipo) => estados.push(tipo));
    assert.equal(opciones.clientId, 'petsafe-android-1234abcd');
    assert.equal(opciones.queueQoSZero, false);
    assert.equal(cliente.reanudar(true), 'esperando'); // aún sin conexión: el cliente reintenta solo
    t.connected = true; t.emit('connect');
    assert.equal(cliente.reanudar(false), 'conectado');
    assert.equal(cliente.reanudar(true), 'reconectando');
    assert.deepEqual(t.cierres, [true]); // cierre forzado: no espera a un socket muerto
    assert.equal(t.reconexiones, 1);
    assert.equal(conexiones, 1); // mismo cliente, mismo clientId
    assert.equal(cliente.listo, true);
    assert.deepEqual(estados, ['conectado', 'reintentando', 'conectado']);
  } finally { delete globalThis.mqtt; }
  const sinBiblioteca = { ...MqttClient, client: null, listo: false };
  sinBiblioteca.conectar();
  assert.equal(sinBiblioteca.reanudar(), 'sin_biblioteca');
});

function panelSimulado(resultadoReanudar) {
  let tiempo = 0;
  const publicados = [], vista = new Proxy({ registros: [] }, {
    get: (obj, prop) => prop in obj ? obj[prop] : (prop === 'registrar' ? (m) => obj.registros.push(m) : () => {}),
  });
  const cliente = { pedidos: [], suscribir() {}, conectar(fn) { this.alEstado = fn; },
    publicar(topic, mensaje) { publicados.push(mensaje); return true; },
    reanudar(forzar) { this.pedidos.push(forzar); return resultadoReanudar; } };
  const reloj = { setTimeout: () => 0, clearTimeout() {}, setInterval() {} };
  const panel = iniciarControladorPanel({ cliente, vista, reloj, ahora: () => tiempo });
  cliente.alEstado(true, 'Conectado', 'conectado');
  return { panel, cliente, publicados, vista, avanzar: (ms) => { tiempo += ms; } };
}

test('reanudar: consulta el estado real si la conexión sigue; fuerza reconexión tras pausa larga', () => {
  const corto = panelSimulado('conectado');
  corto.avanzar(5000);
  assert.equal(corto.panel.reanudar(5000), 'conectado');
  assert.deepEqual(corto.cliente.pedidos, [false]);
  assert.deepEqual(corto.publicados, ['consultar_estado', 'consultar_estado']);
  const largo = panelSimulado('reconectando');
  largo.avanzar(60000);
  largo.panel.reanudar(60000);
  assert.deepEqual(largo.cliente.pedidos, [true]);
  assert.deepEqual(largo.publicados, ['consultar_estado']); // la consulta llegará al reconectar
  assert.match(largo.vista.registros.at(-1), /primer plano tras 60 s/);
});

test('Firebase sin Internet: el fallo de descarga del SDK se distingue de un error de reglas', async () => {
  const base = crearFirebase({ apiKey: 'a', databaseURL: 'https://x.invalid', projectId: 'p', appId: 'i' }, {},
    () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')));
  await assert.rejects(base.conectar(), (error) => error.codigo === 'error_carga');
  const estados = [];
  iniciarControladorHistorial({
    vista: { estadoBase: (c) => estados.push(c), mostrar() {}, alFiltrar() {} },
    crearBase: () => base,
  });
  await setImmediate();
  assert.deepEqual(estados, ['error_carga']);
});

test('www/ contiene solo la interfaz: sin firmware, pruebas, documentos ni dependencias', () => {
  execFileSync(process.execPath, ['scripts/preparar-web.mjs'], { cwd: new URL('..', import.meta.url) });
  const raiz = new URL('../www/', import.meta.url);
  const listar = (dir, base = '') => readdirSync(new URL(base, raiz)).flatMap((nombre) =>
    statSync(new URL(base + nombre, raiz)).isDirectory() ? listar(dir, `${base}${nombre}/`) : [`${base}${nombre}`]);
  const archivos = listar(raiz);
  assert.ok(archivos.includes('index.html'));
  assert.ok(archivos.includes('public/js/main.js'));
  assert.ok(archivos.includes('public/img/petsafe-logo.webp'));
  for (const archivo of archivos) {
    assert.match(archivo, /^(index\.html|public\/(css\/styles\.css|img\/petsafe-[a-z0-9-]+\.(webp|png)|js\/.+\.js))$/, archivo);
  }
  assert.equal(readFileSync(new URL('index.html', raiz), 'utf8'), readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
});
