import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { iniciarControladorHistorial } from '../public/js/controllers/historial-controlador.js';
import { MqttClient } from '../public/js/services/mqtt-client.js';

const raiz = new URL('../public/js/', import.meta.url);
const fuentes = (carpeta) => readdirSync(new URL(`${carpeta}/`, raiz))
  .map((archivo) => ({ archivo: `${carpeta}/${archivo}`, codigo: readFileSync(new URL(`${carpeta}/${archivo}`, raiz), 'utf8') }));
const importaciones = (codigo) => [...codigo.matchAll(/from '([^']+)'/g)].map(([, ruta]) => ruta);

test('MVC: modelos y servicios no tocan el DOM; vistas no usan servicios ni modelos', () => {
  for (const { archivo, codigo } of [...fuentes('models'), ...fuentes('services')]) {
    assert.doesNotMatch(codigo, /\bdocument\b|getElementById|createElement/, archivo);
    assert.ok(importaciones(codigo).every((ruta) => !/views|controllers/.test(ruta)), archivo);
  }
  for (const { archivo, codigo } of fuentes('views')) {
    assert.deepEqual(importaciones(codigo), [], `${archivo} no debe importar servicios ni modelos`);
    // Los textos pueden nombrar Firebase o MQTT; lo prohibido es usar sus clientes.
    assert.doesNotMatch(codigo, /globalThis\.mqtt|firebasejs|import\(|\.publish\(|\.subscribe\(/, archivo);
  }
  for (const { archivo, codigo } of fuentes('controllers')) {
    assert.doesNotMatch(codigo, /\bdocument\b|getElementById/, archivo);
    assert.ok(importaciones(codigo).every((ruta) => !/services|views/.test(ruta)), `${archivo} recibe servicios y vistas por inyección`);
  }
});

test('rutas relativas: index.html y módulos no usan rutas absolutas del sitio', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [, ruta] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(/^https:\/\//.test(ruta) || !ruta.startsWith('/'), ruta);
  }
  for (const carpeta of ['models', 'views', 'controllers', 'services', 'config']) {
    for (const { archivo, codigo } of fuentes(carpeta)) {
      for (const ruta of importaciones(codigo)) assert.ok(ruta.startsWith('.'), `${archivo}: ${ruta}`);
    }
  }
});

function vistaFalsa() {
  const v = { estados: [], mostrados: [], filtrar: null,
    estadoBase: (codigo) => v.estados.push(codigo),
    mostrar: (filas, resumen) => v.mostrados.push({ filas, resumen }),
    alFiltrar: (fn) => { v.filtrar = fn; } };
  return v;
}

test('historial sin Firebase configurado lo indica, muestra estado vacío y no intenta guardar', () => {
  const vista = vistaFalsa();
  const historial = iniciarControladorHistorial({ vista });
  assert.deepEqual(vista.mostrados[0], { filas: [], resumen: { guardados: 0, pendientes: 0, sinGuardar: 0, total: 0, filtrado: false } });
  historial.evento('led_prendido');
  assert.deepEqual(vista.estados, ['sin_configurar']);
  assert.equal(vista.mostrados.at(-1).filas[0].estado, 'sin_configurar');
  assert.deepEqual(vista.mostrados.at(-1).resumen, { guardados: 0, pendientes: 0, sinGuardar: 1, total: 1, filtrado: false });
});

test('filtro por componente actúa sobre los registros cargados sin consultar de nuevo', () => {
  const vista = vistaFalsa();
  let consultas = 0, avisos;
  iniciarControladorHistorial({ vista, crearBase: (callbacks) => { avisos = callbacks;
    return { conectar: () => { consultas++; return new Promise(() => {}); }, guardar: async () => {} }; } });
  avisos.alDatos([
    { id: 'a', fecha: 1, sensor: 'LED', accion: 'encendido' },
    { id: 'b', fecha: 2, sensor: 'ventilador', accion: 'apagado' },
    { id: 'c', fecha: 3, sensor: 'DHT22', accion: 'lectura', temperatura: 20, humedad: 50 },
  ]);
  vista.filtrar('ventilador');
  assert.deepEqual(vista.mostrados.at(-1).filas.map((f) => f.id), ['b']);
  assert.deepEqual(vista.mostrados.at(-1).resumen, { guardados: 3, pendientes: 0, sinGuardar: 0, total: 3, filtrado: true });
  vista.filtrar('');
  assert.equal(vista.mostrados.at(-1).filas.length, 3);
  assert.equal(consultas, 1);
});

test('historial con Firebase: un solo servicio, recuperación y error de inicio visibles', async () => {
  let creados = 0, avisos;
  const vista = vistaFalsa();
  const { estados, mostrados } = vista;
  iniciarControladorHistorial({
    vista,
    crearBase: (callbacks) => {
      creados++; avisos = callbacks;
      return { conectar: () => Promise.reject(new Error('auth')), guardar: async () => {} };
    },
  });
  avisos.alDatos([{ id: 'a', fecha: 5, sensor: 'LED', accion: 'apagado' }]);
  assert.equal(mostrados.at(-1).filas[0].estado, 'guardado');
  await setImmediate();
  assert.equal(creados, 1);
  assert.deepEqual(estados, ['error_inicio']);
});

test('servicio MQTT: una segunda llamada a conectar no crea otro cliente', () => {
  let conexiones = 0;
  const transporte = { on() {}, connected: false };
  globalThis.mqtt = { connect() { conexiones++; return transporte; } };
  try {
    const cliente = { ...MqttClient, client: null, listo: false, callbacks: {} };
    cliente.conectar(); cliente.conectar();
    assert.equal(conexiones, 1);
  } finally { delete globalThis.mqtt; }
});
