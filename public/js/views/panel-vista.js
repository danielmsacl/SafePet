// Vista del panel: dibuja indicadores de conexión, controles, ambiente y registro de sesión.
// Entrega los clics al controlador. No conoce MQTT ni Firebase ni decide reglas.
// data-estado solo da color: cada estado también se expresa con texto.
const NOMBRES = { led: 'LED', ventilador: 'motor' };

const ESTADOS_ACTUADOR = {
  desconocido: ['desconocido', 'Estado desconocido. Puedes enviar órdenes sin esperar al Arduino.'],
  desconectado: ['desconocido', 'Estado desconocido: MQTT desconectado.'],
  esperando: ['espera', 'Orden enviada. Esperando confirmación del Arduino…'],
  aplicando: ['espera', 'Esperando que Arduino aplique la orden…'],
  sin_confirmacion: ['aviso', 'Sin confirmación. Puedes enviar otra orden o consultar el estado.'],
  error_envio: ['error', 'No se pudo enviar. Consulta el estado.'],
  sin_conexion: ['error', 'Sin conexión. Orden no enviada.'],
  sin_respuesta: ['aviso', 'Arduino sin respuesta. Revisa su conexión.'],
};

const ESTADOS_SENSOR = {
  antigua: ['aviso', 'Lectura antigua: no llegan datos nuevos.'],
  error: ['error', 'Error de lectura DHT22. Revisa el cableado.'],
  desconectado: ['desconocido', 'Sin conexión. Esperando datos nuevos.'],
};

const ESTADOS_DISPOSITIVO = {
  desconectado: ['desconocido', 'Desconocido: sin conexión con el broker.'],
  sin_datos: ['espera', 'Sin mensajes del Arduino en esta conexión.'],
  activo: ['ok', 'Respondiendo.'],
  silencioso: ['aviso', 'Sin mensajes recientes. Revisa el Arduino.'],
};

const ESTADOS_MQTT = { conectado: 'ok', reintentando: 'espera', error: 'error' };

export function crearVistaPanel(doc) {
  const el = (id) => doc.getElementById(id);
  const hora = (instante) => new Date(instante).toLocaleTimeString('es-CL');
  // Evita reescribir el mismo texto en regiones role="status" (no repetir anuncios).
  const escribir = (nodo, texto) => { if (nodo.textContent !== texto) nodo.textContent = texto; };
  const marcar = (nodo, estado) => nodo.setAttribute('data-estado', estado);

  return {
    alPulsarActuador(nombre, accion) {
      const boton = el(`btn-${nombre}`);
      boton.addEventListener('click', () => { if (!boton.disabled) accion(); });
    },

    alConsultar(accion) {
      el('btn-consultar').addEventListener('click', accion);
    },

    conexion(listo, mensaje, tipo) {
      escribir(el('conexion'), mensaje);
      marcar(el('indicador-mqtt'), ESTADOS_MQTT[tipo] ?? 'error');
      el('btn-consultar').disabled = !listo;
    },

    dispositivo(estado, ultimo) {
      const [color, texto] = ESTADOS_DISPOSITIVO[estado];
      escribir(el('estado-dispositivo'), texto);
      marcar(el('indicador-dispositivo'), color);
      el('contacto-dispositivo').textContent = ultimo === null ? '' : `Último mensaje: ${hora(ultimo)}`;
    },

    // Botón: habilitado con MQTT listo y sin orden en curso. El texto indica la próxima orden.
    actuador({ nombre, estado, solicitado, pendiente }, conectado) {
      const boton = el(`btn-${nombre}`);
      boton.disabled = !conectado || pendiente !== null;
      const siguiente = (estado ?? solicitado) ? 'Apagar' : 'Prender';
      boton.textContent = pendiente !== null ? 'Esperando respuesta…' : `${siguiente} ${NOMBRES[nombre]}`;
      boton.setAttribute('aria-pressed', String(estado === true));
      boton.classList.toggle('seleccionado', estado === true);
    },

    estadoActuador(nombre, tipo, encendido = null) {
      const nodo = el(`estado-${nombre}`);
      if (tipo === 'confirmado') {
        escribir(nodo, `${encendido ? 'Encendido' : 'Apagado'} · confirmado por Arduino`);
        marcar(nodo, encendido ? 'encendido' : 'apagado');
        return;
      }
      const [color, texto] = ESTADOS_ACTUADOR[tipo];
      escribir(nodo, texto);
      marcar(nodo, color);
    },

    medicion({ temperatura, humedad }, recibida) {
      el('temperatura').textContent = `${temperatura.toFixed(1)} °C`;
      el('humedad').textContent = `${humedad.toFixed(1)} %`;
      marcar(el('lecturas'), 'ok');
      const estado = el('estado-sensor');
      estado.textContent = `Última lectura recibida a las ${hora(recibida)}`;
      marcar(estado, 'ok');
    },

    // Sin valores vigentes: error del sensor o desconexión borran los números mostrados.
    sinMedicion(tipo) {
      const [color, texto] = ESTADOS_SENSOR[tipo];
      el('temperatura').textContent = '—';
      el('humedad').textContent = '—';
      marcar(el('lecturas'), color);
      const estado = el('estado-sensor');
      escribir(estado, texto);
      marcar(estado, color);
    },

    // Datos antiguos: se conservan los últimos valores, pero se avisa que no son actuales.
    medicionAntigua() {
      const [color, texto] = ESTADOS_SENSOR.antigua;
      marcar(el('lecturas'), color);
      const estado = el('estado-sensor');
      escribir(estado, texto);
      marcar(estado, color);
    },

    registrar(mensaje, instante) {
      const log = el('registro');
      log.textContent = [`${hora(instante)} · ${mensaje}`, ...log.textContent.split('\n')].slice(0, 30).join('\n');
    },
  };
}
