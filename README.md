# PetSafe: primera prueba con Arduino UNO R4 WiFi

Esta etapa prueba botones, confirmaciones y DHT22, y prepara el historial
automático en **Firebase Realtime Database**. Para probar los botones no hace
falta configurar Firebase. Para guardar, seguir [FIREBASE.md](FIREBASE.md).
Mientras la configuración sea `null`, el historial es temporal y se marca como
**sin guardar**. No se necesita botón Guardar: las acciones se registran al
recibir el evento del Arduino y las mediciones llegan cada diez segundos.

## 1. Programa que debe cargar el compañero

Abrir **arduino/PetSafe/PetSafe.ino** en Arduino IDE. Es el programa completo,
no un fragmento para pegar dentro de otro `setup()` o `loop()`.

Esta versión incorpora los datos del código original que compartieron: **LED en
D1** y **LCD I2C en 0x27**. Sustituir el sketch completo. Mantiene WiFiS3, pero
utiliza **ArduinoMqttClient en lugar de PubSubClient** y **hd44780 en lugar de
LiquidCrystal_I2C**. No mezclar las funciones de las dos versiones: las APIs son
distintas. ArduinoMqttClient permite descartar órdenes retenidas antiguas;
hd44780 comprueba la inicialización y permite continuar sin un LCD detectado.

En el original faltaban las confirmaciones MQTT, la lectura del DHT22 y el
control del ventilador; además escuchaba el tema antiguo `safepet/led`. El
programa entregado usa los mismos temas y mensajes que la página actual.
Se eliminó la prueba HTTP a `example.com`: no verifica MQTT y añade esperas.
Un fallo de WiFi ya no detiene el programa para siempre; se realizan reintentos
espaciados, sin bucles de espera indefinidos. Las llamadas de conexión de las
bibliotecas todavía pueden tardar unos segundos.

1. Instalar el paquete de placas **Arduino UNO R4 Boards** desde el gestor de placas.
2. Seleccionar **Arduino UNO R4 WiFi** y el puerto USB correspondiente.
3. En el gestor de bibliotecas instalar:
   - **ArduinoMqttClient**, de Arduino.
   - **DHT sensor library**, de Adafruit, y **Adafruit Unified Sensor**.
   - **hd44780**, de Bill Perry (no confundir con LiquidCrystal_I2C).
   `WiFiS3` y `Wire` vienen con el soporte de la placa.
4. Copiar `arduino_secrets.h.example` como `arduino_secrets.h`, dentro de la misma
   carpeta que el `.ino`. Reemplazar los dos valores:

   ```cpp
   #pragma once
   #define SECRET_SSID "NOMBRE_DE_TU_WIFI"
   #define SECRET_PASS "CLAVE_DE_TU_WIFI"
   ```

   Usar una red WiFi de **2,4 GHz**, con acceso a Internet y sin portal de inicio
   de sesión. El archivo con la clave está ignorado por Git: no subirlo a GitHub.
5. Pulsar **Verificar** y luego **Subir**. Abrir Monitor Serie a **115200 baudios**.
6. Debe aparecer `MQTT conectado. Esperando ordenes.`. Si no aparece, revisar los
   mensajes de WiFi/MQTT antes de probar la página.

## 2. Conexiones propuestas

Hacer las conexiones con la alimentación desconectada. Estos son los pines del
programa entregado; si ya tienen otro cableado, modificar sus constantes.

| Componente | Conexión al UNO R4 WiFi |
| --- | --- |
| DHT22 VCC | 5V |
| DHT22 GND | GND |
| DHT22 DATA | D2 |
| LED externo | D1 → resistencia de **1 kΩ** → ánodo; cátodo → GND |
| LCD 16×2 I2C VCC / GND | 5V / GND, para un módulo de 5V |
| LCD SDA / SCL | Pines **SDA / SCL** del conector de la placa (A4 / A5) |
| Control de ventilador | D6: por ahora **sin motor conectado** |

En un DHT22 suelto de cuatro patas normalmente se necesita una resistencia de
10 kΩ entre DATA y VCC; algunos módulos ya la incluyen. Verificar las etiquetas
o el pinout del sensor: no asumir el orden de cables de un módulo.

El LED integrado de la placa también sigue las órdenes del LED. Por eso pueden
probar los botones con solo el Arduino conectado por USB, incluso sin LED externo,
sensor o pantalla. Un DHT22 ausente genera un error de lectura, no bloquea los botones.

Se conserva **D1**, usado por su programa original, en lugar de D7 propuesto
antes. D1 también es TX de `Serial1`: no usar esa UART al mismo tiempo. El
Monitor Serie USB con `Serial` sigue disponible. El código original no define
el DHT22 ni el motor: **D2 y D6 son pines propuestos**, deben coincidir con su montaje.

El LCD conserva la dirección **0x27** del código original (`LCD_ADDRESS`) y
detecta la configuración de adaptadores compatibles PCF8574/MCP23008.
Si no se detecta, el programa continúa sin él. Para probar sin
pantalla, poner `USAR_LCD = false`; sus bibliotecas siguen siendo necesarias.
Si se ilumina pero no muestra texto, ajustar el potenciómetro de contraste. Si
persiste, ejecutar el ejemplo de la biblioteca `hd44780_I2Cexp/I2CexpDiag`.
Usar SDA/SCL del conector principal, **no el conector Qwiic de 3,3 V** para un LCD de 5 V.
La primera fila muestra `SAFEPET ONLINE`, `SAFEPET SIN WIFI` o `SAFEPET SIN MQTT`;
la segunda, temperatura y humedad (o `Error DHT22`). La pantalla se actualiza
sin borrar todo el LCD en cada vuelta del programa.

### Motor pendiente de controlador

**No conectar el motor a D6 ni alimentarlo desde ese pin.** Todavía falta conocer
el voltaje y la corriente del motor para seleccionar un controlador de motor o
una etapa con MOSFET/transistor adecuada, protección y alimentación apropiada.
Para un motor DC de escobillas con transistor se necesita protección contra la
tensión inductiva (habitualmente un diodo de rueda libre).

La señal de D6 usa PWM de 8 bits: **15 de 255** al encender y **0** al apagar.
Esto equivale aproximadamente a 5,9 % de ciclo útil, no a 15 % ni a una velocidad
medida. Con ese valor bajo, el motor podría no arrancar. Está definido en `FAN_PWM`.
Se necesita un controlador compatible con PWM; un relé mecánico no sirve para
regular velocidad así. Un módulo activo en bajo requerirá adaptar la lógica. El driver debe
mantener el motor apagado también durante el reinicio de la placa.
Por ahora comprobar `Salida D6 PWM: 15` / `Salida D6 PWM: 0` en el Monitor Serie;
opcionalmente usar **otro LED con resistencia de 1 kΩ** en D6 para visualizarla.
`ventilador_prendido` confirma la salida del programa, no el giro de un motor.

## 3. Mensajes EXACTOS

Broker de prueba: **broker.hivemq.com**. Arduino usa TCP, puerto **1883**.
La web usa **wss://broker.hivemq.com:8884/mqtt**. Son transportes distintos hacia
el mismo broker; no poner la URL WebSocket en `mqttClient.connect()` del Arduino.
El broker es el servicio intermediario en Internet, no otro componente que
tengan que conectar físicamente al Arduino.

**El prefijo cambió respecto de la página original.** Se usa un canal del equipo
para reducir cruces accidentales. Web y Arduino deben usar exactamente el mismo.

| Dirección | Tema completo | Mensaje exacto |
| --- | --- | --- |
| Web → Arduino | `safepet/danielmsacl/uno-r4-01/led` | `prender_led` |
| Web → Arduino | `safepet/danielmsacl/uno-r4-01/led` | `apagar_led` |
| Arduino → web | `safepet/danielmsacl/uno-r4-01/led/estado` | `led_prendido` |
| Arduino → web | `safepet/danielmsacl/uno-r4-01/led/estado` | `led_apagado` |
| Web → Arduino | `safepet/danielmsacl/uno-r4-01/ventilador` | `prender_ventilador` |
| Web → Arduino | `safepet/danielmsacl/uno-r4-01/ventilador` | `apagar_ventilador` |
| Arduino → web | `safepet/danielmsacl/uno-r4-01/ventilador/estado` | `ventilador_prendido` |
| Arduino → web | `safepet/danielmsacl/uno-r4-01/ventilador/estado` | `ventilador_apagado` |
| Web → Arduino | `safepet/danielmsacl/uno-r4-01/consulta` | `consultar_estado` |
| Arduino → web | `safepet/danielmsacl/uno-r4-01/sensores` | `{"temperatura":26.4,"humedad":58.0}` (ejemplo) |
| Arduino → web | `safepet/danielmsacl/uno-r4-01/sensor/estado` | `error_dht22` |
| Arduino → web → Firebase | `safepet/danielmsacl/uno-r4-01/eventos` | `led_prendido`, `led_apagado`, `ventilador_prendido` o `ventilador_apagado` (uno por cambio) |

Temperatura en °C y humedad relativa en %. Texto UTF-8, minúsculas, sin espacios
extra ni salto de línea. Todos los mensajes usan **retain=false**, **QoS 0**;
no se guardan órdenes para ejecutarlas al reconectar. La web espera las respuestas
del Arduino; el envío al broker no basta para confirmar una acción.

Para cambiar el canal, editar `BASE_TOPIC` en `public/js/config.js` y en el `.ino`.
Si agregan otra placa, usar otro prefijo y otro `mqttClient.setId(...)`.

## 4. Cómo probar la página

1. Cargar el programa al Arduino y esperar conexión MQTT en el Monitor Serie.
2. Publicar los cambios de este repositorio en la rama que usa GitHub Pages.
   Estos archivos por sí solos no actualizan el sitio remoto: requieren commit,
   push y que termine el despliegue. No hace falta cambiar de alojamiento.
   Para una prueba local también se puede usar la extensión Live Server de VS Code;
   no abrir `index.html` con `file://`, porque usa módulos JavaScript.
3. Abrir la web. Primero conecta con MQTT, se suscribe y consulta el estado.
   **MQTT conectado no significa Arduino conectado:** esperar la confirmación de
   sus salidas y que los botones se habiliten.
4. Pulsar **Prender led**. Debe mostrar `Esperando respuesta…`, prender el LED y
   luego mostrar `Apagar led` y el estado confirmado. Repetir para apagar.
5. Probar **Prender ventilador** y **Apagar ventilador**, con el motor desconectado.
   Comprobar el Monitor Serie o el LED de prueba de D6.
6. Temperatura y humedad deben aparecer en web y LCD cada diez segundos.
7. Desconectar el Arduino: la web debe bloquear sus controles después de unos
   16 segundos sin estados nuevos, aunque el broker siga conectado.
8. Reconectar el Arduino: arranca con ambas salidas apagadas y la web debe
   recuperar su estado. Recargar la web también debe recuperar el estado actual.

Las órdenes sin respuesta vencen después de siete segundos: la web avisa que
no hubo confirmación, sin asumir que la salida está apagada. `Consultar estado`
permite volver a sincronizar; los estados también se publican cada cinco segundos.

La placa apaga sus salidas **cuando detecta** pérdida de WiFi/MQTT; detectar una
interrupción puede tardar. Cerrar la pestaña **no** apaga el dispositivo. Esta es
una prueba supervisada de comunicación, no un sistema de protección autónomo.

## 5. Alcance y siguiente etapa

- Broker público y sin autenticación, solo para esta prueba académica de MQTT.
  El prefijo propio no es una contraseña. No enviar datos sensibles ni usarlo
  como control permanente del entorno de una mascota.
- La conexión TCP del Arduino es sin cifrar en esta prueba.
- Probar con una placa y una pestaña de control a la vez. Los mensajes simples
  confirman estados, no llevan un identificador único de cada solicitud.
- La base de datos registra `/eventos`, no cada estado periódico. Para varios
  recolectores simultáneos harían falta identificadores y deduplicación.
- El historial continuo requerirá un receptor permanente o envío directo desde
  el dispositivo. La pestaña abierta no debe ser su único recolector definitivo.

## Verificación de software

Con Node.js instalado: `npm test` (sin instalar dependencias). Las pruebas simulan
el transporte y el tiempo para verificar confirmaciones, desconexiones, mensajes
inválidos y expiración. No sustituyen compilar el sketch con las bibliotecas del
Arduino IDE ni verificar el montaje físico.

Validación realizada: **18 pruebas JavaScript aprobadas** y sketch compilado
correctamente para `arduino:renesas_uno:unor4wifi`, con el núcleo UNO R4 1.6.0,
ArduinoMqttClient 0.1.8, DHT sensor library 1.4.7, Adafruit Unified Sensor 1.1.15
y hd44780 1.3.2.
Se compiló con credenciales ficticias, sin subirlo a una placa. Las pruebas de
Firebase usan un SDK simulado: verifican las rutas, fechas y confirmaciones, no
una base real ni la aplicación de sus reglas. La prueba física, la conexión
completa web–broker–Arduino y la validación en un proyecto Firebase siguen pendientes.

## Referencias

- [UNO R4 WiFi](https://docs.arduino.cc/hardware/uno-r4-wifi/)
- [ArduinoMqttClient y ejemplo WiFi](https://github.com/arduino-libraries/ArduinoMqttClient/tree/master/examples/WiFiAdvancedCallback)
- [DHT22 y biblioteca Adafruit](https://learn.adafruit.com/dht/using-a-dhtxx-sensor-with-arduino)
- [LCD hd44780](https://github.com/duinoWitchery/hd44780)
- [Control de motor con transistor](https://docs.arduino.cc/learn/electronics/transistor-motor-control/)
- [Puertos y condiciones del broker de prueba](https://www.mqtt-dashboard.com/)
