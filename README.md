# PetSafe: monitoreo y control con Arduino UNO R4 WiFi

Esta etapa prueba botones, confirmaciones y DHT22, y prepara el historial
automático en **Firebase Realtime Database**. Para probar los botones no hace
falta configurar Firebase. Para guardar, seguir [FIREBASE.md](FIREBASE.md).
Mientras la configuración sea `null`, el historial es temporal y se marca como
**sin guardar**. No se necesita botón Guardar: las acciones se registran al
recibir el evento del Arduino y las mediciones llegan cada diez segundos.

La organización de la página web (MVC + Broker) se explica en la
[sección 6](#6-arquitectura-de-la-web-mvc--broker).

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
| DHT22 DATA | D4 |
| LED externo | D1 → resistencia de **1 kΩ** → ánodo; cátodo → GND |
| LCD 16×2 I2C VCC / GND | 5V / GND, para un módulo de 5V |
| LCD SDA / SCL | Pines **SDA / SCL** del conector de la placa (A4 / A5) |
| ULN2003 IN1 / IN2 / IN3 / IN4 | D11 / D10 / D9 / D8, respectivamente |

En un DHT22 suelto de cuatro patas normalmente se necesita una resistencia de
10 kΩ entre DATA y VCC; algunos módulos ya la incluyen. Verificar las etiquetas
o el pinout del sensor: no asumir el orden de cables de un módulo.

El LED integrado de la placa también sigue las órdenes del LED. Por eso pueden
probar los botones con solo el Arduino conectado por USB, incluso sin LED externo,
sensor o pantalla. Un DHT22 ausente genera un error de lectura, no bloquea los botones.

Se conserva **D1**, usado por su programa original, en lugar de D7 propuesto
antes. D1 también es TX de `Serial1`: no usar esa UART al mismo tiempo. El
Monitor Serie USB con `Serial` sigue disponible. El código original no define
el DHT22 ni el motor. El montaje indicado después usa **D4 para DHT22 y D8–D11
para motor**. El control anterior de D6 ya no se utiliza.

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

### Motor paso a paso con ULN2003

El diagrama aportado corresponde a un montaje tipo 28BYJ-48 con ULN2003.
Verificar las etiquetas: el código usa IN1=D11, IN2=D10, IN3=D9, IN4=D8.
Si el montaje tiene IN1=D8, IN2=D9, IN3=D10, IN4=D11, cambiar únicamente
`MOTOR_PINS` a `{8, 9, 10, 11}`. No basta con saber el rango: importa el orden.

La velocidad solicitada se interpreta ahora como **15 RPM nominales**, con
2048 pasos completos por vuelta. No es PWM 15/255. La secuencia se genera sin
bloquear una vuelta completa y no requiere otra biblioteca. Las operaciones
de red, LCD y DHT pueden introducir pausas: no se garantiza velocidad exacta.
Si vibra o pierde pasos, verificar primero el orden, alimentación y carga;
reducir `MOTOR_RPM` a 5 para la prueba inicial si es necesario.

Para el motor de 5 V mostrado, alimentar el ULN2003 con fuente externa regulada
de 5 V y unir su GND con GND del Arduino. Confirmar el voltaje en la etiqueta
del motor; existen variantes de 12 V. El motor se conecta al módulo, nunca
directamente a los pines. Al apagar se desactivan las cuatro bobinas, por lo
que no se mantiene el eje bloqueado. La confirmación MQTT indica control
activado, no velocidad o movimiento físicamente comprobados.

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

Para cambiar el canal, editar `BASE_TOPIC` en `public/js/config/dispositivo.js` y en el `.ino`.
Si agregan otra placa, usar otro prefijo y otro `mqttClient.setId(...)`.

## 4. Cómo probar la página

1. Cargar el programa al Arduino y esperar conexión MQTT en el Monitor Serie.
2. Publicar los cambios de este repositorio en la rama que usa GitHub Pages.
   Estos archivos por sí solos no actualizan el sitio remoto: requieren commit,
   push y que termine el despliegue. No hace falta cambiar de alojamiento.
   Para una prueba local también se puede usar la extensión Live Server de VS Code;
   no abrir `index.html` con `file://`, porque usa módulos JavaScript.
3. Abrir la web. Primero conecta con MQTT, se suscribe y consulta el estado.
   Los botones se habilitan al conectar con MQTT, sin esperar al Arduino.
   El estado real solo se confirma cuando llega su respuesta.
4. Pulsar **Prender LED**. Debe mostrar `Orden enviada` y `Esperando respuesta…`,
   prender el LED y luego mostrar `Apagar LED` y el estado confirmado. Repetir para apagar.
5. Comprobar el orden IN1–IN4 y probar Prender/Apagar motor: debe girar
   el paso a paso y desactivar sus bobinas al apagar.
6. Temperatura y humedad deben aparecer en web y LCD cada diez segundos.
7. Desconectar el Arduino: después de unos 16 segundos el indicador **Arduino** pasa a
   "Sin mensajes recientes" y los controles a estado desconocido, pero se pueden
   enviar nuevas órdenes si el broker sigue conectado.
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

## 6. Arquitectura de la web (MVC + Broker)

La solución combina dos patrones con responsabilidades distintas:

- **Broker (publicar/suscribir).** HiveMQ (`broker.hivemq.com`) es el intermediario
  que recibe y distribuye los mensajes. **MQTT es el protocolo**; el broker es el
  servicio. Arduino y la página no se conocen ni se conectan entre sí: ambos se
  conectan al broker (Arduino por TCP 1883, la web por WebSocket seguro 8884) y
  publican o se suscriben a los temas de la sección 3. A diferencia del "broker de
  objetos" clásico, aquí no se invoca un servicio remoto con respuesta directa: el
  broker reenvía mensajes a los suscriptores, y la respuesta del Arduino es otro
  mensaje publicado en un tema de estado.
- **MVC en la página.** Organiza el estado, las reglas, la presentación y la
  coordinación dentro del navegador. La página reacciona a eventos (clics y
  mensajes MQTT); por eso también tiene un **comportamiento dirigido por eventos**,
  sin infraestructura adicional: el Arduino publica un evento solo cuando cambia
  una salida y la web lo guarda en Firebase.

No existe un backend propio. La página abierta recibe los mensajes MQTT y escribe
en Firebase Realtime Database mediante su SDK web (servicio administrado; no hay
funciones serverless propias).

### Carpetas de `public/js/`

| Carpeta | Responsabilidad |
| --- | --- |
| `config/` | Contrato con el dispositivo (`BASE_TOPIC`, URL del broker, actuadores, tiempos) y configuración web pública de Firebase. |
| `models/` | Estado y reglas, sin DOM: `actuador.js` (estado confirmado, solicitado y orden pendiente), `mediciones.js` (única validación de rangos, datos antiguos), `dispositivo.js` (último contacto con el Arduino), `historial.js` (registros, estado de guardado, límite de 100, filtro local). |
| `views/` | Dibujan el panel y el historial y entregan clics al controlador. No importan servicios ni modelos y no deciden reglas; contienen los textos visibles. |
| `controllers/` | `panel-controlador.js` coordina MQTT, modelos, temporizadores y vista; `historial-controlador.js` conecta el modelo del historial con Firebase y su vista. Reciben servicios y vistas por parámetro. |
| `services/` | `mqtt-client.js` (conexión al broker, suscripciones, publicación sin retención) y `firebase-db.js` (autenticación anónima, lectura de los últimos 100 y escritura). Sin DOM. |
| `main.js` | Punto de entrada: crea una vez cada servicio, vista y controlador y los conecta. |

`tests/arquitectura.test.js` comprueba estas dependencias (por ejemplo, que
modelos y servicios no usen el DOM y que las vistas no importen servicios).

### Recorrido de una medición

1. El Arduino lee el DHT22 cada 10 s y publica `{"temperatura":…,"humedad":…}` en `…/sensores`.
2. El broker HiveMQ lo entrega a la página suscrita (servicio MQTT).
3. El controlador del panel pide al modelo `mediciones.js` que lo valide. Un mensaje inválido se descarta.
4. La vista muestra los valores y la hora de recepción; el modelo `dispositivo.js` registra el contacto.
5. El controlador entrega la medición al modelo del historial, que crea una fila **pendiente**
   y llama al servicio Firebase.
6. Firebase guarda en `usuarios/UID/registros/ID` con fecha del servidor. Solo su
   confirmación cambia la fila a **guardado**; un rechazo la deja en **error: no guardado**.
7. Si pasan más de 16 s sin lecturas, los últimos valores se marcan como antiguos.

### Recorrido de una orden

1. El usuario pulsa **Prender LED**. La vista avisa al controlador.
2. El modelo `actuador.js` calcula la orden (`prender_led`) y la deja pendiente.
3. El servicio MQTT la publica en `…/led` (QoS 0, sin retención). La vista muestra
   **Orden enviada**: todavía no es un control confirmado.
4. El broker la entrega al Arduino, que cambia la salida y publica `led_prendido` en
   `…/led/estado` y, por ser un cambio real, en `…/eventos`.
5. El estado confirma la orden en el modelo (**confirmado por Arduino**). El evento
   genera un registro en el historial y su guardado en Firebase se muestra aparte.
6. Sin respuesta en 7 s, la orden vence y el estado queda desconocido, sin suponer
   el resultado. Los estados periódicos y las consultas no crean registros.

### Ejecutar y probar la web

- Pruebas: `npm test` (Node.js 20 o superior, sin instalar dependencias). Simulan
  transporte, DOM, reloj y SDK de Firebase.
- Página local: servir la carpeta del repositorio por HTTP (por ejemplo, Live Server
  de VS Code) y abrir `index.html`. No usar `file://`, porque usa módulos JavaScript.
  Una página local se conecta al broker y a Firebase reales: si el Arduino está
  encendido, los botones lo accionan.
- Publicación: GitHub Pages sirve la raíz de la rama configurada. Todas las rutas
  son relativas; basta con commit y push y esperar el despliegue.

### Limitaciones y evolución futura

- La pestaña abierta es el único recolector: si se cierra, se pierden los mensajes
  y escrituras pendientes. Un historial continuo requiere un receptor permanente o
  envío directo desde el dispositivo.
- Dos clientes (dos pestañas, o la web y una futura app) que escriban los mismos
  eventos duplicarían registros: no hay identificador de mensaje ni deduplicación.
- El UID anónimo pertenece a este navegador. Una app móvil obtendrá otro UID, por lo
  que compartir el proyecto Firebase **no basta** para ver el mismo historial; haría
  falta vincular cuentas o cambiar el modelo de acceso.
- Para una app futura se pueden reutilizar `config/`, `models/` y los servicios; las
  vistas son específicas de esta página. Ninguna de estas decisiones cambia en esta etapa.

## Verificación de software

Con Node.js instalado: `npm test` (sin instalar dependencias). Las pruebas simulan
el transporte y el tiempo para verificar confirmaciones, desconexiones, mensajes
inválidos, expiración, historial y dependencias entre capas. No sustituyen compilar
el sketch con las bibliotecas del Arduino IDE ni verificar el montaje físico.

Validación de la reorganización MVC: **31 pruebas JavaScript aprobadas**, más
pruebas de navegador con MQTT y Firebase **simulados** (carga sin errores, contrato
MQTT, reconexión, datos antiguos, guardado/error, filtro, teclado, escritorio y móvil).
El firmware no cambió en esta etapa. En la etapa anterior el sketch se compiló
correctamente para `arduino:renesas_uno:unor4wifi`, con el núcleo UNO R4 1.6.0,
ArduinoMqttClient 0.1.8, DHT sensor library 1.4.7, Adafruit Unified Sensor 1.1.15
y hd44780 1.3.2, con credenciales ficticias y sin subirlo a una placa. La prueba
física, la conexión completa web–broker–Arduino y la validación en un proyecto
Firebase real siguen pendientes.

## Referencias

- [UNO R4 WiFi](https://docs.arduino.cc/hardware/uno-r4-wifi/)
- [ArduinoMqttClient y ejemplo WiFi](https://github.com/arduino-libraries/ArduinoMqttClient/tree/master/examples/WiFiAdvancedCallback)
- [DHT22 y biblioteca Adafruit](https://learn.adafruit.com/dht/using-a-dhtxx-sensor-with-arduino)
- [LCD hd44780](https://github.com/duinoWitchery/hd44780)
- [Control de motor con transistor](https://docs.arduino.cc/learn/electronics/transistor-motor-control/)
- [Puertos y condiciones del broker de prueba](https://www.mqtt-dashboard.com/)
