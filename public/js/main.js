// Punto de entrada: construye y conecta las dependencias una sola vez por carga de página.
import { firebaseConfig } from './config/firebase.js';
import { MqttClient, crearIdCliente } from './services/mqtt-client.js';
import { crearFirebase } from './services/firebase-db.js';
import { crearVistaPanel } from './views/panel-vista.js';
import { crearVistaHistorial } from './views/historial-vista.js';
import { iniciarControladorPanel } from './controllers/panel-controlador.js';
import { iniciarControladorHistorial } from './controllers/historial-controlador.js';
import { esAppNativa, nombrePlataforma, alVolverAlPrimerPlano } from './plataforma/android.js';

// Panel de control (MQTT ↔ vista). Las pruebas lo usan con transporte, DOM y reloj simulados.
export function iniciarPanel({ cliente = MqttClient, doc = document, reloj = globalThis,
  historial = null, ahora = () => Date.now() } = {}) {
  return iniciarControladorPanel({ cliente, vista: crearVistaPanel(doc), historial, reloj, ahora });
}

export function iniciarAplicacion(doc = document) {
  MqttClient.idCliente = crearIdCliente(nombrePlataforma());
  const historial = iniciarControladorHistorial({
    vista: crearVistaHistorial(doc),
    crearBase: firebaseConfig ? (avisos) => crearFirebase(firebaseConfig, avisos) : null,
  });
  const panel = iniciarPanel({ doc, historial });
  // Solo en la app Android: al volver de segundo plano se revisa la conexión y el estado.
  if (esAppNativa()) {
    alVolverAlPrimerPlano(doc, (msOculta) => {
      // Sin Internet al abrir no cargó mqtt.js: recargar es la única forma de reintentarlo.
      if (panel.reanudar(msOculta) === 'sin_biblioteca') globalThis.location.reload();
    });
  }
}

if (typeof document !== 'undefined') iniciarAplicacion();
