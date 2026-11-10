export const MqttClient = {
  client: null,
  callbacks: {},
  listo: false,
  alEstado: () => {},

  conectar(alEstado = () => {}) {
    this.alEstado = alEstado;
    if (!globalThis.mqtt) {
      alEstado(false, 'No se pudo cargar MQTT. Revisa Internet y recarga.');
      return;
    }
    this.client = globalThis.mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      resubscribe: false,
      queueQoSZero: false,
    });
    const desconectado = (mensaje) => {
      this.listo = false;
      this.alEstado(false, mensaje);
    };
    this.client.on('connect', () => {
      // Esperar SUBACK antes de consultar: no perder la respuesta inicial.
      this.client.subscribe(Object.keys(this.callbacks), { qos: 0 }, (error, granted) => {
        if (error || !granted?.length || granted.some((item) => item.qos === 128)) {
          desconectado('No se pudo suscribir a las respuestas. Recarga la página.');
          return;
        }
        if (!this.client.connected) return;
        this.listo = true;
        this.alEstado(true, 'MQTT conectado');
      });
    });
    this.client.on('close', () => desconectado('MQTT desconectado; reintentando…'));
    this.client.on('offline', () => desconectado('Sin conexión con MQTT'));
    this.client.on('reconnect', () => desconectado('Reconectando con MQTT…'));
    this.client.on('error', () => desconectado('Error de conexión MQTT'));
    this.client.on('message', (topic, payload, packet) => {
      // Solo respuestas nuevas, nunca estados antiguos retenidos.
      if (!packet?.retain) this.callbacks[topic]?.(payload.toString());
    });
  },

  publicar(topic, mensaje, alError = () => {}) {
    if (!this.listo || !this.client?.connected) return false;
    // Sin cola ni retain: una orden vieja no debe ejecutarse al reconectar.
    this.client.publish(topic, mensaje, { qos: 0, retain: false }, (error) => {
      if (error) alError(error);
    });
    return true;
  },

  suscribir(topic, callback) {
    // Registrar todas las suscripciones antes de conectar.
    this.callbacks[topic] = callback;
  },
};
