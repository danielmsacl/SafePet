export const MqttClient = {
  client: null,

  conectar() {
    this.client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

    this.client.on('connect', () => console.log('MQTT conectado'));
    this.client.on('error', (e) => console.error('MQTT error:', e));
  },

  publicar(topic, mensaje) {
    if (this.client && this.client.connected) {
      this.client.publish(topic, mensaje);
      console.log(`Publicado en ${topic}: ${mensaje}`);
    } else {
      console.warn('MQTT no conectado');
    }
  },

  suscribir(topic, callback) {
    if (this.client && this.client.connected) {
      this.client.subscribe(topic);
      this.client.on('message', (t, payload) => {
        if (t === topic) callback(payload.toString());
      });
    }
  }
};