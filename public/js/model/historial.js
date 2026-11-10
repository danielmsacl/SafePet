const EVENTOS = new Map([
  ['led_prendido', { sensor: 'LED', accion: 'encendido' }],
  ['led_apagado', { sensor: 'LED', accion: 'apagado' }],
  ['ventilador_prendido', { sensor: 'ventilador', accion: 'encendido' }],
  ['ventilador_apagado', { sensor: 'ventilador', accion: 'apagado' }],
]);

export function crearHistorial({ guardar = null, alCambiar = () => {},
  ahora = () => Date.now(), nuevoId = () => crypto.randomUUID() } = {}) {
  const filas = new Map();
  const notificar = () => alCambiar([...filas.values()].sort((a, b) => b.fecha - a.fecha).slice(0, 100));
  function limitar() {
    // Conservar las operaciones en vuelo; limitar los registros ya resueltos.
    const resueltos = [...filas.values()].filter((fila) => fila.estado !== 'pendiente')
      .sort((a, b) => b.fecha - a.fecha);
    for (const fila of resueltos.slice(100)) filas.delete(fila.id);
  }
  function agregar(datos) {
    const fila = { ...datos, id: nuevoId(), fecha: ahora(), estado: guardar ? 'pendiente' : 'sin_configurar' };
    filas.set(fila.id, fila);
    limitar(); notificar();
    if (!guardar) return;
    const { estado, ...registro } = fila;
    // El guardado asíncrono nunca bloquea ni cambia la confirmación del Arduino.
    Promise.resolve().then(() => guardar(registro)).then(() => {
      fila.estado = 'guardado';
    }).catch(() => {
      fila.estado = 'error';
    }).finally(() => { limitar(); notificar(); });
  }
  return {
    evento(mensaje) {
      const datos = EVENTOS.get(mensaje);
      if (datos) agregar(datos);
    },
    medicion({ temperatura, humedad }) {
      if (!Number.isFinite(temperatura) || !Number.isFinite(humedad)
        || temperatura < -40 || temperatura > 80 || humedad < 0 || humedad > 100) return;
      agregar({ sensor: 'DHT22', accion: 'lectura', temperatura, humedad });
    },
    cargar(registros) {
      for (const registro of registros) {
        const local = filas.get(registro.id);
        if (local) {
          // onValue puede anticipar escrituras locales: conservar pendiente hasta ACK.
          Object.assign(local, registro, { estado: local.estado });
        } else filas.set(registro.id, { ...registro, estado: 'guardado' });
      }
      limitar(); notificar();
    },
  };
}
