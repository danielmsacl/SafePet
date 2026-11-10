/* PetSafe: Arduino publica MQTT; la web registra eventos y lecturas en Firebase.
   Placa: Arduino UNO R4 WiFi. Ver README.md para conexiones y bibliotecas.
   Adaptado al montaje del codigo original: LED D1, LCD I2C 0x27.
   DHT22 D4. Motor 28BYJ-48 con ULN2003, cuatro entradas en D8-D11.
*/
#include <WiFiS3.h>
#include <ArduinoMqttClient.h>
#include <DHT.h>
#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
#include "arduino_secrets.h"

// Mismo prefijo que public/js/config.js. Canal público para prueba académica.
#define BASE_TOPIC "safepet/danielmsacl/uno-r4-01"
const char TOPIC_LED[] = BASE_TOPIC "/led";
const char TOPIC_FAN[] = BASE_TOPIC "/ventilador";
const char TOPIC_QUERY[] = BASE_TOPIC "/consulta";
const char TOPIC_LED_STATE[] = BASE_TOPIC "/led/estado";
const char TOPIC_FAN_STATE[] = BASE_TOPIC "/ventilador/estado";
const char TOPIC_SENSOR[] = BASE_TOPIC "/sensores";
const char TOPIC_SENSOR_STATE[] = BASE_TOPIC "/sensor/estado";
// Eventos de cambio: separados de los estados periódicos y las consultas.
const char TOPIC_EVENTS[] = BASE_TOPIC "/eventos";

const int DHT_PIN = 4;
const int LED_PIN = 1; // D1/TX, como en su codigo original. No usar Serial1 a la vez.
// Orden IN1, IN2, IN3, IN4 del ULN2003: verificar etiquetas del modulo.
const uint8_t MOTOR_PINS[4] = {11, 10, 9, 8};
const unsigned long MOTOR_RPM = 15;
const unsigned long PASOS_POR_VUELTA = 2048; // Nominal, paso completo.
const unsigned long INTERVALO_PASO_US = 60000000UL / (PASOS_POR_VUELTA * MOTOR_RPM);
const uint8_t SECUENCIA[4][4] = {
  {1, 1, 0, 0}, {0, 1, 1, 0}, {0, 0, 1, 1}, {1, 0, 0, 1}
};
uint8_t pasoMotor = 0;
unsigned long ultimoPaso = 0;
const uint8_t LCD_ADDRESS = 0x27;
// Cambiar a false para probar sin LCD (la biblioteca igual debe instalarse).
const bool USAR_LCD = true;
const unsigned long INTERVALO_DATOS = 10000;
const unsigned long INTERVALO_ESTADOS = 5000;
const unsigned long REINTENTO = 5000;

WiFiClient red;
MqttClient mqttClient(red);
DHT dht(DHT_PIN, DHT22);
// Conserva 0x27 del montaje original; detecta el cableado del adaptador compatible.
hd44780_I2Cexp lcd(LCD_ADDRESS);
bool lcdListo = false;
bool ledEncendido = false;
bool ventiladorEncendido = false;
bool lecturaIntentada = false;
bool lecturaValida = false;
float temperaturaActual = 0;
float humedadActual = 0;
unsigned long ultimoWifi = 0;
unsigned long ultimoMqtt = 0;
unsigned long ultimaLectura = 0;
unsigned long ultimoEstado = 0;
unsigned long ultimaPantalla = 0;
bool intentoWifi = false;
bool intentoMqtt = false;

void publicar(const char* topic, const String& mensaje) {
  if (!mqttClient.connected()) return;
  mqttClient.beginMessage(topic, (unsigned long)mensaje.length(), false, 0);
  mqttClient.print(mensaje);
  if (!mqttClient.endMessage()) Serial.println("Error al publicar MQTT");
}

void publicarEstados() {
  publicar(TOPIC_LED_STATE, ledEncendido ? "led_prendido" : "led_apagado");
  publicar(TOPIC_FAN_STATE, ventiladorEncendido ? "ventilador_prendido" : "ventilador_apagado");
}

void liberarMotor() {
  for (uint8_t i = 0; i < 4; i++) digitalWrite(MOTOR_PINS[i], LOW);
}

void moverMotor() {
  if (!ventiladorEncendido) return;
  const unsigned long ahora = micros();
  if (ahora - ultimoPaso < INTERVALO_PASO_US) return;
  ultimoPaso = ahora;
  for (uint8_t i = 0; i < 4; i++) digitalWrite(MOTOR_PINS[i], SECUENCIA[pasoMotor][i]);
  pasoMotor = (pasoMotor + 1) % 4;
  // Un paso por llamada, sin esperar vueltas completas ni recuperar pasos en ráfaga.
}

void apagarSalidas() {
  ledEncendido = false;
  ventiladorEncendido = false;
  digitalWrite(LED_PIN, LOW);
  digitalWrite(LED_BUILTIN, LOW);
  liberarMotor();
}

void escribirLineaLCD(uint8_t fila, String texto) {
  // Completar la fila evita restos de valores anteriores sin lcd.clear().
  texto = texto.substring(0, 16);
  while (texto.length() < 16) texto += ' ';
  lcd.setCursor(0, fila);
  lcd.print(texto);
}

void actualizarPantalla() {
  if (!lcdListo || millis() - ultimaPantalla < 500) return;
  ultimaPantalla = millis();
  String conexion = "SAFEPET SIN WIFI";
  if (WiFi.status() == WL_CONNECTED) {
    conexion = mqttClient.connected() ? "SAFEPET ONLINE" : "SAFEPET SIN MQTT";
  }
  escribirLineaLCD(0, conexion);
  if (!lecturaIntentada) escribirLineaLCD(1, "T:--C H:--%");
  else if (!lecturaValida) escribirLineaLCD(1, "Error DHT22");
  else {
    String valores = "T:";
    valores += String(temperaturaActual, 1);
    valores += "C H:";
    valores += String(humedadActual, 0);
    valores += "%";
    escribirLineaLCD(1, valores);
  }
}

void recibirMensaje(int longitud) {
  const String topic = mqttClient.messageTopic();
  const bool retenido = mqttClient.messageRetain();
  String mensaje;
  // Consumir también mensajes descartados sin reservar memoria ilimitada.
  while (mqttClient.available()) {
    char caracter = (char)mqttClient.read();
    if (mensaje.length() < 64) mensaje += caracter;
  }
  if (retenido || longitud > 64) return;
  Serial.print("Recibido: ");
  Serial.print(topic);
  Serial.print(" -> ");
  Serial.println(mensaje);

  if (topic == TOPIC_LED && (mensaje == "prender_led" || mensaje == "apagar_led")) {
    const bool cambio = ledEncendido != (mensaje == "prender_led");
    ledEncendido = mensaje == "prender_led";
    digitalWrite(LED_PIN, ledEncendido ? HIGH : LOW);
    digitalWrite(LED_BUILTIN, ledEncendido ? HIGH : LOW);
    publicar(TOPIC_LED_STATE, ledEncendido ? "led_prendido" : "led_apagado");
    if (cambio) publicar(TOPIC_EVENTS, ledEncendido ? "led_prendido" : "led_apagado");
  } else if (topic == TOPIC_FAN && (mensaje == "prender_ventilador" || mensaje == "apagar_ventilador")) {
    const bool cambio = ventiladorEncendido != (mensaje == "prender_ventilador");
    ventiladorEncendido = mensaje == "prender_ventilador";
    if (!ventiladorEncendido) liberarMotor();
    else if (cambio) {
      ultimoPaso = micros() - INTERVALO_PASO_US;
      moverMotor();
    }
    publicar(TOPIC_FAN_STATE, ventiladorEncendido ? "ventilador_prendido" : "ventilador_apagado");
    if (cambio) publicar(TOPIC_EVENTS, ventiladorEncendido ? "ventilador_prendido" : "ventilador_apagado");
    Serial.println(ventiladorEncendido ? "Motor activo: objetivo 15 RPM" : "Motor detenido: bobinas desactivadas");
  } else if (topic == TOPIC_QUERY && mensaje == "consultar_estado") {
    publicarEstados();
  }
}

void leerSensor() {
  const float humedad = dht.readHumidity();
  const float temperatura = dht.readTemperature();
  lecturaIntentada = true;
  lecturaValida = !isnan(humedad) && !isnan(temperatura)
    && humedad >= 0 && humedad <= 100 && temperatura >= -40 && temperatura <= 80;
  if (!lecturaValida) {
    Serial.println("Error DHT22: revisar conexiones");
    publicar(TOPIC_SENSOR_STATE, "error_dht22");
    return;
  }
  temperaturaActual = temperatura;
  humedadActual = humedad;
  String mensaje = "{\"temperatura\":";
  mensaje += String(temperatura, 1);
  mensaje += ",\"humedad\":";
  mensaje += String(humedad, 1);
  mensaje += "}";
  publicar(TOPIC_SENSOR, mensaje);
  Serial.println(mensaje);
}

void setup() {
  Serial.begin(115200);
  // No esperar al monitor serie: también debe funcionar alimentado sin PC.
  digitalWrite(LED_PIN, LOW); pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW); pinMode(LED_BUILTIN, OUTPUT);
  for (uint8_t i = 0; i < 4; i++) {
    digitalWrite(MOTOR_PINS[i], LOW); pinMode(MOTOR_PINS[i], OUTPUT);
  }
  apagarSalidas();
  dht.begin();
  if (USAR_LCD) {
    lcdListo = lcd.begin(16, 2) == 0;
    if (lcdListo) lcd.print("SAFEPET iniciando");
    else Serial.println("LCD no detectado; continuando sin pantalla");
  }
  mqttClient.setId("petsafe-danielmsacl-uno-r4-01");
  mqttClient.setCleanSession(true);
  mqttClient.setConnectionTimeout(5000);
  mqttClient.setKeepAliveInterval(10000);
  mqttClient.onMessage(recibirMensaje);
}

void loop() {
  // Priorizar el apagado al detectar una pérdida de conexión.
  if (WiFi.status() != WL_CONNECTED || !mqttClient.connected()) apagarSalidas();
  moverMotor();
  // Una medición nueva cada 10 segundos; no repetir datos antiguos para guardar.
  if (millis() - ultimaLectura >= INTERVALO_DATOS) {
    ultimaLectura = millis();
    leerSensor();
  }
  if (mqttClient.connected() && millis() - ultimoEstado >= INTERVALO_ESTADOS) {
    ultimoEstado = millis();
    publicarEstados();
  }
  actualizarPantalla();
  if (WiFi.status() != WL_CONNECTED) {
    apagarSalidas();
    if (mqttClient.connected()) mqttClient.stop();
    intentoMqtt = false;
    if (!intentoWifi || millis() - ultimoWifi >= REINTENTO) {
      intentoWifi = true;
      Serial.println("Conectando WiFi...");
      WiFi.begin(SECRET_SSID, SECRET_PASS);
      ultimoWifi = millis();
    }
    return;
  }
  intentoWifi = false;
  if (!mqttClient.connected()) {
    apagarSalidas();
    if (!intentoMqtt || millis() - ultimoMqtt >= REINTENTO) {
      intentoMqtt = true;
      Serial.println("Conectando MQTT...");
      // TCP para prueba local del protocolo; web usa WSS al mismo broker.
      if (mqttClient.connect("broker.hivemq.com", 1883)) {
        const bool suscritoLed = mqttClient.subscribe(TOPIC_LED) == 1;
        const bool suscritoFan = mqttClient.subscribe(TOPIC_FAN) == 1;
        const bool suscritoConsulta = mqttClient.subscribe(TOPIC_QUERY) == 1;
        if (suscritoLed && suscritoFan && suscritoConsulta) {
          Serial.println("MQTT conectado. Esperando ordenes.");
          publicarEstados();
        } else {
          Serial.println("Error de suscripcion MQTT");
          mqttClient.stop();
        }
      } else {
        Serial.print("Error MQTT: "); Serial.println(mqttClient.connectError());
      }
      ultimoMqtt = millis();
    }
    return;
  }
  intentoMqtt = false;
  mqttClient.poll();
  moverMotor();
}
