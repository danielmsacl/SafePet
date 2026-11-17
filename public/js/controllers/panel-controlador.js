import { BASE_TOPIC, ACTUADORES, TIEMPO_RESPUESTA_MS, TIEMPO_SIN_DATOS_MS } from '../config/dispositivo.js';
import { crearActuador } from '../models/actuador.js';
import { crearAmbiente, interpretarMedicion } from '../models/mediciones.js';
import { crearEnlaceDispositivo } from '../models/dispositivo.js';

// Controlador del panel: recibe clics de la vista y mensajes del servicio MQTT,
// actualiza los modelos, coordina temporizadores y pide a la vista que se redibuje.
export function iniciarControladorPanel({ cliente, vista, historial = null,
  reloj = globalThis, ahora = () => Date.now() }) {
  let conectado = false;
  const ambiente = crearAmbiente();
  const enlace = crearEnlaceDispositivo();
  let estadoEnlace = null;
  const actuadores = ACTUADORES.map(crearActuador);
  const temporizadores = new Map();
  const registrar = (mensaje) => vista.registrar(mensaje, ahora());

  function cancelarEspera(actuador) {
    reloj.clearTimeout(temporizadores.get(actuador.nombre));
    temporizadores.delete(actuador.nombre);
    actuador.cancelarPendiente();
  }

  function desconocido(actuador, tipo) {
    cancelarEspera(actuador);
    actuador.olvidar();
    vista.estadoActuador(actuador.nombre, tipo);
    vista.actuador(actuador, conectado);
  }

  // Indicador del Arduino, independiente de la conexión con el broker.
  function mostrarEnlace() {
    estadoEnlace = conectado ? enlace.estado(ahora(), TIEMPO_SIN_DATOS_MS) : 'desconectado';
    vista.dispositivo(estadoEnlace, enlace.ultimo);
  }

  function contactoArduino() {
    enlace.registrar(ahora());
    mostrarEnlace();
  }

  function pedirEstado() {
    if (cliente.publicar(`${BASE_TOPIC}/consulta`, 'consultar_estado')) {
      registrar('Consulta de estado enviada');
    }
  }

  function recibirEstado(actuador, mensaje) {
    if (!conectado) return;
    const resultado = actuador.recibirEstado(mensaje, ahora());
    if (!resultado) return;
    contactoArduino();
    if (resultado.confirma) cancelarEspera(actuador);
    if (actuador.pendiente !== null) vista.estadoActuador(actuador.nombre, 'aplicando');
    else vista.estadoActuador(actuador.nombre, 'confirmado', resultado.encendido);
    if (resultado.cambio || resultado.confirma) registrar(`Arduino: ${mensaje}`);
    vista.actuador(actuador, conectado);
  }

  function enviarOrden(actuador) {
    const mensaje = actuador.solicitar();
    vista.estadoActuador(actuador.nombre, 'esperando');
    vista.actuador(actuador, conectado);
    temporizadores.set(actuador.nombre, reloj.setTimeout(() => {
      desconocido(actuador, 'sin_confirmacion');
      registrar(`Sin confirmación: ${mensaje}. La orden pudo haberse ejecutado.`);
    }, TIEMPO_RESPUESTA_MS));
    const enviado = cliente.publicar(`${BASE_TOPIC}/${actuador.nombre}`, mensaje, () => {
      desconocido(actuador, 'error_envio');
      registrar(`Error de envío: ${mensaje}`);
    });
    if (!enviado) desconocido(actuador, 'sin_conexion');
    else registrar(`Enviado: ${mensaje}`);
  }

  function recibirMedicion(texto) {
    if (!conectado) return;
    const valores = interpretarMedicion(texto);
    if (!valores) return; // Un mensaje inválido no cambia lo mostrado ni el historial.
    contactoArduino();
    ambiente.registrar(valores, ahora());
    vista.medicion(valores, ambiente.recibida);
    historial?.medicion(valores);
  }

  function cambiarConexion(listo, mensaje, tipo = listo ? 'conectado' : 'error') {
    conectado = listo;
    vista.conexion(listo, mensaje, tipo);
    // Tras conectar o desconectar se exige un mensaje nuevo del Arduino.
    enlace.olvidar();
    mostrarEnlace();
    actuadores.forEach((actuador) => desconocido(actuador, listo ? 'desconocido' : 'desconectado'));
    if (listo) pedirEstado();
    else {
      ambiente.reiniciar();
      vista.sinMedicion('desconectado');
    }
  }

  // Suscripciones: se registran una vez, antes de conectar.
  for (const actuador of actuadores) {
    cliente.suscribir(`${BASE_TOPIC}/${actuador.nombre}/estado`, (mensaje) => recibirEstado(actuador, mensaje));
    vista.alPulsarActuador(actuador.nombre, () => enviarOrden(actuador));
    vista.actuador(actuador, conectado);
  }
  // Solo /eventos genera acciones en el historial; los /estado periódicos no.
  cliente.suscribir(`${BASE_TOPIC}/eventos`, (mensaje) => {
    if (conectado) historial?.evento(mensaje);
  });
  cliente.suscribir(`${BASE_TOPIC}/sensores`, recibirMedicion);
  cliente.suscribir(`${BASE_TOPIC}/sensor/estado`, (mensaje) => {
    if (conectado && mensaje === 'error_dht22') {
      contactoArduino();
      ambiente.marcarError();
      vista.sinMedicion('error');
    }
  });
  vista.alConsultar(pedirEstado);
  mostrarEnlace();
  cliente.conectar(cambiarConexion);

  // Un único temporizador periódico detecta silencio del Arduino y lecturas antiguas.
  reloj.setInterval(() => {
    const instante = ahora();
    for (const actuador of actuadores) {
      if (actuador.sinRespuesta(instante, TIEMPO_SIN_DATOS_MS)) desconocido(actuador, 'sin_respuesta');
    }
    if (ambiente.esAntigua(instante, TIEMPO_SIN_DATOS_MS)) vista.medicionAntigua();
    if (conectado && enlace.estado(instante, TIEMPO_SIN_DATOS_MS) !== estadoEnlace) mostrarEnlace();
  }, 1000);
}
