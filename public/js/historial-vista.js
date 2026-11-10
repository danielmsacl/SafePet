import { firebaseConfig } from './firebase-config.js';
import { crearFirebase } from './model/firebase-db.js';
import { crearHistorial } from './model/historial.js';

export function iniciarHistorial(doc = document) {
  const estado = doc.getElementById('estado-base-datos');
  const cuerpo = doc.getElementById('filas-historial');
  const resumen = doc.getElementById('resumen-guardado');
  const fecha = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium',
  });
  function mostrar(filas) {
    cuerpo.replaceChildren();
    for (const fila of filas) {
      const tr = doc.createElement('tr');
      let accion = fila.accion === 'lectura'
        ? `Temperatura: ${fila.temperatura} °C; humedad: ${fila.humedad} %` : fila.accion;
      const etiquetas = { pendiente: 'pendiente de guardar', error: 'error: no guardado', sin_configurar: 'sin guardar' };
      if (etiquetas[fila.estado]) accion += ` (${etiquetas[fila.estado]})`;
      for (const texto of [fecha.format(fila.fecha), fila.sensor, accion]) {
        const td = doc.createElement('td'); td.textContent = texto; tr.append(td);
      }
      cuerpo.append(tr);
    }
    const contar = (tipo) => filas.filter((fila) => fila.estado === tipo).length;
    resumen.textContent = `${contar('guardado')} guardados · ${contar('pendiente')} pendientes · ${contar('error') + contar('sin_configurar')} sin guardar. Se muestran hasta 100 registros.`;
  }
  let historial;
  const base = firebaseConfig ? crearFirebase(firebaseConfig, {
    alEstado: (mensaje) => { estado.textContent = mensaje; },
    alDatos: (filas) => historial.cargar(filas),
  }) : null;
  historial = crearHistorial({ guardar: base ? (fila) => base.guardar(fila) : null, alCambiar: mostrar });
  if (base) base.conectar().catch(() => {
    estado.textContent = 'No se pudo iniciar Firebase. Revisa la configuración, la autenticación anónima y las reglas.';
  });
  else estado.textContent = 'Firebase aún no está configurado. Esta vista es temporal: NO se está guardando en la base de datos.';
  return historial;
}
