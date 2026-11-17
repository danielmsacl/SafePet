// Vista del historial: tabla Fecha | Sensor | Acción, estado de guardado, filtro y estado de Firebase.
// No crea servicios ni modelos; solo presenta lo que entrega el controlador.
const ESTADOS_BASE = {
  conectando: ['espera', 'Conectando con Firebase…'],
  // La conexión no prueba que una escritura fue aceptada: cada fila muestra su propio guardado.
  conectado: ['ok', 'Conexión activa. Cada registro indica si ya fue guardado.'],
  sin_conexion: ['aviso', 'Sin conexión con Firebase. No cierres la página ni la app si hay registros pendientes.'],
  error_lectura: ['error', 'No se pudo leer el historial. Revisa las reglas de Firebase.'],
  error_carga: ['error', 'No se pudo cargar Firebase. Revisa la conexión a Internet y vuelve a abrir la página o la app.'],
  error_inicio: ['error','No se pudo iniciar Firebase. Revisa la configuración, la autenticación anónima y las reglas.'],
  sin_configurar: ['aviso', 'Firebase aún no está configurado. Esta vista es temporal: NO se está guardando en la base de datos.'],
};

const GUARDADO = {
  guardado: 'guardado',
  pendiente: 'pendiente de guardar',
  error: 'error: no guardado',
  sin_configurar: 'sin guardar',
};

// En los datos el motor conserva el nombre "ventilador" del contrato MQTT.
const SENSORES = { ventilador: 'Motor', LED: 'LED', DHT22: 'DHT22' };

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function crearVistaHistorial(doc) {
  const indicador = doc.getElementById('indicador-base');
  const estado = doc.getElementById('estado-base-datos');
  const cuerpo = doc.getElementById('filas-historial');
  const resumen = doc.getElementById('resumen-guardado');
  const filtro = doc.getElementById('filtro-historial');
  // Fecha del servidor si ya se guardó; fecha de recepción mientras está pendiente. Hora de Chile.
  const fecha = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium',
  });

  function celda(tr, texto) {
    const td = doc.createElement('td');
    td.textContent = texto;
    tr.append(td);
    return td;
  }

  function filaVacia(texto) {
    const tr = doc.createElement('tr');
    const td = celda(tr, texto);
    td.colSpan = 3;
    td.className = 'vacio';
    cuerpo.append(tr);
  }

  return {
    estadoBase(codigo) {
      const [color, texto] = ESTADOS_BASE[codigo];
      if (estado.textContent !== texto) estado.textContent = texto;
      indicador.setAttribute('data-estado', color);
    },

    alFiltrar(accion) {
      filtro.addEventListener('change', () => accion(filtro.value));
    },

    mostrar(filas, { guardados, pendientes, sinGuardar, total, filtrado }) {
      cuerpo.replaceChildren();
      for (const fila of filas) {
        const tr = doc.createElement('tr');
        // Día y hora en piezas separadas para que en móvil la hora pase a otra línea.
        const [dia, hora = ''] = fecha.format(fila.fecha).split(', ');
        const cFecha = celda(tr, '');
        for (const [clase, parte] of [['fecha-dia', hora ? `${dia},` : dia], ['fecha-hora', hora]]) {
          const span = doc.createElement('span');
          span.className = clase;
          span.textContent = parte;
          cFecha.append(span, ' ');
        }
        celda(tr, SENSORES[fila.sensor] ?? fila.sensor);
        const accion = celda(tr, fila.accion === 'lectura'
          ? `Temperatura: ${fila.temperatura} °C; humedad: ${fila.humedad} %` : fila.accion);
        const marca = doc.createElement('span');
        marca.className = 'guardado';
        marca.setAttribute('data-estado', fila.estado);
        marca.textContent = GUARDADO[fila.estado] ?? fila.estado;
        accion.append(' ', marca);
        cuerpo.append(tr);
      }
      if (!filas.length) {
        filaVacia(total ? 'No hay registros de este componente entre los últimos 100 cargados.'
          : 'Aún no hay registros. Aparecerán cuando el Arduino informe un cambio o una medición.');
      }
      const visibles = filtrado ? ` Se muestran ${filas.length} de ${total} por el filtro.` : '';
      resumen.textContent = total
        ? `${total === 1 ? 'Último registro' : `Últimos ${total} registros`} (máximo 100): ${plural(guardados, 'guardado', 'guardados')}, ${plural(pendientes, 'pendiente', 'pendientes')}, ${sinGuardar} sin guardar.${visibles}`
        : 'Sin registros cargados.';
    },
  };
}
