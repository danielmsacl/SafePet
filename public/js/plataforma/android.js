// Adaptación de plataforma para la app Android (Capacitor). En el navegador no cambia nada.
// No contiene reglas de negocio: solo detecta la plataforma y avisa cuando la app vuelve al primer plano.

// Capacitor inyecta window.Capacitor dentro de la app; en GitHub Pages no existe.
export function esAppNativa(global = globalThis) {
  return Boolean(global.Capacitor?.isNativePlatform?.());
}

export function nombrePlataforma(global = globalThis) {
  return esAppNativa(global) ? 'android' : 'web';
}

// Android oculta el WebView al minimizar la app (visibilitychange). Al volver se informa cuánto
// tiempo estuvo oculta. Un solo listener por página: rotar la pantalla no recrea la actividad.
export function alVolverAlPrimerPlano(doc, accion, ahora = () => Date.now()) {
  let ocultaDesde = null;
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') {
      ocultaDesde = ahora();
    } else if (ocultaDesde !== null) {
      const msOculta = ahora() - ocultaDesde;
      ocultaDesde = null;
      accion(msOculta);
    }
  });
}
