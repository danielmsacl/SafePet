import { MqttClient } from './model/mqtt-client.js';
import { BASE_TOPIC, TIEMPO_RESPUESTA_MS, TIEMPO_SIN_DATOS_MS } from './config.js';
import { iniciarHistorial } from './historial-vista.js';

export function iniciarPanel({ cliente = MqttClient, doc = document, reloj = globalThis, historial = null,
  ahora = () => Date.now() } = {}) {
  const elemento = (id) => doc.getElementById(id);
  let conectado = false;
  let ultimaLectura = null;
  const actuadores = ['led', 'ventilador'].map((nombre) => ({
    nombre, boton: elemento(`btn-${nombre}`), texto: elemento(`estado-${nombre}`),
    estado: null, recibido: null, pendiente: null, timer: null,
  }));
  function registrar(mensaje) {
    const hora = new Date(ahora()).toLocaleTimeString('es-CL');
    const log = elemento('registro');
    log.textContent = [`${hora} · ${mensaje}`, ...log.textContent.split('\n')].slice(0, 30).join('\n');
  }
  function dibujar(actuador) {
    const { boton, nombre, estado, pendiente } = actuador;
    boton.disabled = !conectado || estado === null || pendiente !== null;
    boton.textContent = pendiente !== null ? 'Esperando respuesta…'
      : estado === null ? `Esperando ${nombre}…`
      : `${estado ? 'Apagar' : 'Prender'} ${nombre}`;
    boton.setAttribute('aria-pressed', String(estado === true));
    boton.classList.toggle('seleccionado', estado === true);
  }
  function cancelar(actuador) {
    reloj.clearTimeout(actuador.timer);
    actuador.timer = null;
    actuador.pendiente = null;
  }
  function desconocido(actuador, texto) {
    cancelar(actuador);
    actuador.estado = null;
    actuador.recibido = null;
    actuador.texto.textContent = texto;
    dibujar(actuador);
  }
  function pedirEstado() {
    if (cliente.publicar(`${BASE_TOPIC}/consulta`, 'consultar_estado')) {
      registrar('Consulta de estado enviada');
    }
  }
  for (const actuador of actuadores) {
    const { nombre, boton } = actuador;
    cliente.suscribir(`${BASE_TOPIC}/${nombre}/estado`, (mensaje) => {
      if (!conectado || ![`${nombre}_prendido`, `${nombre}_apagado`].includes(mensaje)) return;
      const nuevo = mensaje === `${nombre}_prendido`;
      const cambio = actuador.estado !== nuevo;
      const confirma = actuador.pendiente === nuevo;
      actuador.estado = nuevo;
      actuador.recibido = ahora();
      if (confirma) cancelar(actuador);
      actuador.texto.textContent = actuador.pendiente !== null
        ? 'Esperando que Arduino aplique la orden…'
        : `${nuevo ? 'Encendido' : 'Apagado'} · salida confirmada por Arduino`;
      if (cambio || confirma) registrar(`Arduino: ${mensaje}`);
      dibujar(actuador);
    });
    boton.addEventListener('click', () => {
      if (boton.disabled) return;
      const destino = !actuador.estado;
      const mensaje = `${destino ? 'prender' : 'apagar'}_${nombre}`;
      actuador.pendiente = destino;
      actuador.texto.textContent = 'Esperando confirmación del Arduino…';
      dibujar(actuador);
      actuador.timer = reloj.setTimeout(() => {
        desconocido(actuador, 'Sin confirmación. Consulta el estado antes de reintentar.');
        registrar(`Sin confirmación: ${mensaje}. La orden pudo haberse ejecutado.`);
      }, TIEMPO_RESPUESTA_MS);
      const enviado = cliente.publicar(`${BASE_TOPIC}/${nombre}`, mensaje, () => {
        desconocido(actuador, 'No se pudo enviar. Consulta el estado.');
        registrar(`Error de envío: ${mensaje}`);
      });
      if (!enviado) desconocido(actuador, 'Sin conexión. Orden no enviada.');
      else registrar(`Enviado: ${mensaje}`);
    });
    dibujar(actuador);
  }
  cliente.suscribir(`${BASE_TOPIC}/eventos`, (mensaje) => {
    if (conectado) historial?.evento(mensaje);
  });
  cliente.suscribir(`${BASE_TOPIC}/sensores`, (mensaje) => {
    if (!conectado) return;
    try {
      const datos = JSON.parse(mensaje);
      if (!Number.isFinite(datos.temperatura) || !Number.isFinite(datos.humedad)
        || datos.temperatura < -40 || datos.temperatura > 80
        || datos.humedad < 0 || datos.humedad > 100) return;
      ultimaLectura = ahora();
      elemento('temperatura').textContent = `${datos.temperatura.toFixed(1)} °C`;
      elemento('humedad').textContent = `${datos.humedad.toFixed(1)} %`;
      elemento('estado-sensor').textContent = `Recibido a las ${new Date(ultimaLectura).toLocaleTimeString('es-CL')}`;
      historial?.medicion(datos);
    } catch { /* Un mensaje inválido no debe romper los botones. */ }
  });
  cliente.suscribir(`${BASE_TOPIC}/sensor/estado`, (mensaje) => {
    if (conectado && mensaje === 'error_dht22') {
      ultimaLectura = null;
      elemento('temperatura').textContent = '—';
      elemento('humedad').textContent = '—';
      elemento('estado-sensor').textContent = 'Error de lectura DHT22. Revisa el cableado.';
    }
  });
  elemento('btn-consultar').addEventListener('click', pedirEstado);
  cliente.conectar((listo, mensaje) => {
    conectado = listo;
    elemento('conexion').textContent = mensaje;
    elemento('btn-consultar').disabled = !listo;
    actuadores.forEach((actuador) => desconocido(actuador,
      listo ? 'Esperando estado del Arduino…' : 'Estado desconocido: MQTT desconectado.'));
    if (listo) pedirEstado();
    else {
      ultimaLectura = null;
      elemento('temperatura').textContent = '—';
      elemento('humedad').textContent = '—';
      elemento('estado-sensor').textContent = 'Sin conexión. Esperando datos nuevos.';
    }
  });
  reloj.setInterval(() => {
    for (const actuador of actuadores) {
      if (actuador.recibido !== null && ahora() - actuador.recibido > TIEMPO_SIN_DATOS_MS) {
        desconocido(actuador, 'Arduino sin respuesta. Revisa su conexión.');
      }
    }
    if (ultimaLectura !== null && ahora() - ultimaLectura > TIEMPO_SIN_DATOS_MS) {
      elemento('estado-sensor').textContent = 'Lectura antigua: no llegan datos nuevos.';
    }
  }, 1000);
}

if (typeof document !== 'undefined') iniciarPanel({ historial: iniciarHistorial() });
