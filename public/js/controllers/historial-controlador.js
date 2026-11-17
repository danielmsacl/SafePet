import { crearHistorial, resumirGuardado, filtrarPorSensor } from '../models/historial.js';

// Controlador del historial: conecta el modelo con el servicio de persistencia y con la vista.
// `crearBase` recibe los avisos del servicio; es null cuando Firebase no está configurado.
// Devuelve el modelo para que el controlador del panel le entregue eventos y mediciones.
export function iniciarControladorHistorial({ vista, crearBase = null }) {
  let historial;
  let filas = [];
  let sensor = '';

  // El filtro trabaja sobre los registros ya cargados; no cambia la consulta a Firebase.
  function dibujar() {
    const visibles = filtrarPorSensor(filas, sensor);
    vista.mostrar(visibles, { ...resumirGuardado(filas), total: filas.length, filtrado: Boolean(sensor) });
  }

  const base = crearBase ? crearBase({
    alEstado: (codigo) => vista.estadoBase(codigo),
    alDatos: (registros) => historial.cargar(registros),
  }) : null;
  historial = crearHistorial({
    guardar: base ? (registro) => base.guardar(registro) : null,
    alCambiar: (nuevas) => { filas = nuevas; dibujar(); },
  });
  vista.alFiltrar((valor) => { sensor = valor; dibujar(); });
  // Con Firebase, el estado vacío se muestra cuando llega la primera respuesta (aunque esté vacía).
  if (base) {
    base.conectar().catch((error) => {
      vista.estadoBase(error?.codigo === 'error_carga' ? 'error_carga' : 'error_inicio');
      dibujar();
    });
  } else {
    vista.estadoBase('sin_configurar');
    dibujar();
  }
  return historial;
}
