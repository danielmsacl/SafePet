import test from 'node:test';
import assert from 'node:assert/strict';
import { crearFirebase } from '../public/js/model/firebase-db.js';
import { BASE_TOPIC } from '../public/js/config.js';

test('configuración ausente falla sin cargar SDK ni simular un guardado', async () => {
  let cargado = false;
  const base = crearFirebase(null, {}, () => { cargado = true; });
  await assert.rejects(base.guardar({ id: 'id', fecha: 1000 }), /configuración/);
  assert.equal(cargado, false);
});

test('reutiliza la identidad, guarda bajo su UID y usa fecha del servidor', async () => {
  const escrituras = [], listeners = [], recuperados = [];
  let anonimos = 0;
  let rechazo = false;
  const base = crearFirebase({ apiKey: 'test', databaseURL: 'https://test.invalid', projectId: 'test', appId: 'test' }, {
    alDatos: (datos) => recuperados.push(datos),
  }, async () => [
    { initializeApp: () => ({}) },
    { getAuth: () => ({ currentUser: { uid: 'usuario-1' }, authStateReady: async () => {} }),
      setPersistence: async () => {}, browserLocalPersistence: {},
      signInAnonymously: async () => { anonimos++; return { user: { uid: 'nuevo' } }; } },
    { getDatabase: () => ({}), ref: (db, ruta) => ruta,
      serverTimestamp: () => ({ '.sv': 'timestamp' }),
      set: async (ruta, datos) => { if (rechazo) throw new Error('PERMISSION_DENIED'); escrituras.push({ ruta, datos }); },
      query: (ruta) => ruta, orderByChild: () => {}, limitToLast: () => {},
      onValue: (ruta, callback) => listeners.push({ ruta, callback }),
    },
  ]);
  await base.guardar({ id: 'registro-1', fecha: 1000, sensor: 'DHT22', accion: 'lectura', temperatura: 26.4, humedad: 58 });
  assert.equal(anonimos, 0);
  assert.deepEqual(escrituras[0], {
    ruta: 'usuarios/usuario-1/registros/registro-1',
    datos: { sensor: 'DHT22', accion: 'lectura', temperatura: 26.4, humedad: 58,
      dispositivo: BASE_TOPIC, recibidaEn: 1000, fecha: { '.sv': 'timestamp' } },
  });
  listeners.find((listener) => listener.ruta.endsWith('/registros')).callback({
    forEach: (fn) => fn({ key: 'registro-1', val: () => ({ fecha: 2000, sensor: 'DHT22' }) }),
  });
  assert.equal(recuperados[0][0].id, 'registro-1');
  rechazo = true;
  await assert.rejects(base.guardar({ id: 'registro-2', fecha: 2000 }), /PERMISSION_DENIED/);
});
