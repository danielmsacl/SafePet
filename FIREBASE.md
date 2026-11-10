# Activar el historial en Firebase Realtime Database

La configuración web del proyecto **petsafe-27bcf** ya está incorporada en
`public/js/firebase-config.js`. Falta comprobar en el proyecto real que están
activados el acceso anónimo y las reglas indicadas, y verificar lectura/escritura.
La configuración por sí sola no demuestra que Firebase haya aceptado un registro.
Si se cambia la configuración a `null`, la web muestra una vista temporal marcada
**sin guardar** y no envía registros a una base de datos.

## Configuración inicial

1. Abrir [Firebase Console](https://console.firebase.google.com/) y crear un proyecto.
2. Registrar una aplicación **Web** en ese proyecto. No hace falta cambiar
   GitHub Pages por Firebase Hosting ni activar Analytics para esta prueba.
3. En **Build → Realtime Database**, crear la base de datos y copiar su URL exacta.
   Elegir modo bloqueado/producción; después se publican las reglas de este repo.
4. En **Build → Authentication → Sign-in method**, activar **Anónimo**.
5. En Realtime Database → **Reglas**, pegar el contenido completo de
   `firebase/database.rules.json` y publicar esas reglas. No usar lectura/escritura
   pública (`true`). Las reglas restringen cada historial al UID autenticado.
6. En configuración del proyecto → aplicación web, copiar el objeto
   `firebaseConfig`. En `public/js/firebase-config.js`, reemplazar `null` por ese
   objeto. Incluir `databaseURL` con la URL copiada de Realtime Database:

   ```js
   export const firebaseConfig = {
     apiKey: 'VALOR_DE_FIREBASE',
     authDomain: 'TU_PROYECTO.firebaseapp.com',
     databaseURL: 'URL_EXACTA_DE_REALTIME_DATABASE',
     projectId: 'TU_PROYECTO',
     appId: 'VALOR_DE_FIREBASE'
   };
   ```

   Esa configuración web no es una clave privada de administración. No pegar
   contraseñas ni archivos de cuentas de servicio. Las reglas controlan el acceso.
7. Publicar los archivos actualizados de la web en GitHub Pages, cargar el `.ino`
   actualizado y abrir **una sola pestaña** de control.

## Funcionamiento

El Arduino publica cambios reales en `safepet/danielmsacl/uno-r4-01/eventos`:
`led_prendido`, `led_apagado`, `ventilador_prendido` o `ventilador_apagado`.
Los mensajes `/estado` siguen actualizando los botones, pero no se guardan como
acciones nuevas: sirven también para consultas y para comprobar la conexión.
Repetir una orden que ya estaba aplicada tampoco genera otro evento de cambio.

Cada **10 segundos**, el Arduino toma una nueva lectura del DHT22 y publica el
JSON de temperatura/humedad en `/sensores`. Cada lectura válida recibida genera
un registro con ambos valores. No se copian valores antiguos mediante un reloj
en el navegador. Los fallos del DHT22 no se guardan como lecturas válidas.

La web se suscribe y escribe en:

```text
usuarios / UID_ANONIMO / registros / ID_DEL_REGISTRO
```

Ejemplo de evento (fecha ilustrativa en milisegundos Unix):

```json
{
  "fecha": 1794279600000,
  "recibidaEn": 1794279599900,
  "sensor": "LED",
  "accion": "encendido",
  "dispositivo": "safepet/danielmsacl/uno-r4-01"
}
```

Una lectura tiene `sensor: "DHT22"`, `accion: "lectura"` y los campos numéricos
`temperatura` y `humedad`. La tabla presenta solo **Fecha | Sensor | Acción**;
en Acción muestra los dos valores. Se conservan como números en Firebase para
que las futuras gráficas no necesiten interpretar textos.

`fecha` se asigna con el reloj del servidor al guardar. `recibidaEn` conserva la
hora del navegador al recibir el mensaje. Ninguna representa una hora medida por
el Arduino: si hubo retraso de red, no es el instante físico exacto del cambio.
Las fechas se muestran en `America/Santiago`.

La confirmación del Arduino y la del guardado son independientes. Una fila
aparece pendiente hasta que Firebase confirma la escritura. Los rechazos se
marcan **error: no guardado**; no se presentan como datos almacenados.

## Comprobar la integración real

1. Esperar **Firebase conectado** y habilitación de los botones por el Arduino.
2. Prender el LED: comprobar una fila LED/encendido y que pase a guardado.
3. Apagarlo: comprobar otra fila LED/apagado.
4. Pulsar Consultar estado varias veces: no deben aparecer eventos adicionales.
5. Cada 10 segundos debe aparecer una fila DHT22 con una medición nueva.
6. Revisar los registros en la consola de Realtime Database.
7. Recargar la página en el mismo navegador: deben recuperarse hasta los últimos
   100 registros. La base conserva los anteriores aunque la tabla limite la vista.
8. Probar una escritura inválida y un UID distinto en el simulador de reglas de
   Firebase: las reglas deben denegar ambos casos.

## Límites de esta primera integración

- La identidad anónima persiste en ese navegador. Otro navegador o borrar sus
  datos crea otra identidad y otro historial. Más adelante se puede vincular a
  una cuenta para compartir el historial entre dispositivos.
- Mantener **una pestaña recolectora abierta**. Varias pestañas/dispositivos
  registrando los mismos mensajes crearían duplicados. Se evitan duplicados de
  los estados periódicos, no existe deduplicación entre varios recolectores.
- La web debe estar abierta y ejecutándose. Al cerrarla se pierden mensajes que
  llegue a emitir el Arduino y escrituras aún pendientes. El SDK reintenta las
  escrituras por desconexiones temporales mientras la página sigue abierta;
  un error definitivo de permisos requiere corregir la configuración. No hay
  recuperación automática de filas rechazadas.
- MQTT QoS 0 y el broker público no garantizan entrega. Un cambio sin conexión,
  incluyendo apagado de protección, no queda automáticamente registrado.
- El motor continúa sin controlador. Se envía **PWM 15/255** al encender y 0 al
  apagar. El registro acredita esa orden aplicada a D6, no una velocidad medida.

## Documentación oficial

- [Configuración web por CDN](https://firebase.google.com/docs/web/alt-setup)
- [Autenticación anónima](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Lectura y escritura en Realtime Database](https://firebase.google.com/docs/database/web/read-and-write)
- [Reglas de acceso](https://firebase.google.com/docs/database/security)
