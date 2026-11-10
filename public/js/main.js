import { MqttClient } from './model/mqtt-client.js';

const boton = document.getElementById('btnLed');

MqttClient.conectar();

boton.addEventListener('click', () => {
  const seleccionado = boton.classList.toggle('seleccionado');
  boton.setAttribute('aria-pressed', seleccionado);
  boton.textContent = seleccionado ? 'Apagar LED' : 'Prender LED';

  const mensaje = seleccionado ? 'prender_led' : 'apagar_led';
  MqttClient.publicar('safepet/led', mensaje);
});