// Contacto con el Arduino: instante del último mensaje válido del contrato (estado, medición o error).
// La conexión con el broker no basta: solo un mensaje del Arduino indica que está respondiendo.
export function crearEnlaceDispositivo() {
  return {
    ultimo: null,
    registrar(ahora) {
      this.ultimo = ahora;
    },
    olvidar() {
      this.ultimo = null;
    },
    // 'sin_datos': nada recibido en esta conexión; 'activo': mensaje reciente; 'silencioso': dejó de enviar.
    estado(ahora, limite) {
      if (this.ultimo === null) return 'sin_datos';
      return ahora - this.ultimo > limite ? 'silencioso' : 'activo';
    },
  };
}
