export const MqttClient = {
  client: null,
  callbacks: {}, 

  conectar() {
    this.client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

    this.client.on('connect', () => {
      console.log('MQTT conectado');
      Object.keys(this.callbacks).forEach((topic) => {
        this.client.subscribe(topic);
      });
    });

    this.client.on('error', (e) => console.error('MQTT error:', e));
    this.client.on('reconnect', () => console.log('MQTT reconectando...'));

    this.client.on('message', (topic, payload) => {
      const mensaje = payload.toString();
      console.log(`Recibido en ${topic}: ${mensaje}`);

      if (this.callbacks[topic]) {
        this.callbacks[topic](mensaje);
      }
    });
  },

  publicar(topic, mensaje) {
    if (this.client && this.client.connected) {
      this.client.publish(topic, mensaje);
      console.log(`Publicado en ${topic}: ${mensaje}`);
    } else {
      console.warn('MQTT no conectado, no se publicó');
    }
  },

  suscribir(topic, callback) {
    this.callbacks[topic] = callback; 

    if (this.client && this.client.connected) {
      this.client.subscribe(topic);
      console.log(`Suscrito a ${topic}`);
    } else {
      console.warn(`No se pudo suscribir a ${topic} (sin conexión)`);
    }
  }
};