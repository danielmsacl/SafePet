// Punto de entrada: construye y conecta las dependencias una sola vez.
import { firebaseConfig } from './config/firebase.js';
import { MqttClient } from './services/mqtt-client.js';
import { crearFirebase } from './services/firebase-db.js';
import { crearVistaPanel } from './views/panel-vista.js';
import { crearVistaHistorial } from './views/historial-vista.js';
import { iniciarControladorPanel } from './controllers/panel-controlador.js';
import { iniciarControladorHistorial } from './controllers/historial-controlador.js';

// Panel de control (MQTT ↔ vista). Las pruebas lo usan con transporte, DOM y reloj simulados.
export function iniciarPanel({ cliente = MqttClient, doc = document, reloj = globalThis,
  historial = null, ahora = () => Date.now() } = {}) {
  iniciarControladorPanel({ cliente, vista: crearVistaPanel(doc), historial, reloj, ahora });
}

export function iniciarAplicacion(doc = document) {
  const historial = iniciarControladorHistorial({
    vista: crearVistaHistorial(doc),
    crearBase: firebaseConfig ? (avisos) => crearFirebase(firebaseConfig, avisos) : null,
  });
  iniciarPanel({ doc, historial });
}

if (typeof document !== 'undefined') iniciarAplicacion();
