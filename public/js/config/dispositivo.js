// Contrato con el Arduino. BASE_TOPIC debe coincidir con BASE_TOPIC del programa .ino.
export const BASE_TOPIC = 'safepet/danielmsacl/uno-r4-01';
// Transporte WebSocket seguro hacia el broker HiveMQ (el Arduino usa TCP 1883 hacia el mismo broker).
export const BROKER_WS_URL = 'wss://broker.hivemq.com:8884/mqtt';
// Actuadores controlados por la web. "ventilador" es el nombre del contrato MQTT del motor paso a paso.
export const ACTUADORES = ['led', 'ventilador'];
export const TIEMPO_RESPUESTA_MS = 7000;
export const TIEMPO_SIN_DATOS_MS = 16000;
